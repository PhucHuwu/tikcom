import { giftNameVi } from '@shared/gifts';
import type { LiveToken, LiveUser } from '@shared/types';
import { api } from '../lib/api';
import type { LiveSource, SourceEvent, SourceHandlers, Timer } from './source';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const OFFLINE_RETRY_MS = 30_000;
const MAX_BACKOFF_MS = 60_000;
/** Combo quà không nhận được tín hiệu kết thúc sau khoảng này thì coi như đã kết thúc */
const STREAK_TIMEOUT_MS = 8_000;

/** Mã đóng kết nối của Euler Stream WebSocket */
const CLOSE = {
  NOT_LIVE: 4404,
  STREAM_END: 4005,
  NO_MESSAGES: 4006,
  INVALID_AUTH: 4401,
  NO_PERMISSION: 4403,
  TOO_MANY: 4429,
  INVALID_OPTIONS: 4400,
  MAX_LIFETIME: 4555,
} as const;

function toUser(u: Any): LiveUser {
  const id = String(u?.userId ?? u?.uniqueId ?? 'unknown');
  const name = String(u?.nickname || u?.uniqueId || 'Ẩn danh');
  const avatar = u?.profilePicture?.url?.[0] ?? undefined;
  return { id, name, avatar };
}

/**
 * Kết nối thẳng từ trình duyệt tới Euler Stream. Máy chủ TikCom chỉ cấp JWT ngắn hạn
 * cho đúng kênh cần xem, nên API key không bao giờ tới trình duyệt.
 */
export class EulerSource implements LiveSource {
  private ws: WebSocket | null = null;
  private stopped = true;
  private retryTimer: Timer | null = null;
  private attempt = 0;
  private streaks = new Map<string, Timer>();

  constructor(
    private readonly username: string,
    private readonly on: SourceHandlers,
  ) {}

