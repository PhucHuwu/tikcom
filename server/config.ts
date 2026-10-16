/** Đọc biến môi trường mỗi lần gọi để chạy được cả trên Vercel lẫn máy cá nhân (dotenv nạp ở server/node.ts). */
export function getConfig() {
  const e = process.env;
  return {
    port: Number(e.PORT ?? 3000),
    host: e.HOST ?? '0.0.0.0',
    onVercel: Boolean(e.VERCEL),
    auth: {
      username: e.AUTH_USERNAME?.trim() ?? '',
      password: e.AUTH_PASSWORD ?? '',
      /** Không bắt buộc. Bỏ trống thì khóa ký cookie suy ra từ tài khoản, đổi mật khẩu sẽ đăng xuất mọi thiết bị. */
      secret: e.AUTH_SECRET ?? '',
    },
    llm: {
      baseUrl: (e.LLM_BASE_URL ?? '').replace(/\/+$/, ''),
      model: e.LLM_MODEL ?? 'gemini-3.1-flash-lite',
      apiKey: e.LLM_API_KEY ?? '',
    },
    euler: {
      apiKey: e.EULER_API_KEY ?? '',
      accountId: e.EULER_ACCOUNT_ID ?? '',
    },
    /** Neon trên Vercel Marketplace tự thêm DATABASE_URL */
    databaseUrl: e.DATABASE_URL ?? e.POSTGRES_URL ?? '',
    dbPath: e.DB_PATH ?? 'data/tikcom.sqlite',
  };
}

export type Config = ReturnType<typeof getConfig>;
