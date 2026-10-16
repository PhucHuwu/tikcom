export interface LiveUser {
  id: string;
  name: string;
  avatar?: string;
}

export interface Suggestion {
  /** Câu trả lời bằng ngôn ngữ của người comment */
  text: string;
  /** Nghĩa tiếng Việt */
  meaning: string;
  /** Phiên âm tiếng Việt của `text` */
  phonetic: string;
}

export interface Analysis {
  isVietnamese: boolean;
  lang: string;
  langName: string;
  translation: string;
  commentPhonetic: string;
  suggestions: Suggestion[];
}

/** none: chưa phân tích (chế độ thủ công) · skipped: tiếng Việt hoặc chỉ có emoji */
export type AnalysisStatus = 'none' | 'pending' | 'done' | 'skipped' | 'error';

export interface AnalysisState {
  status: AnalysisStatus;
  result?: Analysis;
  error?: string;
}

export interface ChatEvent {
  kind: 'chat';
  id: string;
  ts: number;
  user: LiveUser;
  text: string;
  lang?: string;
  analysis: AnalysisState;
}

export interface GiftEvent {
  kind: 'gift';
  id: string;
  ts: number;
  user: LiveUser;
  giftId: string;
  giftName: string;
  giftNameVi: string;
  count: number;
  /** Số kim cương của 1 món quà */
  diamonds: number;
  image?: string;
  /** false khi combo đang diễn ra */
  final: boolean;
}

export interface SocialEvent {
  kind: 'follow' | 'share' | 'member';
  id: string;
  ts: number;
  user: LiveUser;
}

export type LiveEvent = ChatEvent | GiftEvent | SocialEvent;

export type ConnState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'waiting';

export interface LiveStatus {
  state: ConnState;
  username: string;
  message: string;
  roomId: string;
  demo: boolean;
}

export interface Settings {
  suggestMode: 'auto' | 'manual';
  thankGifts: boolean;
  minDiamonds: number;
  giftTemplate: string;
  thankFollows: boolean;
  followTemplate: string;
  thankShares: boolean;
  shareTemplate: string;
  channelInfo: string;
}

export const DEFAULT_SETTINGS: Settings = {
  suggestMode: 'auto',
  thankGifts: true,
  minDiamonds: 1,
  giftTemplate: 'Cảm ơn {name} đã tặng {count} {gift}!',
  thankFollows: false,
  followTemplate: 'Cảm ơn {name} đã theo dõi kênh!',
  thankShares: false,
  shareTemplate: 'Cảm ơn {name} đã chia sẻ buổi live!',
  channelInfo: '',
};
