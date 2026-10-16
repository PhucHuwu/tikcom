import { create } from 'zustand';
import { toast } from 'sonner';

interface SpeechItem {
  key: string;
  text: string;
  lang: string;
  /** true: streamer bấm ▶ (ưu tiên, có thể bấm lại để dừng) · false: cảm ơn tự động (xếp hàng) */
  manual: boolean;
}

interface AudioState {
  enabled: boolean;
  volume: number;
  playingKey: string | null;
  queueLength: number;
}

export const useAudio = create<AudioState>(() => ({
  enabled: localStorage.getItem('tts-enabled') === '1',
  volume: Number(localStorage.getItem('tts-volume') ?? 1),
  playingKey: null,
  queueLength: 0,
}));

const audio = new Audio();
audio.preload = 'auto';
audio.volume = useAudio.getState().volume;

const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

const queue: SpeechItem[] = [];
let current: SpeechItem | null = null;
let finishCurrent: (() => void) | null = null;

const ttsUrl = (text: string, lang: string) => `/api/tts?lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(text)}`;

function sync() {
  useAudio.setState({ playingKey: current?.key ?? null, queueLength: queue.length });
}

/** Trình duyệt (nhất là Safari iOS) chỉ cho phát âm thanh sau khi người dùng chạm vào trang. */
async function unlock() {
  try {
    audio.src = SILENT_WAV;
    await audio.play();
  } catch {
    /* bỏ qua */
  }
}

function play(item: SpeechItem): Promise<void> {
  return new Promise((resolve) => {
    current = item;
    sync();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      audio.onended = audio.onerror = null;
      current = null;
      finishCurrent = null;
      sync();
      resolve();
    };
    finishCurrent = () => {
      audio.pause();
      finish();
    };
    audio.onended = finish;
    audio.onerror = () => {
      toast.error('Không phát được giọng đọc', { description: 'Máy chủ TTS không phản hồi. Thử lại sau ít giây.' });
      finish();
    };
    audio.src = ttsUrl(item.text, item.lang);
    audio.play().catch((err: unknown) => {
      if ((err as Error)?.name === 'NotAllowedError') {
        setEnabled(false);
        toast.warning('Trình duyệt đang chặn âm thanh', { description: 'Bấm nút "Bật âm thanh" ở góc trên để cho phép.' });
      }
      finish();
    });
  });
}

async function drain() {
  while (!current && queue.length) {
    await play(queue.shift()!);
  }
}

export function enqueueSpeech(text: string, lang = 'vi') {
  if (!useAudio.getState().enabled) return;
  queue.push({ key: `auto:${Date.now()}:${Math.random()}`, text, lang, manual: false });
  if (queue.length > 20) queue.shift();
  sync();
  void drain();
}

/** Phát ngay, chen trước hàng đợi. Bấm lại cùng nút khi đang phát thì dừng. */
export function speakNow(key: string, text: string, lang: string) {
  if (!useAudio.getState().enabled) setEnabled(true);
  const wasSame = current?.key === key;
  finishCurrent?.();
  if (wasSame) return;
  void play({ key, text, lang, manual: true }).then(drain);
}

export function setEnabled(enabled: boolean) {
  localStorage.setItem('tts-enabled', enabled ? '1' : '0');
  useAudio.setState({ enabled });
  if (enabled) {
    void unlock();
  } else {
    queue.length = 0;
    finishCurrent?.();
    sync();
  }
}

export function setVolume(volume: number) {
  audio.volume = volume;
  localStorage.setItem('tts-volume', String(volume));
  useAudio.setState({ volume });
}

export const isManualPlaying = () => Boolean(current?.manual);

// Nếu lần trước đã bật âm thanh, chạm đầu tiên vào trang sẽ mở khóa lại.
document.addEventListener(
  'pointerdown',
  () => {
    if (useAudio.getState().enabled) void unlock();
  },
  { once: true },
);
