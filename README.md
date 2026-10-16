# TikCom — Trợ lý livestream TikTok

Hỗ trợ streamer đang live bằng iPhone, chạy trên một thiết bị khác (máy tính, iPad, điện thoại):

- Đọc bình luận, quà, theo dõi, chia sẻ theo thời gian thực.
- Tự động đọc lời cảm ơn khi được tặng quà (giọng Google TTS).
- Dịch bình luận nước ngoài sang tiếng Việt, gợi ý 3 câu trả lời kèm **phiên âm tiếng Việt** để streamer tự đọc, hoặc bấm ▶ để máy đọc bằng tiếng gốc.
- Tự soạn câu trả lời tiếng Việt → dịch sang ngôn ngữ người xem kèm phiên âm.
- Thống kê realtime và lưu lịch sử từng buổi live.

## Cách hoạt động

```
iPhone (live TikTok)
        │
   TikTok ──► Euler Stream ──WebSocket──► Trình duyệt (TikCom)
                                            │  nhận sự kiện, cảm ơn, thống kê
                                            ▼
                              API TikCom (Vercel Function hoặc Node)
                              đăng nhập · cấp JWT Euler · AI · TTS · lịch sử
```

- Trình duyệt kết nối thẳng tới Euler Stream bằng JWT ngắn hạn do máy chủ cấp, chỉ cho phép xem đúng kênh đã nhập. API key Euler không bao giờ rời máy chủ.
- Máy chủ không giữ trạng thái nên chạy được trên Vercel (serverless). Vì vậy **trang TikCom phải luôn mở** trong lúc live thì mới nhận được bình luận và đọc lời cảm ơn.
- Mở TikCom trên nhiều thiết bị cùng lúc vẫn được, nhưng gói Euler Free chỉ cho 1 kết nối mỗi lúc. Lịch sử chỉ do một thiết bị ghi để không bị trùng.

## Biến môi trường

