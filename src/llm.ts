import { config } from './config.js';
import type { Analysis, Suggestion } from './types.js';

const ANALYZE_PROMPT = `Bạn là trợ lý cho một streamer TikTok người Việt Nam, giúp họ trả lời comment của người xem nước ngoài trong lúc livestream. Streamer KHÔNG biết ngoại ngữ.

Với mỗi comment, trả về DUY NHẤT một object JSON (không markdown, không giải thích) theo dạng:
{
  "isVietnamese": boolean,      // true nếu comment là tiếng Việt (kể cả không dấu, teencode)
  "lang": string,               // mã ISO 639-1 của ngôn ngữ comment, ví dụ "en", "zh", "ko", "ja", "th", "id"
  "langName": string,           // tên ngôn ngữ bằng tiếng Việt, ví dụ "Tiếng Anh"
  "translation": string,        // bản dịch tự nhiên sang tiếng Việt
  "commentPhonetic": string,    // phiên âm tiếng Việt của comment gốc
  "suggestions": [              // đúng 3 câu trả lời gợi ý, rỗng nếu isVietnamese = true
    { "text": string, "meaning": string, "phonetic": string }
  ]
}

Quy tắc cho suggestions:
- Câu trả lời được nói bởi STREAMER (người Việt Nam, đang ở Việt Nam trừ khi thông tin kênh nói khác), gửi tới người comment. Không nhận mình là người nước khác; nếu comment nhắc tới một quốc gia, đó thường là nơi người xem đang ở.
- Comment có thể nhắc tên người khác bằng "@ten"; câu trả lời vẫn hướng tới người comment.
- "text": câu trả lời viết bằng CHÍNH ngôn ngữ của comment, ngắn (tối đa ~12 từ), thân thiện, tự nhiên, dễ nói. Dùng chữ viết gốc của ngôn ngữ đó (chữ Hán, Hangul, Kana, chữ Thái...).
- "meaning": nghĩa tiếng Việt của "text".
- "phonetic": phiên âm "text" để người Việt đọc lên nghe giống người bản xứ nhất.
- 3 câu nên khác nhau về ý: ví dụ một câu cảm ơn/chào, một câu trả lời trực tiếp nội dung, một câu hỏi lại để tương tác.
- Nếu comment hỏi thông tin cá nhân hoặc thông tin mà bạn không biết, trả lời khéo léo, chung chung, không bịa đặt chi tiết cụ thể.
- Nếu comment thô tục, quấy rối hoặc spam, gợi ý câu trả lời lịch sự, trung lập.

Quy tắc phiên âm tiếng Việt:
- CHỈ dùng chữ Quốc ngữ (bảng chữ cái Latin tiếng Việt), tuyệt đối không chứa chữ Hán, Kana, Hangul, chữ Thái hay ký tự ngoại ngữ khác.
- Viết bằng chữ Quốc ngữ có dấu, các âm tiết trong cùng một từ nối bằng dấu gạch ngang "-", các từ cách nhau bằng dấu cách.
- Ưu tiên cách đọc thực tế của người bản xứ (nối âm, nuốt âm) thay vì đánh vần từng chữ.
- Phụ âm cuối mà tiếng Việt không có thì lược bỏ hoặc thay bằng âm gần nhất.
- Ví dụ:
  "Hello, I love your stream!" -> "Hê-lâu, ai lớp dò x-trim!"
  "Thank you so much!" -> "Thén-kiu sâu mất-ch!"
  "Where are you from?" -> "Que a diu phờ-rom?"
  "谢谢你" -> "Xia xia nỉ"
  "你好" -> "Ní hảo"
  "감사합니다" -> "Cam-xa-ham-ni-đa"
  "사랑해요" -> "Xa-rang-he-dồ"
  "ありがとうございます" -> "A-ri-ga-tô gô-dai-ma-xư"
  "ขอบคุณครับ" -> "Khọp-khun khráp"
  "Terima kasih" -> "Tờ-ri-ma ca-xi"`;

