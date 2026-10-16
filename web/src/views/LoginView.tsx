import { Eye, EyeSlash, SignIn, WarningCircle } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import { Button } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';

const inputCls =
  'h-12 w-full rounded-xl bg-ink-850 px-3.5 text-[15px] text-ink-50 ring-1 ring-inset ring-ink-700 outline-none placeholder:text-ink-500 focus:ring-2 focus:ring-brand-500';

export function LoginView() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Nhập đủ tên đăng nhập và mật khẩu');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api<{ username: string }>('/api/auth/login', { method: 'POST', body: { username, password } });
      useAuth.setState({ state: 'in', username: res.username });
    } catch (err) {
      setError(errorMessage(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grain relative grid min-h-dvh place-items-center px-4 py-10">
      <div className="relative z-10 w-full max-w-sm animate-enter">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/icon.svg" alt="" className="size-14 rounded-2xl" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Đăng nhập TikCom</h1>
          <p className="mt-1.5 text-sm text-ink-400">Trợ lý đọc bình luận và trả lời khi livestream</p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-2xl bg-ink-900 p-5 ring-1 ring-inset ring-ink-800 sm:p-6" noValidate>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-200">Tên đăng nhập</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-200">Mật khẩu</span>
            <span className="relative block">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className={`${inputCls} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute inset-y-0 right-1 my-auto grid size-10 place-items-center rounded-lg text-ink-400 hover:text-ink-100"
                aria-label={showPass ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPass ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>

          {error ? (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-brand-700/15 px-3 py-2.5 text-sm text-brand-300 ring-1 ring-inset ring-brand-700/40">
              <WarningCircle size={18} weight="fill" className="mt-px shrink-0" />
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
            {busy ? null : <SignIn size={18} weight="bold" />}
            Đăng nhập
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-ink-500">Phiên đăng nhập được ghi nhớ 30 ngày trên thiết bị này.</p>
      </div>
    </div>
  );
}
