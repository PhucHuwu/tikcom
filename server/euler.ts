import type { LiveToken } from '../shared/types.js';
import { getConfig } from './config.js';

const API = 'https://tiktok.eulerstream.com';
const WS_URL = 'wss://ws.eulerstream.com';
/** JWT chỉ dùng để mở kết nối; mỗi lần kết nối lại trình duyệt xin token mới */
const TOKEN_TTL_S = 3600;

let accountIdCache: { key: string; id: Promise<number> } | null = null;

async function eulerFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'x-api-key': getConfig().euler.apiKey, 'Content-Type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(10000),
  });
  const data = (await res.json().catch(() => ({}))) as { code?: number; message?: string } & T;
  if (!res.ok || (data.code && data.code >= 400)) {
    throw new Error(`Euler Stream lỗi ${data.code ?? res.status}: ${data.message ?? res.statusText}`);
  }
  return data;
}

/** Account ID lấy tự động từ API key nếu không đặt EULER_ACCOUNT_ID */
function accountId(): Promise<number> {
  const { apiKey, accountId } = getConfig().euler;
  if (accountId) return Promise.resolve(Number(accountId));
  if (accountIdCache?.key !== apiKey) {
    const id = eulerFetch<{ account?: { id: number } }>('/accounts/me').then((d) => {
      if (!d.account?.id) throw new Error('Không đọc được Account ID từ Euler Stream');
      return d.account.id;
    });
    id.catch(() => (accountIdCache = null));
    accountIdCache = { key: apiKey, id };
  }
  return accountIdCache.id;
}

export const isEulerConfigured = () => Boolean(getConfig().euler.apiKey);

/** Tạo JWT ngắn hạn chỉ cho phép xem đúng một kênh, để trình duyệt kết nối thẳng tới Euler mà không lộ API key. */
export async function createLiveToken(username: string): Promise<LiveToken> {
  if (!isEulerConfigured()) throw new Error('Máy chủ chưa cấu hình EULER_API_KEY');
  const id = await accountId();
  const data = await eulerFetch<{ token?: string }>(`/accounts/${id}/jwt/create`, {
    method: 'POST',
    body: JSON.stringify({
      expireAfter: TOKEN_TTL_S,
      name: `tikcom:${username}`,
      websockets: { allowedCreators: [username], maxWebSockets: 1 },
    }),
  });
  if (!data.token) throw new Error('Euler Stream không trả về token');
  const url = `${WS_URL}?${new URLSearchParams({ uniqueId: username, jwtKey: data.token })}`;
  return { token: data.token, url };
}