const TRANSLATE_PROMPT = `Bạn giúp một streamer TikTok người Việt nói chuyện với người xem nước ngoài. Streamer đưa ra một câu tiếng Việt và ngôn ngữ đích.
Trả về DUY NHẤT một object JSON (không markdown): { "text": string, "meaning": string, "phonetic": string }
- "text": câu dịch tự nhiên, thân thiện, ngắn gọn sang ngôn ngữ đích, dùng chữ viết gốc của ngôn ngữ đó.
- "meaning": nghĩa tiếng Việt của "text" (dịch ngược lại để streamer kiểm tra).
- "phonetic": phiên âm "text" bằng chữ Quốc ngữ có dấu để người Việt đọc nghe giống người bản xứ; âm tiết trong một từ nối bằng "-", các từ cách nhau bằng dấu cách.
Ví dụ phiên âm: "Thank you so much!" -> "Thén-kiu sâu mất-ch!", "감사합니다" -> "Cam-xa-ham-ni-đa", "谢谢你" -> "Xia xia nỉ".`;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function chat(messages: ChatMessage[], timeoutMs = 20000): Promise<string> {
  if (!config.llm.baseUrl || !config.llm.apiKey) {
    throw new Error('Chưa cấu hình LLM_BASE_URL / LLM_API_KEY trong file .env');
  }
  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LLM lỗi HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM trả về nội dung rỗng');
  return content;
}

/** Model hay bọc JSON trong khối ```json ... ``` dù đã yêu cầu JSON thuần. */
export function parseJsonLoose(raw: string): unknown {
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error('Không đọc được JSON từ LLM');
  }
}

/** Thử lại 1 lần khi LLM trả JSON hỏng hoặc lỗi mạng tạm thời (không thử lại khi sai cấu hình / hết hạn mức). */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/Chưa cấu hình|HTTP 4(0[0-4]|29)/.test(msg)) throw err;
    return fn();
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Phiên âm đôi khi lẫn ký tự ngoại ngữ (Thái, Hangul...) → chỉ giữ chữ Latin, số, dấu câu, emoji. */
const NON_LATIN_LETTER = /(?![\p{Script=Latin}])\p{L}/gu;
const phoneticStr = (v: unknown) => str(v).replace(NON_LATIN_LETTER, '').replace(/\s{2,}/g, ' ');

function toSuggestion(v: unknown): Suggestion | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const s = { text: str(o.text), meaning: str(o.meaning), phonetic: phoneticStr(o.phonetic) };
  return s.text ? s : null;
}

export async function analyzeComment(comment: string, channelInfo = ''): Promise<Analysis> {
  const context = channelInfo.trim()
    ? `\n\nThông tin về streamer/kênh (dùng khi cần trả lời):\n${channelInfo.trim()}`
    : '';
  const o = (await withRetry(async () =>
    parseJsonLoose(
      await chat([
        { role: 'system', content: ANALYZE_PROMPT + context },
        { role: 'user', content: `Comment: ${comment}` },
      ]),
    ),
  )) as Record<string, unknown>;
  const suggestions = Array.isArray(o.suggestions)
    ? o.suggestions.map(toSuggestion).filter((s): s is Suggestion => s !== null).slice(0, 3)
    : [];
  return {
    isVietnamese: o.isVietnamese === true || str(o.lang).toLowerCase() === 'vi',
    lang: str(o.lang).toLowerCase() || 'und',
    langName: str(o.langName),
    translation: str(o.translation),
    commentPhonetic: phoneticStr(o.commentPhonetic),
    suggestions,
  };
}

export async function translateReply(text: string, lang: string, langName = ''): Promise<Suggestion> {
  const s = toSuggestion(
    await withRetry(async () =>
      parseJsonLoose(
        await chat([
          { role: 'system', content: TRANSLATE_PROMPT },
          { role: 'user', content: `Ngôn ngữ đích: ${langName || lang} (${lang})\nCâu tiếng Việt: ${text}` },
        ]),
      ),
    ),
  );
  if (!s) throw new Error('LLM không trả về bản dịch');
  return s;
}

/** Giới hạn số request LLM chạy song song để không bị nghẽn khi comment dồn dập. */
export class TaskLimiter {
  private running = 0;
  private queue: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  get pending() {
    return this.queue.length;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.running++;
    try {
      return await task();
    } finally {
      this.running--;
      this.queue.shift()?.();
    }
  }
}
