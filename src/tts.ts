import * as googleTTS from 'google-tts-api';

const LANG_ALIAS: Record<string, string> = {
  zh: 'zh-CN',
  'zh-hans': 'zh-CN',
  'zh-hant': 'zh-TW',
  he: 'iw',
  jv: 'jw',
};

const CACHE_LIMIT = 300;
const cache = new Map<string, Buffer>();

export function normalizeTtsLang(lang: string): string {
  const l = (lang || 'vi').trim();
  return LANG_ALIAS[l.toLowerCase()] ?? l;
}

/** Google Translate TTS (miễn phí, không chính thức). Trả về MP3. */
export async function synthesize(text: string, lang: string): Promise<Buffer> {
  const clean = text.trim().slice(0, 1000);
  if (!clean) throw new Error('Nội dung rỗng');
  const ttsLang = normalizeTtsLang(lang);
  const key = `${ttsLang}|${clean}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const parts = await googleTTS.getAllAudioBase64(clean, {
    lang: ttsLang,
    slow: false,
    host: 'https://translate.google.com',
    splitPunct: ',.?!;:，。？！、',
    timeout: 10000,
  });
  const audio = Buffer.concat(parts.map((p) => Buffer.from(p.base64, 'base64')));

  cache.set(key, audio);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return audio;
}
