import type { ConnState, LiveUser } from '@shared/types';

/** Sự kiện đã chuẩn hóa, độc lập với định dạng dữ liệu của TikTok */
export type SourceEvent =
  | { kind: 'chat'; user: LiveUser; text: string }
  | {
      kind: 'gift';
      key: string;
      user: LiveUser;
      giftId: string;
      giftName: string;
      giftNameVi: string;
      count: number;
      diamonds: number;
      image?: string;
      final: boolean;
    }
  | { kind: 'follow' | 'share' | 'member'; user: LiveUser }
  | { kind: 'viewers'; count: number }
  | { kind: 'likes'; total: number }
  | { kind: 'streamEnd' };

export interface SourceStatus {
  state: ConnState;
  message: string;
  roomId?: string;
}

export interface SourceHandlers {
  status: (s: SourceStatus) => void;
  event: (e: SourceEvent) => void;
}

export interface LiveSource {
  start(): Promise<void>;
  stop(): void;
}

export type Timer = ReturnType<typeof setTimeout>;

let seq = 0;
/** crypto.randomUUID chỉ có trên HTTPS, còn mở qua IP mạng LAN là HTTP thường */
export const uid = () => `${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
