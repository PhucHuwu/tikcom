import { markLoggedOut } from './auth';

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/api/auth/')) markLoggedOut();
  if (!res.ok) throw new Error((data as { error?: string }).error || `Lỗi máy chủ (HTTP ${res.status})`);
  return data as T;
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
