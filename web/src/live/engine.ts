import type { Analysis, ChatEvent, GiftEvent, LiveEvent, SocialEvent } from '@shared/types';
import { StatsTracker } from '@shared/stats';
import { thankPreset } from '@shared/thanks';
import { normalizeUsername } from '@shared/types';
import { toast } from 'sonner';
import { api, errorMessage } from '../lib/api';
import { enqueueSpeech } from '../lib/audio';
import { useApp } from '../lib/store';
import { DemoSource } from './demo';
import { EulerSource } from './euler';
import { HistoryWriter } from './history';
import { uid, type LiveSource, type SourceEvent, type SourceStatus } from './source';

/** Hàng đợi AI dài hơn mức này thì không tự phân tích nữa, chờ streamer bấm chọn */
const MAX_AUTO_BACKLOG = 15;
const LLM_CONCURRENCY = 3;
const VI_CHARS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
const HAS_LETTER = /\p{L}/u;
const ACTIVE_KEY = 'live-active';

function cleanName(name: string, fallback: string) {
  const cleaned = name
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\u200d\ufe0f]/gu, '')
    .replace(/[_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

export function fillTemplate(tpl: string, vars: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Giới hạn số yêu cầu AI chạy song song khi comment dồn dập */
class TaskLimiter {
  private running = 0;
  private queue: (() => void)[] = [];
  constructor(private readonly limit: number) {}
  get pending() {
    return this.queue.length;
  }
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.limit) await new Promise<void>((r) => this.queue.push(r));
    this.running++;
    try {
      return await task();
    } finally {
      this.running--;
      this.queue.shift()?.();
    }
  }
}

/**
 * Điều phối một buổi live ngay trong trình duyệt: nhận sự kiện, gọi AI, đọc lời cảm ơn,
 * thống kê và gửi lịch sử về máy chủ.
 */
class LiveEngine {
  private source: LiveSource | null = null;
  private history: HistoryWriter | null = null;
  private stats = new StatsTracker();
  private limiter = new TaskLimiter(LLM_CONCURRENCY);
  private analysisCache = new Map<string, ChatEvent['analysis']>();
  private recentChats = new Map<string, number>();
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private generation = 0;

  get active() {
    return this.source !== null;
  }

  async start(input: string, demo: boolean) {
    this.stop();
    const username = demo ? 'demo' : normalizeUsername(input);
    if (!username) throw new Error('Vui lòng nhập username TikTok');
    const gen = ++this.generation;

    useApp.getState().clear();
    this.stats.reset();
    this.recentChats.clear();
    this.setStatus({ state: 'connecting', message: 'Đang kết nối...' }, username, demo);

    const handlers = {
      status: (s: SourceStatus) => gen === this.generation && this.setStatus(s),
      event: (e: SourceEvent) => {
        if (gen !== this.generation) return;
        try {
          this.handle(e);
        } catch (err) {
          console.error('[live] Lỗi xử lý sự kiện', err);
        }
      },
    };
    const source = demo ? new DemoSource(handlers) : new EulerSource(username, handlers);
    this.source = source;
    this.statsTimer = setInterval(() => this.publishStats(), 2000);

    // Lịch sử không bắt buộc: lỗi cơ sở dữ liệu không được chặn buổi live
    this.history = new HistoryWriter();
    this.history.open(username, demo).catch((err) => {
      if (gen !== this.generation) return;
      this.history = null;
      toast.warning('Không lưu được lịch sử buổi live này', { description: errorMessage(err) });
    });

    if (!demo) {
      localStorage.setItem(ACTIVE_KEY, username);
      useApp.setState({ lastUsername: username });
    }
    try {
      await source.start();
    } catch (err) {
      if (gen === this.generation) this.stop();
      throw err;
    }
  }

  stop(keepalive = false) {
    this.generation++;
    const source = this.source;
    this.source = null;
    source?.stop();
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
    if (this.history) {
      this.history.setCounters(this.stats.peakViewers, this.stats.totalLikes);
      // Demo không tự nối lại sau khi tải trang, nên kết thúc luôn
      this.history.close(keepalive, !keepalive || Boolean(useApp.getState().status.demo));
      this.history = null;
    }
    if (source) {
      if (!keepalive) localStorage.removeItem(ACTIVE_KEY);
      this.setStatus({ state: 'idle', message: 'Đã ngắt kết nối' });
      this.publishStats();
    }
  }

  /** Lần trước đang kết nối mà tải lại trang thì tự kết nối lại */
  resume() {
    const username = localStorage.getItem(ACTIVE_KEY);
    if (username && !this.active) {
      this.start(username, false).catch((err) => toast.error(errorMessage(err)));
    }
  }

  private setStatus(s: SourceStatus, username?: string, demo?: boolean) {
    useApp.setState((st) => ({
      status: {
        ...st.status,
        state: s.state,
        message: s.message,
        roomId: s.roomId ?? st.status.roomId,
        ...(username !== undefined ? { username, demo: Boolean(demo), roomId: s.roomId ?? '' } : {}),
      },
    }));
  }

  private publishStats() {
    useApp.setState({ stats: this.stats.snapshot() });
    this.history?.setCounters(this.stats.peakViewers, this.stats.totalLikes);
  }

  /** Đọc lời cảm ơn bằng ngôn ngữ đã chọn trong Cài đặt */
  private thank(template: string, user: string, extra: Record<string, string | number> = {}) {
    const preset = thankPreset(useApp.getState().settings?.thankLang ?? 'vi');
    enqueueSpeech(fillTemplate(template, { name: cleanName(user, preset.friend), ...extra }), preset.lang);
  }

  private push(event: LiveEvent) {
    useApp.getState().upsertEvent(event);
  }

  private find(id: string) {
    return useApp.getState().events.find((e) => e.id === id);
  }

  private handle(e: SourceEvent) {
    const ts = Date.now();
    const settings = useApp.getState().settings;

    switch (e.kind) {
      case 'chat': {
        const ev: ChatEvent = { kind: 'chat', id: uid(), ts, user: e.user, text: e.text, analysis: { status: 'none' } };
        this.stats.chat(e.user.id, e.user.name, ts);
        this.history?.add({ eid: ev.id, ts, kind: 'chat', userId: e.user.id, userName: e.user.name, text: e.text });
        this.prefilter(ev);
        this.push(ev);
        if (ev.analysis.status === 'none' && settings?.suggestMode !== 'manual') {
          const dupKey = `${e.user.id}|${e.text.toLowerCase()}`;
          const last = this.recentChats.get(dupKey);
          this.recentChats.set(dupKey, ts);
          if (this.recentChats.size > 1000) this.recentChats.delete(this.recentChats.keys().next().value!);
          if ((!last || ts - last > 30_000) && this.limiter.pending < MAX_AUTO_BACKLOG) void this.analyze(ev.id).catch(() => {});
        }
        return;
      }
      case 'gift': {
        const ev: GiftEvent = {
          kind: 'gift',
          id: e.key,
          ts,
          user: e.user,
          giftId: e.giftId,
          giftName: e.giftName,
          giftNameVi: e.giftNameVi,
          count: e.count,
          diamonds: e.diamonds,
          image: e.image,
          final: e.final,
        };
        this.push(ev);
        if (!e.final) return;
        this.stats.gift(e.user.id, e.user.name, e.count, e.diamonds, ts);
        this.history?.add({
          eid: `${e.key}:${ts}`,
          ts,
          kind: 'gift',
          userId: e.user.id,
          userName: e.user.name,
          giftName: e.giftName,
          giftCount: e.count,
          diamonds: e.diamonds,
        });
        if (settings?.thankGifts && e.count * e.diamonds >= settings.minDiamonds) {
          // Tên quà tiếng Việt chỉ hợp với câu tiếng Việt; ngôn ngữ khác dùng tên gốc (tiếng Anh)
          const gift = settings.thankLang === 'vi' ? e.giftNameVi : e.giftName;
          this.thank(settings.giftTemplate, e.user.name, { count: e.count, gift });
        }
        return;
      }
      case 'follow':
      case 'share':
      case 'member': {
        const ev: SocialEvent = { kind: e.kind, id: uid(), ts, user: e.user };
        this.history?.add({ eid: ev.id, ts, kind: e.kind, userId: e.user.id, userName: e.user.name });
        this.push(ev);
        if (e.kind === 'member') {
          this.stats.join();
        } else if (e.kind === 'follow') {
          this.stats.follow();
          if (settings?.thankFollows) this.thank(settings.followTemplate, e.user.name);
        } else {
          this.stats.share();
          if (settings?.thankShares) this.thank(settings.shareTemplate, e.user.name);
        }
        return;
      }
      case 'viewers':
        this.stats.setViewers(e.count);
        return;
      case 'likes':
        this.stats.setTotalLikes(e.total);
        return;
      case 'streamEnd':
        void this.history?.flush();
        return;
    }
  }

  /** Bỏ qua comment không cần AI: chỉ có emoji/ký hiệu, hoặc rõ ràng là tiếng Việt có dấu. */
  private prefilter(ev: ChatEvent) {
    if (!HAS_LETTER.test(ev.text)) {
      ev.analysis = { status: 'skipped' };
      return;
    }
    if (VI_CHARS.test(ev.text)) {
      ev.lang = 'vi';
      ev.analysis = { status: 'skipped' };
      this.recordLang(ev, 'vi', 'Tiếng Việt');
      return;
    }
    const cached = this.analysisCache.get(ev.text.trim().toLowerCase());
    if (cached?.result) {
      ev.lang = cached.result.lang;
      ev.analysis = cached;
      this.recordLang(ev, cached.result.lang, cached.result.langName);
    }
  }

  private recordLang(ev: ChatEvent, lang: string, langName: string) {
    this.stats.language(lang, langName);
    this.history?.setLang(ev.id, lang);
  }

  async analyze(id: string, force = false) {
    const ev = this.find(id);
    if (!ev || ev.kind !== 'chat') throw new Error('Không tìm thấy bình luận');
    if (ev.analysis.status === 'pending') return;
    if (ev.analysis.result && !force) return;

    const hadLang = Boolean(ev.lang);
    this.push({ ...ev, analysis: { status: 'pending' } });
    let next: ChatEvent;
    try {
      const channelInfo = useApp.getState().settings?.channelInfo ?? '';
      const result = await this.limiter.run(() => api<Analysis>('/api/analyze', { method: 'POST', body: { text: ev.text, channelInfo } }));
      next = { ...ev, lang: result.lang, analysis: result.isVietnamese ? { status: 'skipped', result } : { status: 'done', result } };
      if (!hadLang) {
        this.recordLang(next, result.isVietnamese ? 'vi' : result.lang, result.isVietnamese ? 'Tiếng Việt' : result.langName);
      }
      if (!result.isVietnamese) {
        this.analysisCache.set(ev.text.trim().toLowerCase(), next.analysis);
        if (this.analysisCache.size > 500) this.analysisCache.delete(this.analysisCache.keys().next().value!);
      }
    } catch (err) {
      next = { ...ev, analysis: { status: 'error', error: errorMessage(err) } };
    }
    // Comment có thể đã bị xóa khỏi danh sách (quá giới hạn) hoặc buổi live đã đổi
    if (this.find(id)) this.push(next);
    if (next.analysis.status === 'error') throw new Error(next.analysis.error);
  }
}

export const live = new LiveEngine();

// Đóng tab khi đang live: vẫn ghi phần lịch sử còn lại
window.addEventListener('pagehide', () => {
  if (live.active) live.stop(true);
});
window.addEventListener('beforeunload', (e) => {
  if (live.active && !useApp.getState().status.demo) e.preventDefault();
});