Không có tài khoản hay khóa nào nằm trong mã nguồn. Tất cả đọc từ biến môi trường (`.env` khi chạy trên máy, hoặc Environment Variables trên Vercel). Xem mẫu ở `.env.example`.

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `AUTH_USERNAME` / `AUTH_PASSWORD` | ✔ | Tài khoản đăng nhập giao diện |
| `AUTH_SECRET` | khuyên dùng | Khóa ký cookie đăng nhập (`openssl rand -hex 32`). Đổi giá trị này sẽ đăng xuất mọi thiết bị |
| `EULER_API_KEY` | ✔ | API key [Euler Stream](https://www.eulerstream.com) (gói Free là đủ) |
| `EULER_ACCOUNT_ID` | | Account ID Euler. Bỏ trống thì tự lấy từ API key |
| `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY` | ✔ | API AI tương thích OpenAI để dịch & gợi ý |
| `DATABASE_URL` | trên Vercel | Postgres (Neon). Có biến này thì lưu vào Postgres, không thì dùng SQLite |
| `DB_PATH` | | File SQLite khi chạy trên máy (mặc định `data/tikcom.sqlite`) |
| `PORT` | | Cổng khi chạy trên máy (mặc định 3000) |

## Deploy lên Vercel

1. Đẩy repo lên GitHub, rồi trên Vercel chọn **Add New → Project** và import repo. Vercel tự đọc `vercel.json`, không cần chỉnh Build Settings.
2. **Storage → Create Database → Neon (Postgres)**, rồi gắn vào project. Vercel sẽ tự thêm `DATABASE_URL`. Bảng dữ liệu được tạo tự động ở request đầu tiên.
3. **Settings → Environment Variables**: thêm `AUTH_USERNAME`, `AUTH_PASSWORD`, `AUTH_SECRET`, `EULER_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`.
4. **Deployments → Redeploy** để áp dụng biến môi trường.

Muốn build thử trên máy: `npm run build:vercel` sẽ tạo `.vercel/output` (giao diện tĩnh + một Function cho `/api/*`).

## Chạy trên máy cá nhân

Yêu cầu Node.js 22.5 trở lên.

```bash
npm install
cp .env.example .env   # rồi điền các giá trị
npm start
```

Terminal in ra địa chỉ `http://localhost:3000` và `http://<IP-máy>:3000` để mở từ thiết bị khác cùng Wi-Fi. Không đặt `DATABASE_URL` thì lịch sử lưu vào SQLite.

## Cách dùng khi livestream

1. iPhone: mở TikTok và bắt đầu live như bình thường.
2. Thiết bị hỗ trợ: mở TikCom, đăng nhập, nhập `@username` của bạn rồi bấm **Kết nối**. Nếu chưa lên sóng, TikCom tự chờ và kết nối khi bạn bắt đầu live.
3. Bấm **Bật âm thanh** (trình duyệt bắt buộc phải bấm 1 lần mới cho phát tiếng).
4. Đặt loa của thiết bị hỗ trợ gần iPhone để micro thu giọng đọc vào buổi live.
5. Bình luận nước ngoài có viền xanh, bản dịch hiện ngay bên dưới. Bấm vào để xem gợi ý trả lời:
   - Dòng chữ to: phiên âm để bạn đọc.
   - Dòng xám: câu gốc. Dòng xanh: nghĩa tiếng Việt.
   - Nút ▶: máy đọc câu trả lời bằng tiếng gốc.

Tải lại trang khi đang kết nối thì TikCom tự kết nối lại và ghi tiếp vào cùng buổi live. Nút **Demo** chạy dữ liệu giả lập để làm quen giao diện.

Các tùy chọn khác (gợi ý tự động/thủ công, mẫu câu cảm ơn, ngưỡng kim cương, thông tin kênh cho AI) chỉnh trong tab **Cài đặt**.

## Lưu ý

- Gói Euler Free giới hạn 2.500 request/ngày và 1 kết nối WebSocket cùng lúc. Mỗi lần kết nối hoặc kết nối lại dùng 1 request.
- Giọng đọc dùng Google Translate TTS miễn phí, không chính thức.
- Đăng nhập sai 5 lần trong 5 phút sẽ bị chặn tạm thời. Trên Vercel, giới hạn này tính riêng cho từng instance.
- Nếu đeo tai nghe có micro khi live, micro sẽ không thu được loa ngoài, nên cần mixer hoặc sound card.

## Cấu trúc

```
shared/            Dùng chung cho máy chủ và giao diện
  types.ts         Kiểu dữ liệu, cài đặt mặc định
  stats.ts         Thống kê realtime
  gifts.ts         Tên quà tiếng Việt
server/            API (Hono), không giữ trạng thái
  app.ts           Định nghĩa các route /api/*
  auth.ts          Đăng nhập bằng cookie ký HMAC
  euler.ts         Cấp JWT Euler Stream cho trình duyệt
  llm.ts           Prompt phân tích/dịch/phiên âm
  tts.ts           Google TTS (có cache)
  db/driver.ts     Chọn Postgres (Neon) hoặc SQLite, tự tạo bảng
  db/repo.ts       Cài đặt, buổi live, sự kiện, thống kê lịch sử
  node.ts          Chạy trên máy: API + giao diện
  vercel.ts        Điểm vào Vercel Function
web/src/           Giao diện: React 19 + Vite + Tailwind CSS v4 + Zustand
  live/engine.ts   Điều phối buổi live: sự kiện, AI, cảm ơn, thống kê
  live/euler.ts    Kết nối Euler WebSocket, tự kết nối lại, combo quà
  live/demo.ts     Nguồn dữ liệu giả lập
  live/history.ts  Gửi lịch sử về máy chủ theo lô
  components, views, lib
scripts/build-vercel.mjs   Tạo .vercel/output (Build Output API)
```

## Lệnh

| Lệnh | Ý nghĩa |
|---|---|
| `npm start` | Build giao diện rồi chạy server trên máy |
| `npm run serve` | Chạy server với bản build có sẵn |
| `npm run dev` | Phát triển: server tự khởi động lại + Vite hot reload tại `http://localhost:5173` |
| `npm run build:vercel` | Build cho Vercel |
| `npm run typecheck` | Kiểm tra kiểu cho cả backend và frontend |
