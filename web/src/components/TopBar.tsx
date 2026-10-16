import { Broadcast, Flask, Power, SignOut, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { live } from '../live/engine';
import { api, errorMessage } from '../lib/api';
import { setEnabled, useAudio } from '../lib/audio';
import { markLoggedOut, useAuth } from '../lib/auth';
import { useApp } from '../lib/store';
import { Button, cx } from './ui';

const STATE_STYLE: Record<string, { dot: string; label: string }> = {
  idle: { dot: 'bg-ink-500', label: 'Chưa kết nối' },
  connecting: { dot: 'bg-gold', label: 'Đang kết nối' },
  reconnecting: { dot: 'bg-gold', label: 'Đang kết nối lại' },
  waiting: { dot: 'bg-gold', label: 'Chờ lên sóng' },
  connected: { dot: 'bg-live', label: 'Đang live' },
};

/** Thông báo bình thường khi chưa kết nối; các thông báo khác (lỗi) vẫn hiện ra */
const QUIET_IDLE = new Set(['Chưa kết nối', 'Đã ngắt kết nối']);

export function StatusPill() {
  const status = useApp((s) => s.status);
  const state = status.state;
  const style = STATE_STYLE[state] ?? STATE_STYLE.idle;
  const message = status.message;
  const pulsing = state !== 'idle';

  return (
    <div className="flex min-w-0 items-center gap-2.5" title={message} role="status" aria-live="polite">
      <span className="relative flex size-2.5 shrink-0">
        {pulsing ? <span className={cx('absolute inset-0 rounded-full animate-ping-soft', style.dot)} /> : null}
        <span className={cx('relative size-2.5 rounded-full', style.dot)} />
      </span>
      <div className="min-w-0 leading-tight">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-100">
          {style.label}
          {status.state !== 'idle' && status.username ? (
            <span className="truncate font-normal text-ink-400">{status.demo ? '· dữ liệu demo' : `· @${status.username}`}</span>
          ) : null}
        </div>
        {state !== 'connected' && (state !== 'idle' || !QUIET_IDLE.has(message)) ? (
          <div className="truncate text-xs text-ink-400">{message}</div>
        ) : null}
      </div>
    </div>
  );
}

export function SoundButton({ compact = false }: { compact?: boolean }) {
  const enabled = useAudio((s) => s.enabled);
  const queue = useAudio((s) => s.queueLength);
  const playing = useAudio((s) => s.playingKey);

  return (
    <Button
      variant={enabled ? 'secondary' : 'primary'}
      size={compact ? 'sm' : 'md'}
      onClick={() => {
        setEnabled(!enabled);
        if (!enabled) toast.success('Đã bật âm thanh trên thiết bị này');
      }}
      className={cx(!enabled && 'ring-4 ring-brand-500/25')}
      aria-pressed={enabled}
      title={enabled ? 'Tắt giọng đọc trên thiết bị này' : 'Trình duyệt cần bạn bấm một lần để cho phép phát âm thanh'}
    >
      {enabled ? <SpeakerHigh size={18} weight="fill" className={cx(playing && 'text-live')} /> : <SpeakerSlash size={18} weight="bold" />}
      <span className={cx(compact && 'hidden sm:inline')}>{enabled ? (queue ? `Đang đọc · chờ ${queue}` : 'Âm thanh bật') : 'Bật âm thanh'}</span>
    </Button>
  );
}

export function LogoutButton() {
  const username = useAuth((s) => s.username);
  const [busy, setBusy] = useState(false);

  async function logout() {
    if (live.active && !confirm('Đăng xuất sẽ ngắt kết nối buổi live trên thiết bị này. Tiếp tục?')) return;
    setBusy(true);
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* vẫn đăng xuất phía giao diện */
    }
    setEnabled(false);
    markLoggedOut();
  }

  return (
    <Button variant="ghost" size="sm" onClick={logout} loading={busy} title={`Đang đăng nhập: ${username}. Bấm để đăng xuất`} aria-label="Đăng xuất">
      {busy ? null : <SignOut size={18} weight="bold" />}
      <span className="hidden xl:inline">Đăng xuất</span>
    </Button>
  );
}

export function ConnectForm() {
  const status = useApp((s) => s.status);
  const lastUsername = useApp((s) => s.lastUsername);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState<'live' | 'demo' | 'stop' | null>(null);
  const active = status.state !== 'idle';

  useEffect(() => {
    if (lastUsername && !username) setUsername(lastUsername);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUsername]);

  async function run(kind: 'live' | 'demo' | 'stop', fn: () => Promise<unknown>) {
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!name) {
      toast.warning('Nhập username TikTok của bạn', { description: 'Ví dụ: @tenkenh hoặc link tiktok.com/@tenkenh' });
      return;
    }
    void run('live', () => live.start(name, false));
  }

  if (active) {
    return (
      <Button variant="danger" onClick={() => run('stop', async () => live.stop())} loading={busy === 'stop'}>
        {busy === 'stop' ? null : <Power size={16} weight="bold" />}
        Ngắt kết nối
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-full min-w-0 items-center gap-2">
      <label className="group relative flex h-10 min-w-0 flex-1 items-center rounded-xl bg-ink-850 ring-1 ring-inset ring-ink-700 transition focus-within:ring-2 focus-within:ring-brand-500">
        <span className="pl-3.5 font-medium text-ink-400">@</span>
        <input
          value={username.replace(/^@/, '')}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username TikTok"
          aria-label="Username TikTok"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="h-full min-w-0 flex-1 bg-transparent pr-3 pl-1 text-sm text-ink-50 outline-none placeholder:text-ink-500"
        />
      </label>
      <Button type="submit" variant="primary" loading={busy === 'live'}>
        {busy === 'live' ? null : <Broadcast size={17} weight="bold" />}
        Kết nối
      </Button>
      <Button
        variant="ghost"
        onClick={() => run('demo', () => live.start('demo', true))}
        loading={busy === 'demo'}
        title="Chạy dữ liệu giả lập để làm quen giao diện"
      >
        {busy === 'demo' ? null : <Flask size={17} />}
        <span className="hidden sm:inline">Demo</span>
      </Button>
    </form>
  );
}
