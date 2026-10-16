import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { isValidUsername, normalizeUsername, type Bootstrap, type Settings } from '../shared/types.js';
import * as auth from './auth.js';
import * as repo from './db/repo.js';
import { createLiveToken, isEulerConfigured } from './euler.js';
import { analyzeComment, isLlmConfigured, translateReply } from './llm.js';
import { synthesize } from './tts.js';

type ClientIp = (c: Context) => string;

const defaultIp: ClientIp = (c) => c.req.header('x-real-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';

async function body<T>(c: Context): Promise<Partial<T>> {
  try {
    const data = await c.req.json();
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

const bad = (message: string) => new HTTPException(400, { message });
const str = (v: unknown, max = 1000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function sessionId(c: Context) {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) throw bad('Mã buổi live không hợp lệ');
  return id;
}

export function createApp({ clientIp = defaultIp }: { clientIp?: ClientIp } = {}) {
  const app = new Hono().basePath('/api');

  app.onError((err, c) => {
    const status = err instanceof HTTPException ? err.status : 500;
    const message = err instanceof Error ? err.message : String(err);
    if (status >= 500) console.error('[api]', c.req.method, c.req.path, err);
    return c.json({ error: status >= 500 ? `Lỗi máy chủ: ${message}` : message }, status);
  });
  app.notFound((c) => c.json({ error: 'Không tìm thấy' }, 404));

  app.use(async (c, next) => {
    await next();
    if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
  });

  // ---- Đăng nhập ----
  app.get('/auth/me', (c) => {
    const user = auth.currentUser(c);
    return c.json({ authenticated: Boolean(user), username: user ?? '', configured: auth.isAuthConfigured() });
  });

  app.post('/auth/login', async (c) => {
    if (!auth.isAuthConfigured()) throw new HTTPException(503, { message: 'Máy chủ chưa đặt AUTH_USERNAME / AUTH_PASSWORD' });
    const ip = clientIp(c);
    const wait = auth.loginBlockedFor(ip);
    if (wait) throw new HTTPException(429, { message: `Sai quá nhiều lần. Thử lại sau ${Math.ceil(wait / 60)} phút.` });
    const { username, password } = await body<{ username: string; password: string }>(c);
    if (!auth.checkCredentials(String(username ?? ''), String(password ?? ''))) {
      auth.recordLoginFailure(ip);
      throw new HTTPException(401, { message: 'Sai tên đăng nhập hoặc mật khẩu' });
    }
    auth.clearLoginFailures(ip);
    auth.startSession(c);
    return c.json({ ok: true, username: auth.currentUser(c) ?? String(username).trim() });
  });

  app.post('/auth/logout', (c) => {
    auth.endSession(c);
    return c.json({ ok: true });
  });

  app.use('*', async (c, next) => {
    if (c.req.path.startsWith('/api/auth/')) return next();
    return auth.requireAuth(c, next);
  });

  // ---- Cấu hình ----
  app.get('/bootstrap', async (c) => {
    const [settings, lastUsername] = await Promise.all([repo.loadSettings(), repo.getLastUsername()]);
    const data: Bootstrap = {
      settings,
      lastUsername,
      features: { tiktok: isEulerConfigured(), llm: isLlmConfigured(), history: true },
    };
    return c.json(data);
  });

  app.put('/settings', async (c) => c.json(await repo.saveSettings(await body<Settings>(c))));

  // ---- Kết nối TikTok qua Euler Stream ----
  app.post('/live/token', async (c) => {
    const name = normalizeUsername(str((await body<{ username: string }>(c)).username, 200));
    if (!name) throw bad('Vui lòng nhập username TikTok');
    if (!isValidUsername(name)) throw bad(`"${name}" không phải username TikTok hợp lệ`);
    const [token] = await Promise.all([
      createLiveToken(name),
      repo.setLastUsername(name).catch((err) => console.warn('[api] Không lưu được username:', err.message)),
    ]);
    return c.json({ ...token, username: name });
  });

  // ---- Lịch sử ----
  app.post('/sessions', async (c) => {
    const b = await body<{ username: string; demo: boolean; clientId: string }>(c);
    const demo = b.demo === true;
    const username = demo ? 'demo' : normalizeUsername(str(b.username, 200));
    if (!username) throw bad('Thiếu username');
    const clientId = str(b.clientId, 100);
    if (!clientId) throw bad('Thiếu mã thiết bị');
    return c.json(await repo.openSession(username, demo, clientId));
  });

  app.post('/sessions/:id/sync', async (c) => {
    const b = await body<repo.SyncPayload>(c);
    const clientId = str(b.clientId, 100);
    if (!clientId) throw bad('Thiếu mã thiết bị');
    return c.json(
      await repo.syncSession(sessionId(c), {
        clientId,
        events: Array.isArray(b.events) ? b.events : [],
        langs: Array.isArray(b.langs) ? b.langs : [],
        peakViewers: Number(b.peakViewers) || 0,
        totalLikes: Number(b.totalLikes) || 0,
        end: b.end === true,
      }),
    );
  });

  app.get('/sessions', async (c) => c.json(await repo.listSessions()));

  app.get('/sessions/:id', async (c) => {
    const detail = await repo.sessionDetail(sessionId(c));
    if (!detail) throw new HTTPException(404, { message: 'Không tìm thấy buổi live' });
    return c.json(detail);
  });

  app.delete('/sessions/:id', async (c) => {
    await repo.deleteSession(sessionId(c));
    return c.json({ ok: true });
  });

  // ---- AI & giọng đọc ----
  app.post('/analyze', async (c) => {
    const b = await body<{ text: string; channelInfo: string }>(c);
    const text = str(b.text, 500);
    if (!text) throw bad('Bình luận rỗng');
    return c.json(await analyzeComment(text, str(b.channelInfo, 2000)));
  });

  app.post('/translate', async (c) => {
    const b = await body<{ text: string; lang: string; langName: string }>(c);
    const text = str(b.text, 500);
    if (!text) throw bad('Vui lòng nhập câu cần dịch');
    return c.json(await translateReply(text, str(b.lang, 20) || 'en', str(b.langName, 50)));
  });

  app.get('/tts', async (c) => {
    const audio = await synthesize(c.req.query('text') ?? '', c.req.query('lang') ?? 'vi');
    return c.body(new Uint8Array(audio), 200, {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'private, max-age=86400',
    });
  });

  return app;
}
