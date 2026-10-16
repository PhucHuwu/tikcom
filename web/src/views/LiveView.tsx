import { ChatsCircle, Diamond, Eye, Heart, Timer, UserPlus } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Feed } from '../components/Feed';
import { ReplyPanel } from '../components/ReplyPanel';
import { cx, Panel } from '../components/ui';
import { fmtClock, fmtCompact } from '../lib/format';
import { useApp } from '../lib/store';

function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

function Metric({ icon, value, label, className }: { icon: React.ReactNode; value: React.ReactNode; label: string; className?: string }) {
  return (
    <div className={cx('flex shrink-0 items-center gap-2 whitespace-nowrap', className)} title={label}>
      <span className="text-ink-500">{icon}</span>
      <span className="font-mono text-sm font-semibold text-ink-100 tabular">{value}</span>
      <span className="hidden text-xs text-ink-500 2xl:inline">{label}</span>
    </div>
  );
}

function LiveMetrics() {
  const s = useApp((st) => st.stats);
  const state = useApp((st) => st.status.state);
  const now = useNow();
  if (!s?.startedAt) return null;
  return (
    <div className="flex items-center gap-x-5 gap-y-1 overflow-x-auto border-b border-ink-800 px-4 py-2.5 [scrollbar-width:none]">
      <Metric icon={<Timer size={15} weight="bold" />} value={state === 'idle' ? '—' : fmtClock(now - s.startedAt)} label="thời lượng" />
      <Metric icon={<Eye size={15} weight="bold" />} value={fmtCompact(s.viewers)} label="đang xem" />
      <Metric icon={<ChatsCircle size={15} weight="bold" />} value={fmtCompact(s.comments)} label="bình luận" />
      <Metric icon={<Diamond size={15} weight="fill" className="text-gold" />} value={fmtCompact(s.diamonds)} label="kim cương" />
      <Metric icon={<Heart size={15} weight="bold" />} value={fmtCompact(s.totalLikes)} label="lượt thích" className="hidden sm:flex" />
      <Metric icon={<UserPlus size={15} weight="bold" />} value={fmtCompact(s.follows)} label="theo dõi mới" className="hidden sm:flex" />
    </div>
  );
}

function ReplySheet() {
  const open = useApp((s) => s.sheetOpen);
  const close = () => useApp.setState({ sheetOpen: false });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className={cx('fixed inset-0 z-40 lg:hidden', !open && 'pointer-events-none')} aria-hidden={!open}>
      <div onClick={close} className={cx('absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0')} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Trả lời bình luận"
        className={cx(
          'absolute inset-x-0 bottom-0 flex h-[88dvh] flex-col rounded-t-3xl bg-ink-900 ring-1 ring-ink-800 shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.7)] transition-transform duration-[420ms] ease-[var(--ease-spring)] safe-bottom',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-ink-700" aria-hidden />
        {open ? <ReplyPanel onClose={close} /> : null}
      </div>
    </div>
  );
}

export function LiveView() {
  return (
    <>
      <div className="mx-auto grid h-full max-w-[1600px] min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(420px,1.1fr)]">
        <Panel className="flex min-h-0 flex-col overflow-hidden">
          <LiveMetrics />
          <Feed />
        </Panel>
        <Panel className="hidden min-h-0 flex-col overflow-hidden lg:flex">
          <ReplyPanel />
        </Panel>
      </div>
      <ReplySheet />
    </>
  );
}