  async start() {
    this.stopped = false;
    this.attempt = 0;
    await this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    for (const t of this.streaks.values()) clearTimeout(t);
    this.streaks.clear();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = ws.onmessage = ws.onerror = null;
      ws.close(1000);
    }
  }

  private retry(delay: number, state: 'reconnecting' | 'waiting', message: string) {
    if (this.stopped) return;
    this.on.status({ state, message });
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, delay);
  }

  private backoff(message: string) {
    this.attempt++;
    const delay = Math.min(3000 * 2 ** (this.attempt - 1), MAX_BACKOFF_MS);
    this.retry(delay, 'reconnecting', `${message}. Thử lại sau ${Math.round(delay / 1000)} giây...`);
  }

  private async connect() {
    if (this.stopped) return;
    this.on.status({ state: this.attempt === 0 ? 'connecting' : 'reconnecting', message: `Đang kết nối tới @${this.username}...` });

    let token: LiveToken;
    try {
      token = await api<LiveToken>('/api/live/token', { method: 'POST', body: { username: this.username } });
    } catch (err) {
      if (this.stopped) return;
      const msg = err instanceof Error ? err.message : String(err);
      // Lỗi cấu hình hoặc chưa đăng nhập thì thử lại cũng vô ích
      if (/chưa cấu hình|không phải username|đăng nhập/i.test(msg)) {
        this.stopped = true;
        this.on.status({ state: 'idle', message: msg });
        throw err;
      }
      this.backoff(`Không lấy được quyền kết nối: ${msg}`);
      return;
    }
    if (this.stopped) return;

    const ws = new WebSocket(token.url);
    this.ws = ws;
    ws.onmessage = (m) => {
      if (this.ws !== ws) return;
      try {
        const payload = JSON.parse(String(m.data)) as { messages?: { type: string; data: Any }[] };
        for (const msg of payload.messages ?? []) this.handle(msg.type, msg.data);
      } catch (err) {
        console.warn('[euler] không đọc được dữ liệu', err);
      }
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.onClose(e.code, e.reason);
    };
  }

  private onClose(code: number, reason: string) {
    if (this.stopped) return;
    switch (code) {
      case CLOSE.NOT_LIVE:
        this.attempt = 0;
        return this.retry(OFFLINE_RETRY_MS, 'waiting', `@${this.username} chưa livestream. Tự kiểm tra lại sau 30 giây...`);
      case CLOSE.STREAM_END:
        this.on.event({ kind: 'streamEnd' });
        this.attempt = 0;
        return this.retry(OFFLINE_RETRY_MS, 'waiting', 'Buổi live đã kết thúc. Đang chờ buổi live tiếp theo...');
      case CLOSE.TOO_MANY:
        return this.retry(OFFLINE_RETRY_MS, 'reconnecting', 'Gói Euler Stream đang mở quá nhiều kết nối (có thể do thiết bị khác). Thử lại sau 30 giây...');
      case CLOSE.INVALID_OPTIONS:
        this.stopped = true;
        return this.on.status({ state: 'idle', message: `Euler Stream từ chối kết nối: ${reason || 'thông tin không hợp lệ'}` });
      case CLOSE.MAX_LIFETIME:
      case CLOSE.NO_MESSAGES:
        this.attempt = 0;
        return this.retry(500, 'reconnecting', 'Đang làm mới kết nối...');
      default:
        return this.backoff(reason ? `Mất kết nối (${reason})` : 'Mất kết nối');
    }
  }

  private handle(type: string, d: Any) {
    switch (type) {
      case 'roomInfo':
        if (d?.roomInfo?.id) this.on.status({ state: 'connecting', message: `Đã tìm thấy phòng live của @${this.username}...`, roomId: String(d.roomInfo.id) });
        return;
      case 'tiktok.connect':
        this.attempt = 0;
        this.on.status({ state: 'connected', message: `Đã kết nối @${this.username}` });
        return;
      case 'WebcastChatMessage': {
        const text = String(d.comment ?? '').trim();
        if (text) this.on.event({ kind: 'chat', user: toUser(d.user), text });
        return;
      }
      case 'WebcastGiftMessage':
        return this.onGift(d);
      case 'WebcastSocialMessage': {
        const key = String(d.common?.displayText?.key ?? '');
        if (key.includes('follow')) this.on.event({ kind: 'follow', user: toUser(d.user) });
        else if (key.includes('share')) this.on.event({ kind: 'share', user: toUser(d.user) });
        return;
      }
      case 'WebcastMemberMessage':
        if (d.user) this.on.event({ kind: 'member', user: toUser(d.user) });
        return;
      case 'WebcastRoomUserSeqMessage': {
        const count = Number(d.viewerCount ?? d.totalUser ?? 0);
        if (count > 0) this.on.event({ kind: 'viewers', count });
        return;
      }
      case 'WebcastLikeMessage': {
        const total = Number(d.totalLikeCount ?? 0);
        if (total > 0) this.on.event({ kind: 'likes', total });
        return;
      }
      case 'WebcastControlMessage': {
        const action = Number(d.action);
        // 3: kết thúc, 4: bị tạm khóa. Euler sẽ đóng kết nối với mã 4005 ngay sau đó.
        if (action === 3 || action === 4) this.on.status({ state: 'waiting', message: 'Buổi live đã kết thúc.' });
        return;
      }
    }
  }

  private onGift(d: Any) {
    const user = toUser(d.user);
    const info = d.giftDetails ?? {};
    const giftName = String(info.giftName || `Quà #${d.giftId}`);
    const giftId = String(d.giftId ?? info.id ?? '');
    const count = Math.max(1, Number(d.repeatCount ?? 1));
    const streakable = Number(info.giftType) === 1;
    const final = !streakable || Boolean(Number(d.repeatEnd));
    const key = `${user.id}:${giftId}:${d.groupId ?? ''}`;

    const event: Extract<SourceEvent, { kind: 'gift' }> = {
      kind: 'gift',
      key,
      user,
      giftId,
      giftName,
      giftNameVi: giftNameVi(giftName),
      count,
      diamonds: Number(info.diamondCount ?? 0),
      image: info.giftImage?.url?.[0],
      final,
    };

    const prev = this.streaks.get(key);
    if (prev) clearTimeout(prev);
    if (final) {
      this.streaks.delete(key);
      this.on.event(event);
      return;
    }
    this.streaks.set(
      key,
      setTimeout(() => {
        this.streaks.delete(key);
        this.on.event({ ...event, final: true });
      }, STREAK_TIMEOUT_MS),
    );
    this.on.event(event);
  }
}
