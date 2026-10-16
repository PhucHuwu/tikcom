import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from './config.js';
import * as db from './db.js';
import { LiveManager, type ServerMessage } from './live.js';
import { translateReply } from './llm.js';
import { synthesize } from './tts.js';

const app = express();
app.use(express.json({ limit: '100kb' }));
const webDir = fileURLToPath(new URL('../dist/web', import.meta.url));
const hasWebBuild = existsSync(join(webDir, 'index.html'));
app.use(express.static(webDir, { index: 'index.html' }));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(msg: ServerMessage) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}

const live = new LiveManager(broadcast);

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'init', ...live.snapshot() }));
});

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;
const route = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await fn(req, res);
    if (!res.headersSent) res.json(result ?? { ok: true });
  } catch (err) {
    next(err);
  }
};

app.post(
  '/api/connect',
  route(async (req) => {
    const { username = '', demo = false } = req.body ?? {};
    await live.start(String(username), Boolean(demo));
  }),
);

app.post(
  '/api/disconnect',
  route(async () => {
    await live.stop();
  }),
);

app.get(
  '/api/state',
  route(() => live.snapshot()),
);

app.put(
  '/api/settings',
  route((req) => {
    live.updateSettings(req.body ?? {});
    return live.settings;
  }),
);

app.post(
  '/api/analyze/:id',
  route(async (req) => live.analyze(String(req.params.id), req.query.force === '1')),
);

app.post(
  '/api/translate',
  route(async (req) => {
    const { text = '', lang = 'en', langName = '' } = req.body ?? {};
    if (!String(text).trim()) throw new Error('Vui lòng nhập câu cần dịch');
    return translateReply(String(text), String(lang), String(langName));
  }),
);

app.get(
  '/api/tts',
  route(async (req, res) => {
    const text = String(req.query.text ?? '');
    const lang = String(req.query.lang ?? 'vi');
    const audio = await synthesize(text, lang);
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(audio);
  }),
);

app.get(
  '/api/sessions',
  route(() => db.listSessions()),
);

app.get(
  '/api/sessions/:id',
  route((req, res) => {
    const detail = db.sessionDetail(Number(req.params.id));
    if (!detail) res.status(404).json({ error: 'Không tìm thấy buổi live' });
    return detail;
  }),
);

app.delete(
  '/api/sessions/:id',
  route((req) => {
    db.deleteSession(Number(req.params.id));
  }),
);

app.get(/^\/(?!api\/|ws).*/, (_req, res) => {
  if (hasWebBuild) res.sendFile(join(webDir, 'index.html'));
  else res.status(503).type('text').send('Chưa build giao diện. Chạy: npm run build');
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  console.warn('[api]', message);
  res.status(400).json({ error: message });
});

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address);
}

server.listen(config.port, config.host, () => {
  console.log('\n  TikCom đang chạy:');
  console.log(`  • Trên máy này:      http://localhost:${config.port}`);
  for (const ip of lanAddresses()) console.log(`  • Thiết bị cùng Wi-Fi: http://${ip}:${config.port}`);
  if (!hasWebBuild) console.log('\n  ⚠ Chưa build giao diện — chạy `npm run build` (hoặc `npm run dev` khi phát triển).');
  if (!config.llm.apiKey) console.log('\n  ⚠ Chưa có LLM_API_KEY trong .env — tính năng gợi ý trả lời sẽ không hoạt động.');
  console.log('');
});

async function shutdown() {
  await live.stop().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
