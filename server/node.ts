/** Chạy TikCom trên máy cá nhân: API + giao diện đã build, mở được từ điện thoại cùng Wi-Fi. */
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { existsSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { isAuthConfigured } from './auth.js';
import { getConfig } from './config.js';
import { getDriver } from './db/driver.js';
import { isEulerConfigured } from './euler.js';
import { isLlmConfigured } from './llm.js';

const cfg = getConfig();
if (!isAuthConfigured()) {
  console.error('\n  ✖ Thiếu AUTH_USERNAME hoặc AUTH_PASSWORD trong .env — đặt tài khoản đăng nhập rồi chạy lại.\n');
  process.exit(1);
}

const webDir = fileURLToPath(new URL('../dist/web', import.meta.url));
const indexFile = join(webDir, 'index.html');
const hasWebBuild = existsSync(indexFile);

const app = new Hono();
app.route('/', createApp({ clientIp: (c) => getConnInfo(c).remote.address ?? 'unknown' }));
app.use('/*', serveStatic({ root: relative(process.cwd(), webDir) }));
app.get('*', (c) =>
  hasWebBuild ? c.html(readFileSync(indexFile, 'utf8')) : c.text('Chưa build giao diện. Chạy: npm run build', 503),
);

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address);
}

serve({ fetch: app.fetch, port: cfg.port, hostname: cfg.host }, async () => {
  console.log('\n  TikCom đang chạy:');
  console.log(`  • Trên máy này:        http://localhost:${cfg.port}`);
  for (const ip of lanAddresses()) console.log(`  • Thiết bị cùng Wi-Fi: http://${ip}:${cfg.port}`);
  try {
    const db = await getDriver();
    console.log(`  • Lưu lịch sử:         ${db.kind === 'postgres' ? 'Postgres (DATABASE_URL)' : cfg.dbPath}`);
  } catch (err) {
    console.log(`\n  ⚠ Không mở được cơ sở dữ liệu: ${err instanceof Error ? err.message : err}`);
  }
  if (!hasWebBuild) console.log('\n  ⚠ Chưa build giao diện — chạy `npm run build` (hoặc `npm run dev` khi phát triển).');
  if (!isEulerConfigured()) console.log('\n  ⚠ Chưa có EULER_API_KEY — không kết nối được TikTok (vẫn dùng được Demo).');
  if (!isLlmConfigured()) console.log('\n  ⚠ Chưa có LLM_API_KEY — tính năng dịch và gợi ý trả lời sẽ không hoạt động.');
  console.log('');
});
