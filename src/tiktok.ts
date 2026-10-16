import { EventEmitter } from 'node:events';
import { ControlEvent, TikTokLiveConnection, UserOfflineError, WebcastEvent } from 'tiktok-live-connector';
import { config } from './config.js';
import { giftNameVi } from './gifts.js';
import type { ConnState, LiveUser } from './types.js';

/** Sự kiện đã chuẩn hóa, độc lập với cấu trúc dữ liệu của thư viện TikTok */
export type SourceEvent =
  | { kind: 'chat'; user: LiveUser; text: string }
  | {
      kind: 'gift';
      key: string;
      user: LiveUser;
      giftId: string;
      giftName: string;
      giftNameVi: string;
      count: number;
      diamonds: number;
      image?: string;
      final: boolean;
    }
  | { kind: 'follow' | 'share' | 'member'; user: LiveUser }
  | { kind: 'viewers'; count: number }
  | { kind: 'likes'; total: number }
  | { kind: 'streamEnd' };

export interface SourceStatus {
  state: ConnState;
  message: string;
  roomId?: string;
}

export interface LiveSource extends EventEmitter {
  start(): Promise<void>;
  stop(): Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function toUser(u: Any): LiveUser {
  const id = String(u?.userId ?? u?.id ?? u?.uniqueId ?? u?.displayId ?? 'unknown');
  const name = String(u?.nickname || u?.uniqueId || u?.displayId || 'Ẩn danh');
  const avatar = u?.avatarThumb?.urlList?.[0] ?? u?.profilePictureUrl ?? undefined;
  return { id, name, avatar };
}

const OFFLINE_RETRY_MS = 30_000;
const MAX_BACKOFF_MS = 60_000;
/** Combo quà không nhận được tín hiệu kết thúc sau khoảng này thì coi như đã kết thúc */
const STREAK_TIMEOUT_MS = 8_000;

export class TikTokSource extends EventEmitter implements LiveSource {
  private conn: Any = null;
  private stopped = true;
  private retryTimer: NodeJS.Timeout | null = null;
  private attempt = 0;
  private streaks = new Map<string, { timer: NodeJS.Timeout; last: Extract<SourceEvent, { kind: 'gift' }> }>();

  constructor(private readonly username: string) {
    super();
  }

  private status(state: ConnState, message: string, roomId?: string) {
    this.emit('status', { state, message, roomId } satisfies SourceStatus);
  }

  private out(e: SourceEvent) {
    this.emit('event', e);
  }

  async start() {
    this.stopped = false;
    this.attempt = 0;
    await this.connect();
  }

  async stop() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    for (const s of this.streaks.values()) clearTimeout(s.timer);
    this.streaks.clear();
    const conn = this.conn;
    this.conn = null;
    if (conn) {
      conn.removeAllListeners();
      await conn.disconnect().catch(() => {});
    }
    this.status('idle', 'Đã ngắt kết nối');
  }

