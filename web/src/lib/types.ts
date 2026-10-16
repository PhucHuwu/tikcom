import type { ChatEvent, LiveEvent, Suggestion } from '@shared/types';

export type {
  Analysis,
  Bootstrap,
  ChatEvent,
  GiftEvent,
  LiveEvent,
  LiveStatus,
  SessionDetail,
  SessionSummary,
  Settings,
  SocialEvent,
  Suggestion,
} from '@shared/types';
export type { LiveStats, RankItem } from '@shared/stats';

export const isForeign = (e: LiveEvent | undefined): e is ChatEvent =>
  e?.kind === 'chat' && e.analysis.status === 'done' && !!e.analysis.result && !e.analysis.result.isVietnamese;

export type CustomReply = Suggestion;
