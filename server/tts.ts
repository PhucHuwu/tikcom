const LANG_ALIAS: Record<string, string> = {
  zh: 'zh-CN',
  'zh-hans': 'zh-CN',
  'zh-hant': 'zh-TW',
  he: 'iw',
  jv: 'jw',
};

const MAX_CHUNK = 200;
const CACHE_LIMIT = 300;
const cache = new Map<string, Buffer>();

export function normalizeTtsLang(lang: string): string {
  const l = (lang || 'vi').trim();
  return LANG_ALIAS[l.toLowerCase()] ?? l;
}

/** Google TTS chỉ nhận tối đa 200 ký tự mỗi lần: cắt ở dấu câu hoặc khoảng trắng gần nhất */
function splitText(text: string): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > MAX_CHUNK) {
    const head = rest.slice(0, MAX_CHUNK + 1);
    let cut = -1;
    for (let i = head.length - 1; i > 0; i--) {
      if (/[\s,.?!;:，。？！、]/.test(head[i])) {
        cut = i + 1;
        break;
      }
    }
    if (cut <= 0) cut = MAX_CHUNK;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut);
  }
  out.push(rest.trim());
  return out.filter(Boolean);
}

async function fetchChunk(text: string, lang: string, idx: number, total: number) {
  const params = new URLSearchParams({
    ie: 'UTF-8',
    q: text,
    tl: lang,
    total: String(total),
    idx: String(idx),
    textlen: String(text.length),
    client: 'tw-ob',
    prev: 'input',
    ttsspeed: '1',
  });
  const res = await fetch(`https://translate.google.com/translate_tts?${params}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Google TTS lỗi HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Google Translate TTS (miễn phí, không chính thức). Trả về MP3. */
export async function synthesize(text: string, lang: string): Promise<Buffer> {
  const clean = text.trim().slice(0, 1000);
  if (!clean) throw new Error('Nội dung rỗng');
  const ttsLang = normalizeTtsLang(lang);
  const key = `${ttsLang}|${clean}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const chunks = splitText(clean);
  const parts = await Promise.all(chunks.map((c, i) => fetchChunk(c, ttsLang, i, chunks.length)));
  const audio = Buffer.concat(parts);

  cache.set(key, audio);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return audio;
}
