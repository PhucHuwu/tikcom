import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  dbPath: process.env.DB_PATH ?? 'data/tikcom.sqlite',
  /** API key Euler Stream (không bắt buộc, giúp kết nối TikTok ổn định hơn) */
  signApiKey: process.env.SIGN_API_KEY || undefined,
  llm: {
    baseUrl: (process.env.LLM_BASE_URL ?? '').replace(/\/+$/, ''),
    model: process.env.LLM_MODEL ?? 'gemini-3.1-flash-lite',
    apiKey: process.env.LLM_API_KEY ?? '',
    concurrency: Number(process.env.LLM_CONCURRENCY ?? 3),
  },
};
