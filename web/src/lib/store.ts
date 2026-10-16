import { create } from 'zustand';
import { isManualPlaying } from './audio';
import type { CustomReply, LiveEvent, LiveStats, LiveStatus, Settings } from './types';
import { isForeign } from './types';

const MAX_EVENTS = 400;

export type Tab = 'live' | 'stats' | 'history' | 'settings';
export type WsState = 'connecting' | 'open' | 'closed';

interface Filters {
  foreignOnly: boolean;
  showJoins: boolean;
}

function loadFilters(): Filters {
  try {
    return { foreignOnly: false, showJoins: false, ...JSON.parse(localStorage.getItem('filters') || '{}') };
  } catch {
    return { foreignOnly: false, showJoins: false };
  }
}

interface AppState {
  ws: WsState;
  status: LiveStatus;
  settings: Settings | null;
  stats: LiveStats | null;
  lastUsername: string;
  events: LiveEvent[];
  selectedId: string | null;
  /** Thời điểm streamer chọn comment bằng tay gần nhất — tạm dừng tự nhảy để không bị mất chỗ đang đọc */
  lastManualPick: number;
  autoFollow: boolean;
  filters: Filters;
  tab: Tab;
  sheetOpen: boolean;
  customReplies: Record<string, CustomReply>;

  init: (m: { status: LiveStatus; settings: Settings; events: LiveEvent[]; stats: LiveStats; lastUsername: string }) => void;
  upsertEvent: (e: LiveEvent) => void;
  clear: () => void;
  select: (id: string | null, manual?: boolean) => void;
  setFilters: (patch: Partial<Filters>) => void;
  setTab: (tab: Tab) => void;
}

export const useApp = create<AppState>((set, get) => ({
  ws: 'connecting',
  status: { state: 'idle', username: '', message: 'Chưa kết nối', roomId: '', demo: false },
  settings: null,
  stats: null,
  lastUsername: '',
  events: [],
  selectedId: null,
  lastManualPick: 0,
  autoFollow: localStorage.getItem('auto-follow') !== '0',
  filters: loadFilters(),
  tab: 'live',
  sheetOpen: false,
  customReplies: {},

  init: (m) =>
    set((s) => ({
      status: m.status,
      settings: m.settings,
      stats: m.stats,
      lastUsername: m.lastUsername,
      events: m.events,
      selectedId: m.events.some((e) => e.id === s.selectedId) ? s.selectedId : null,
    })),

  upsertEvent: (e) => {
    const s = get();
    const idx = s.events.findIndex((x) => x.id === e.id);
    let events: LiveEvent[];
    if (idx >= 0) {
      events = s.events.slice();
      events[idx] = e;
    } else {
      events = s.events.length >= MAX_EVENTS ? [...s.events.slice(-MAX_EVENTS + 1), e] : [...s.events, e];
    }
    let { selectedId } = s;
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    if (
      e.id !== selectedId &&
      s.autoFollow &&
      isDesktop &&
      isForeign(e) &&
      Date.now() - s.lastManualPick > 15000 &&
      !isManualPlaying()
    ) {
      selectedId = e.id;
    }
    set({ events, selectedId });
  },

  clear: () => set({ events: [], selectedId: null, customReplies: {}, sheetOpen: false }),

  select: (id, manual = false) =>
    set((s) => ({
      selectedId: id,
      lastManualPick: manual ? Date.now() : s.lastManualPick,
      sheetOpen: manual && id ? true : s.sheetOpen,
    })),

  setFilters: (patch) =>
    set((s) => {
      const filters = { ...s.filters, ...patch };
      localStorage.setItem('filters', JSON.stringify(filters));
      return { filters };
    }),

  setTab: (tab) => set({ tab }),
}));

export const setAutoFollow = (v: boolean) => {
  localStorage.setItem('auto-follow', v ? '1' : '0');
  useApp.setState({ autoFollow: v });
};

export const markManual = () => useApp.setState({ lastManualPick: Date.now() });
