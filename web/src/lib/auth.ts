import { create } from 'zustand';

type AuthState = 'checking' | 'in' | 'out';

export const useAuth = create<{ state: AuthState; username: string }>(() => ({ state: 'checking', username: '' }));

export async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = (await res.json()) as { authenticated: boolean; username: string };
    useAuth.setState({ state: data.authenticated ? 'in' : 'out', username: data.authenticated ? data.username : '' });
  } catch {
    // Máy chủ chưa chạy: thử lại sau
    setTimeout(checkAuth, 2000);
  }
}

export const markLoggedOut = () => useAuth.setState({ state: 'out', username: '' });
