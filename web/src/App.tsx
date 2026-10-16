import { ChartBar, ChatsCircle, ClockCounterClockwise, Gear } from '@phosphor-icons/react';
import { ConnectForm, LogoutButton, SoundButton, StatusPill } from './components/TopBar';
import { cx } from './components/ui';
import { useApp, type Tab } from './lib/store';
import { HistoryView } from './views/HistoryView';
import { LiveView } from './views/LiveView';
import { SettingsView } from './views/SettingsView';
import { StatsView } from './views/StatsView';

const TABS: { id: Tab; label: string; icon: typeof ChatsCircle }[] = [
  { id: 'live', label: 'Live', icon: ChatsCircle },
  { id: 'stats', label: 'Thống kê', icon: ChartBar },
  { id: 'history', label: 'Lịch sử', icon: ClockCounterClockwise },
  { id: 'settings', label: 'Cài đặt', icon: Gear },
];

function Logo() {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <img src="/icon.svg" alt="" className="size-8 rounded-[10px]" />
      <span className="text-[17px] font-bold tracking-tight">TikCom</span>
    </div>
  );
}

function DesktopTabs() {
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  return (
    <nav className="hidden shrink-0 items-center gap-1 rounded-xl bg-ink-900 p-1 ring-1 ring-inset ring-ink-800 md:flex" aria-label="Điều hướng">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          aria-current={tab === t.id ? 'page' : undefined}
          className={cx(
            'pressable flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold',
            tab === t.id ? 'bg-ink-700 text-ink-50' : 'text-ink-400 hover:text-ink-100',
          )}
        >
          <t.icon size={16} weight={tab === t.id ? 'fill' : 'regular'} />
          {t.label}
        </button>
      ))}
    </nav>
  );
}

function MobileTabs() {
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-ink-800 bg-ink-950/90 backdrop-blur-lg safe-bottom md:hidden" aria-label="Điều hướng">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          aria-current={tab === t.id ? 'page' : undefined}
          className={cx('flex flex-col items-center gap-0.5 pt-2 pb-1 text-[11px] font-semibold transition-colors', tab === t.id ? 'text-ink-50' : 'text-ink-500')}
        >
          <t.icon size={22} weight={tab === t.id ? 'fill' : 'regular'} />
          {t.label}
        </button>
      ))}
    </nav>
  );
}

export function App() {
  const tab = useApp((s) => s.tab);

  return (
    <div className="grain relative flex h-dvh flex-col">
      <header className="relative z-10 shrink-0 border-b border-ink-800/80 bg-ink-950/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2.5 px-3 py-2.5 sm:px-5">
          <Logo />
          <DesktopTabs />
          <div className="order-last flex w-full min-w-0 items-center gap-3 lg:order-none lg:w-auto lg:flex-1 lg:justify-end">
            <div className="min-w-0 flex-1 lg:max-w-xs lg:flex-none">
              <StatusPill />
            </div>
            <div className="flex min-w-0 shrink-0 lg:w-[420px] lg:justify-end">
              <ConnectForm />
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <SoundButton compact />
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className={cx('relative z-10 min-h-0 flex-1 p-3 pb-20 sm:p-5 md:pb-5', tab === 'live' ? 'overflow-hidden' : 'overflow-y-auto')}>
        {tab === 'live' ? <LiveView /> : tab === 'stats' ? <StatsView /> : tab === 'history' ? <HistoryView /> : <SettingsView />}
      </main>

      <MobileTabs />
    </div>
  );
}
