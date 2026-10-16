import { ArrowClockwise, WarningCircle } from '@phosphor-icons/react';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { App } from './App';
import { Button, Spinner } from './components/ui';
import { live } from './live/engine';
import { api, errorMessage } from './lib/api';
import { checkAuth, useAuth } from './lib/auth';
import { useApp } from './lib/store';
import type { Bootstrap } from './lib/types';
import './lib/wakelock';
import { LoginView } from './views/LoginView';
import './index.css';

void checkAuth();

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="grid h-dvh place-items-center px-6 text-center">{children}</div>;
}

/** Sau khi đăng nhập: tải cài đặt, rồi tự kết nối lại buổi live nếu trang vừa được tải lại */
function Authed() {
  const ready = useApp((s) => s.settings !== null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      useApp.getState().init(await api<Bootstrap>('/api/bootstrap'));
      live.resume();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (error) {
    return (
      <FullScreen>
        <div className="max-w-sm">
          <WarningCircle size={36} className="mx-auto text-brand-400" />
          <p className="mt-3 font-semibold">Không tải được dữ liệu</p>
          <p className="mt-1 text-sm text-ink-400">{error}</p>
          <Button variant="secondary" className="mt-4" onClick={load}>
            <ArrowClockwise size={16} weight="bold" />
            Thử lại
          </Button>
        </div>
      </FullScreen>
    );
  }
  if (!ready) {
    return (
      <FullScreen>
        <Spinner className="size-6 text-ink-400" />
      </FullScreen>
    );
  }
  return <App />;
}

function Root() {
  const state = useAuth((s) => s.state);

  useEffect(() => {
    if (state === 'out') {
      live.stop();
      useApp.setState({ settings: null, features: null });
      useApp.getState().clear();
    }
  }, [state]);

  return (
    <>
      {state === 'checking' ? (
        <FullScreen>
          <Spinner className="size-6 text-ink-400" />
        </FullScreen>
      ) : state === 'in' ? (
        <Authed />
      ) : (
        <LoginView />
      )}
      <Toaster theme="dark" position="top-center" richColors closeButton toastOptions={{ className: 'font-sans' }} />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