  private scheduleRetry(delay: number, state: ConnState, message: string) {
    if (this.stopped) return;
    this.status(state, message);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, delay);
  }

  private async connect() {
    if (this.stopped) return;
    if (this.conn) {
      this.conn.removeAllListeners();
      await this.conn.disconnect().catch(() => {});
    }
    this.status(this.attempt === 0 ? 'connecting' : 'reconnecting', `Đang kết nối tới @${this.username}...`);

    const conn: Any = new TikTokLiveConnection(this.username, {
      signApiKey: config.signApiKey,
      processInitialData: false,
      // Lấy danh sách quà cần gói Business của Euler Stream; tên/giá/ảnh quà đã có sẵn trong mỗi sự kiện gift.
      enableExtendedGiftInfo: false,
    });
    this.conn = conn;
    this.bind(conn);

    try {
      const state = await conn.connect();
      if (this.stopped || this.conn !== conn) return;
      this.attempt = 0;
      this.status('connected', `Đã kết nối @${this.username}`, state.roomId);
    } catch (err) {
      if (this.stopped || this.conn !== conn) return;
      conn.removeAllListeners();
      if (err instanceof UserOfflineError) {
        this.scheduleRetry(OFFLINE_RETRY_MS, 'waiting', `@${this.username} chưa livestream. Tự kiểm tra lại sau 30 giây...`);
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (/Business plan|requires a .* plan|Purchase one/i.test(msg)) {
        this.stopped = true;
        this.status('idle', `Euler Stream yêu cầu gói trả phí cho chức năng này: ${msg}`);
        return;
      }
      this.attempt++;
      const delay = Math.min(5000 * 2 ** (this.attempt - 1), MAX_BACKOFF_MS);
      const hint = /Room ID from all sources/i.test(msg)
        ? `Không tìm thấy phòng live của @${this.username} (sai username hoặc chưa live)`
        : /rate.?limit|429/i.test(msg)
          ? 'Máy chủ ký Euler Stream đang giới hạn lượt dùng miễn phí'
          : `Lỗi kết nối: ${msg}`;
      this.scheduleRetry(delay, 'reconnecting', `${hint}. Thử lại sau ${Math.round(delay / 1000)} giây...`);
    }
  }

  private bind(conn: Any) {
    conn.on(ControlEvent.DISCONNECTED, () => {
      if (this.stopped || this.conn !== conn) return;
      this.attempt++;
      const delay = Math.min(3000 * this.attempt, MAX_BACKOFF_MS);
      this.scheduleRetry(delay, 'reconnecting', 'Mất kết nối, đang kết nối lại...');
    });

    conn.on(ControlEvent.ERROR, ({ info, exception }: Any) => {
      console.warn('[tiktok]', info, exception?.message ?? exception ?? '');
    });

    conn.on(WebcastEvent.STREAM_END, () => {
      this.out({ kind: 'streamEnd' });
      this.scheduleRetry(OFFLINE_RETRY_MS, 'waiting', 'Buổi live đã kết thúc. Đang chờ buổi live tiếp theo...');
    });

    conn.on(WebcastEvent.CHAT, (d: Any) => {
      const text = String(d.comment ?? d.content ?? '').trim();
      if (text) this.out({ kind: 'chat', user: toUser(d.user), text });
    });

    conn.on(WebcastEvent.GIFT, (d: Any) => this.onGift(d));

    conn.on(WebcastEvent.FOLLOW, (d: Any) => this.out({ kind: 'follow', user: toUser(d.user) }));
    conn.on(WebcastEvent.SHARE, (d: Any) => this.out({ kind: 'share', user: toUser(d.user) }));
    conn.on(WebcastEvent.MEMBER, (d: Any) => this.out({ kind: 'member', user: toUser(d.user) }));

    conn.on(WebcastEvent.ROOM_USER, (d: Any) => {
      const count = Number(d.viewerCount ?? d.total ?? 0);
      if (count > 0) this.out({ kind: 'viewers', count });
    });

    conn.on(WebcastEvent.LIKE, (d: Any) => {
      const total = Number(d.totalLikeCount ?? d.total ?? 0);
      if (total > 0) this.out({ kind: 'likes', total });
    });
  }

  private onGift(d: Any) {
    const user = toUser(d.user);
    const info = d.giftDetails ?? d.gift ?? d.extendedGiftInfo ?? {};
    const giftName = String(info.giftName ?? info.name ?? d.extendedGiftInfo?.name ?? `Quà #${d.giftId}`);
    const giftType = Number(info.giftType ?? info.type ?? d.extendedGiftInfo?.type ?? 0);
    const diamonds = Number(info.diamondCount ?? d.extendedGiftInfo?.diamond_count ?? 0);
    const image =
      info.giftImage?.url?.[0] ?? info.image?.urlList?.[0] ?? d.extendedGiftInfo?.image?.url_list?.[0] ?? undefined;
    const giftId = String(d.giftId ?? info.id ?? '');
    const count = Math.max(1, Number(d.repeatCount ?? 1));
    const streakable = giftType === 1;
    const final = !streakable || Boolean(d.repeatEnd);
    const key = `${user.id}:${giftId}:${d.groupId ?? ''}`;

    const event: Extract<SourceEvent, { kind: 'gift' }> = {
      kind: 'gift',
      key,
      user,
      giftId,
      giftName,
      giftNameVi: giftNameVi(giftName),
      count,
      diamonds,
      image,
      final,
    };

    const prev = this.streaks.get(key);
    if (prev) clearTimeout(prev.timer);

    if (final) {
      this.streaks.delete(key);
      this.out(event);
      return;
    }
    const timer = setTimeout(() => {
      this.streaks.delete(key);
      this.out({ ...event, final: true });
    }, STREAK_TIMEOUT_MS);
    this.streaks.set(key, { timer, last: event });
    this.out(event);
  }
}
