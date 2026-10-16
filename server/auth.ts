import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { getConfig } from './config.js';

/**
 * Phiên đăng nhập là cookie đã ký (HMAC), không cần lưu trên máy chủ,
 * nên dùng được trên Vercel nơi mỗi request có thể chạy ở một instance khác.
 */
const COOKIE = 'tikcom_session';
const MAX_AGE_S = 30 * 24 * 60 * 60;

export const isAuthConfigured = () => {
  const { username, password } = getConfig().auth;
  return Boolean(username && password);
};

function signingKey() {
  const { username, password, secret } = getConfig().auth;
  return secret || createHash('sha256').update(`tikcom|${username}|${password}`).digest('hex');
}

const hmac = (data: string) => createHmac('sha256', signingKey()).update(data).digest('base64url');

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkCredentials(username: string, password: string) {
  const auth = getConfig().auth;
  if (!isAuthConfigured()) return false;
  const userOk = safeEqual(username.trim().toLowerCase(), auth.username.toLowerCase());
  const passOk = safeEqual(password, auth.password);
  return userOk && passOk;
}

function verify(token: string | undefined): string | null {
  if (!token || !isAuthConfigured()) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !safeEqual(sig, hmac(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { u: string; exp: number };
    return data.exp > Date.now() ? data.u : null;
  } catch {
    return null;
  }
}

const isHttps = (c: Context) => c.req.header('x-forwarded-proto') === 'https' || new URL(c.req.url).protocol === 'https:';

export function startSession(c: Context) {
  const payload = Buffer.from(JSON.stringify({ u: getConfig().auth.username, exp: Date.now() + MAX_AGE_S * 1000 })).toString('base64url');
  setCookie(c, COOKIE, `${payload}.${hmac(payload)}`, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isHttps(c),
    maxAge: MAX_AGE_S,
    path: '/',
  });
}

export const endSession = (c: Context) => deleteCookie(c, COOKIE, { path: '/', secure: isHttps(c) });

export const currentUser = (c: Context) => verify(getCookie(c, COOKIE));

export const requireAuth: MiddlewareHandler = async (c, next) => {
  if (!currentUser(c)) throw new HTTPException(401, { message: 'Vui lòng đăng nhập' });
  await next();
};

/** Chống dò mật khẩu: tối đa 5 lần sai mỗi 5 phút cho mỗi IP (trong phạm vi một instance). */
const failures = new Map<string, { count: number; until: number }>();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_FAILS = 5;

export function loginBlockedFor(ip: string) {
  const f = failures.get(ip);
  if (!f || f.until < Date.now()) return 0;
  return f.count >= MAX_FAILS ? Math.ceil((f.until - Date.now()) / 1000) : 0;
}

export function recordLoginFailure(ip: string) {
  const f = failures.get(ip);
  if (!f || f.until < Date.now()) failures.set(ip, { count: 1, until: Date.now() + WINDOW_MS });
  else f.count++;
  if (failures.size > 5000) failures.delete(failures.keys().next().value!);
}

export const clearLoginFailures = (ip: string) => failures.delete(ip);
