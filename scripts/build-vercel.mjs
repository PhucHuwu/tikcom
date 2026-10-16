// Tạo .vercel/output theo Build Output API v3: giao diện tĩnh + một Function cho /api/*.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}.vercel/output`;
const fn = `${out}/functions/api.func`;

rmSync(out, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });

cpSync(`${root}dist/web`, `${out}/static`, { recursive: true });

await build({
  entryPoints: [`${root}server/vercel.ts`],
  outfile: `${fn}/index.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  minify: true,
  sourcemap: 'inline',
  logLevel: 'warning',
});

writeFileSync(
  `${fn}/.vc-config.json`,
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddSourcemapSupport: true,
      maxDuration: 30,
      supportsResponseStreaming: true,
    },
    null,
    2,
  ),
);

writeFileSync(
  `${out}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '/assets/(.*)', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
        { src: '/api/(.*)', dest: '/api' },
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);

console.log('✓ Đã tạo .vercel/output');
