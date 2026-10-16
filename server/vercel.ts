/** Điểm vào cho Vercel Function: mọi request /api/* được chuyển tới đây (xem scripts/build-vercel.mjs). */
import { getRequestListener } from '@hono/node-server';
import { createApp } from './app.js';

export default getRequestListener(createApp().fetch);
