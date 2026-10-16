import type { LiveStats } from '@shared/stats';
import type { ChatEvent, LiveEvent, LiveStatus, Settings, Suggestion } from '@shared/types';

export type { Analysis, ChatEvent, GiftEvent, LiveEvent, LiveStatus, Settings, SocialEvent, Suggestion } from '@shared/types';
export type { LiveStats, RankItem } from '@shared/stats';

export type ServerMessage =
  | { type: 'init'; status: LiveStatus; settings: Settings; events: LiveEvent[]; stats: LiveStats; lastUsername: string }
  | { type: 'status'; status: LiveStatus }
  | { type: 'event'; event: LiveEvent }
  | { type: 'stats'; stats: LiveStats }
  | { type: 'settings'; settings: Settings }
  | { type: 'speak'; id: string; text: string; lang: string }
  | { type: 'clear' };

export interface SessionSummary {
  id: number;
  username: string;
  startedAt: number;
  endedAt: number | null;
  durationMin: number;
  peakViewers: number;
  totalLikes: number;
  comments: number;
  commenters: number;
  gifts: number;
  diamonds: number;
  follows: number;
  shares: number;
  joins: number;
  demo: boolean;
}

export interface SessionDetail {
  summary: SessionSummary;
  topGifters: { name: string; diamonds: number; gifts: number }[];
  topCommenters: { name: string; comments: number }[];
  languages: { lang: string; count: number }[];
  giftTypes: { name: string; count: number; diamonds: number }[];
  timeline: { minute: number; comments: number; diamonds: number }[];
}

export const isForeign = (e: LiveEvent | undefined): e is ChatEvent =>
  e?.kind === 'chat' && e.analysis.status === 'done' && !!e.analysis.result && !e.analysis.result.isVietnamese;

export type CustomReply = Suggestion;
