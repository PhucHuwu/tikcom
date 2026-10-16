const numberFmt = new Intl.NumberFormat('vi-VN');
const compactFmt = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });

export const fmt = (n: number | undefined | null) => numberFmt.format(Number(n || 0));

export const fmtCompact = (n: number | undefined | null) => {
  const v = Number(n || 0);
  return v >= 10000 ? compactFmt.format(v) : numberFmt.format(v);
};

export const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

export const fmtDateTime = (ts: number) =>
  new Date(ts).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });

export function fmtDuration(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 1) return '< 1 phút';
  return m >= 60 ? `${Math.floor(m / 60)} giờ ${m % 60} phút` : `${m} phút`;
}

export function fmtClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function initials(name: string) {
  const clean = name.replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  return (clean || name || '?').charAt(0).toUpperCase();
}

const AVATAR_TONES = ['bg-rose-500/20 text-rose-200', 'bg-sky-500/20 text-sky-200', 'bg-amber-500/20 text-amber-200', 'bg-emerald-500/20 text-emerald-200', 'bg-violet-500/20 text-violet-200', 'bg-orange-500/20 text-orange-200'];

export function avatarTone(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length];
}

export const LANG_NAMES: Record<string, string> = {
  vi: 'Tiếng Việt',
  en: 'Tiếng Anh',
  zh: 'Tiếng Trung',
  ja: 'Tiếng Nhật',
  ko: 'Tiếng Hàn',
  th: 'Tiếng Thái',
  id: 'Tiếng Indonesia',
  ms: 'Tiếng Mã Lai',
  fr: 'Tiếng Pháp',
  es: 'Tiếng Tây Ban Nha',
  pt: 'Tiếng Bồ Đào Nha',
  de: 'Tiếng Đức',
  ru: 'Tiếng Nga',
  ar: 'Tiếng Ả Rập',
  hi: 'Tiếng Hindi',
  tl: 'Tiếng Philippines',
  km: 'Tiếng Khmer',
  lo: 'Tiếng Lào',
};

export const langName = (code: string, fallback?: string) => fallback || LANG_NAMES[code] || code.toUpperCase();
