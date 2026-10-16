import { randomUUID } from 'node:crypto';
import * as db from './db.js';
import { DemoSource } from './demo.js';
import { analyzeComment, TaskLimiter } from './llm.js';
import { config } from './config.js';
import { StatsTracker } from './stats.js';
import { TikTokSource, type LiveSource, type SourceEvent, type SourceStatus } from './tiktok.js';
import type { ChatEvent, GiftEvent, LiveEvent, LiveStatus, Settings, SocialEvent } from './types.js';

export type ServerMessage =
  | { type: 'status'; status: LiveStatus }
  | { type: 'event'; event: LiveEvent }
  | { type: 'stats'; stats: ReturnType<StatsTracker['snapshot']> }
  | { type: 'settings'; settings: Settings }
  | { type: 'speak'; id: string; text: string; lang: string }
  | { type: 'clear' };

const MAX_EVENTS = 400;
/** Hàng đợi LLM dài hơn mức này thì không tự phân tích nữa, chờ streamer bấm chọn */
const MAX_AUTO_BACKLOG = 15;
const VI_CHARS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
const HAS_LETTER = /\p{L}/u;

function cleanName(name: string) {
  const cleaned = name
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\u200d\ufe0f]/gu, '')
    .replace(/[_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'bạn';
}

function fillTemplate(tpl: string, vars: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export class LiveManager {
  private source: LiveSource | null = null;
  private status: LiveStatus = { state: 'idle', username: '', message: 'Chưa kết nối', roomId: '', demo: false };
  private events: LiveEvent[] = [];
  private eventIndex = new Map<string, LiveEvent>();
  private sessionId: number | null = null;
  private stats = new StatsTracker();
  private limiter = new TaskLimiter(config.llm.concurrency);
  private analysisCache = new Map<string, ChatEvent['analysis']>();
  private recentChats = new Map<string, number>();
  private statsTimer: NodeJS.Timeout;
  settings: Settings = db.loadSettings();

  constructor(private readonly broadcast: (msg: ServerMessage) => void) {
    db.closeDanglingSessions();
    this.statsTimer = setInterval(() => {
      if (this.source) this.broadcast({ type: 'stats', stats: this.stats.snapshot() });
    }, 2000);
    this.statsTimer.unref();
  }

  snapshot() {
    return {
      status: this.status,
      settings: this.settings,
      events: this.events,
      stats: this.stats.snapshot(),
      lastUsername: db.getSetting('lastUsername') ?? '',
    };
  }

  updateSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    this.settings.minDiamonds = Math.max(0, Number(this.settings.minDiamonds) || 0);
    db.saveSettings(this.settings);
    this.broadcast({ type: 'settings', settings: this.settings });
  }

  async start(username: string, demo: boolean) {
    await this.stop();
    const name = username.trim().replace(/^.*tiktok\.com\/@?/i, '').replace(/^@/, '').replace(/\/.*$/, '');
    if (!demo && !name) throw new Error('Vui lòng nhập username TikTok');
    if (!demo) db.setSetting('lastUsername', name);

    this.events = [];
    this.eventIndex.clear();
    this.recentChats.clear();
    this.stats.reset();
    this.broadcast({ type: 'clear' });

    const label = demo ? 'demo' : name;
    this.sessionId = db.createSession(label, demo);
    this.status = { state: 'connecting', username: label, message: 'Đang kết nối...', roomId: '', demo };
    this.broadcast({ type: 'status', status: this.status });

    const source: LiveSource = demo ? new DemoSource() : new TikTokSource(name);
    this.source = source;
    source.on('status', (s: SourceStatus) => {
      if (this.source !== source) return;
      this.status = { ...this.status, state: s.state, message: s.message, roomId: s.roomId ?? this.status.roomId };
      this.broadcast({ type: 'status', status: this.status });
    });
    source.on('event', (e: SourceEvent) => {
      if (this.source !== source) return;
      try {
        this.handle(e);
      } catch (err) {
        console.error('[live] Lỗi xử lý sự kiện', err);
      }
    });
    await source.start();
  }

  async stop() {
    const source = this.source;
    this.source = null;
    if (source) {
      source.removeAllListeners();
      await source.stop();
    }
    if (this.sessionId != null) {
      db.endSession(this.sessionId, this.stats.peakViewers, this.stats.totalLikes);
      this.sessionId = null;
    }
    this.status = { ...this.status, state: 'idle', message: 'Đã ngắt kết nối' };
    this.broadcast({ type: 'status', status: this.status });
    this.broadcast({ type: 'stats', stats: this.stats.snapshot() });
  }

  private push(event: LiveEvent) {
    const existing = this.eventIndex.get(event.id);
    if (existing) {
      Object.assign(existing, event);
    } else {
      this.events.push(event);
      this.eventIndex.set(event.id, event);
      if (this.events.length > MAX_EVENTS) {
        const removed = this.events.shift()!;
        this.eventIndex.delete(removed.id);
      }
    }
    this.broadcast({ type: 'event', event: this.eventIndex.get(event.id)! });
  }

  private speak(text: string, lang = 'vi') {
    this.broadcast({ type: 'speak', id: randomUUID(), text, lang });
  }

  private handle(e: SourceEvent) {
    const sid = this.sessionId;
    if (sid == null) return;
    const ts = Date.now();

    switch (e.kind) {
      case 'chat': {
        const ev: ChatEvent = { kind: 'chat', id: randomUUID(), ts, user: e.user, text: e.text, analysis: { status: 'none' } };
        this.stats.chat(e.user.id, e.user.name, ts);
        db.logEvent({ sessionId: sid, ts, kind: 'chat', userId: e.user.id, userName: e.user.name, text: e.text });
        this.prefilter(ev);
        this.push(ev);
        if (ev.analysis.status === 'none' && this.settings.suggestMode === 'auto') {
          const dupKey = `${e.user.id}|${e.text.toLowerCase()}`;
          const last = this.recentChats.get(dupKey);
          this.recentChats.set(dupKey, ts);
          if (this.recentChats.size > 1000) this.recentChats.delete(this.recentChats.keys().next().value!);
          if ((!last || ts - last > 30_000) && this.limiter.pending < MAX_AUTO_BACKLOG) void this.analyze(ev.id);
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
        db.logEvent({
          sessionId: sid,
          ts,
          kind: 'gift',
          userId: e.user.id,
          userName: e.user.name,
          giftName: e.giftName,
          giftCount: e.count,
          diamonds: e.diamonds,
        });
        const s = this.settings;
        if (s.thankGifts && e.count * e.diamonds >= s.minDiamonds) {
          this.speak(fillTemplate(s.giftTemplate, { name: cleanName(e.user.name), count: e.count, gift: e.giftNameVi }));
        }
        return;
      }
      case 'follow':
      case 'share':
      case 'member': {
        const ev: SocialEvent = { kind: e.kind, id: randomUUID(), ts, user: e.user };
        db.logEvent({ sessionId: sid, ts, kind: e.kind, userId: e.user.id, userName: e.user.name });
        if (e.kind === 'member') {
          this.stats.join();
          this.push(ev);
          return;
        }
        this.push(ev);
        const s = this.settings;
        if (e.kind === 'follow') {
          this.stats.follow();
          if (s.thankFollows) this.speak(fillTemplate(s.followTemplate, { name: cleanName(e.user.name) }));
        } else {
          this.stats.share();
          if (s.thankShares) this.speak(fillTemplate(s.shareTemplate, { name: cleanName(e.user.name) }));
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
        return;
    }
  }

  /** Bỏ qua comment không cần LLM: chỉ có emoji/ký hiệu, hoặc rõ ràng là tiếng Việt có dấu. */
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
    if (this.sessionId != null) db.setChatLang(this.sessionId, ev.ts, ev.user.id, lang);
  }

  async analyze(id: string, force = false): Promise<ChatEvent> {
    const ev = this.eventIndex.get(id);
    if (!ev || ev.kind !== 'chat') throw new Error('Không tìm thấy comment');
    if (ev.analysis.status === 'pending') return ev;
    if (ev.analysis.result && !force) return ev;

    const hadLang = Boolean(ev.lang);
    ev.analysis = { status: 'pending' };
    this.push(ev);
    try {
      const result = await this.limiter.run(() => analyzeComment(ev.text, this.settings.channelInfo));
      ev.lang = result.lang;
      ev.analysis = result.isVietnamese ? { status: 'skipped', result } : { status: 'done', result };
      if (!hadLang) this.recordLang(ev, result.isVietnamese ? 'vi' : result.lang, result.isVietnamese ? 'Tiếng Việt' : result.langName);
      if (!result.isVietnamese) {
        this.analysisCache.set(ev.text.trim().toLowerCase(), ev.analysis);
        if (this.analysisCache.size > 500) this.analysisCache.delete(this.analysisCache.keys().next().value!);
      }
    } catch (err) {
      ev.analysis = { status: 'error', error: err instanceof Error ? err.message : String(err) };
      console.warn('[llm]', ev.analysis.error);
    }
    if (this.eventIndex.has(id)) this.push(ev);
    return ev;
  }
}
