# TikCom — Trợ lý livestream TikTok

Chạy trên máy tính, hỗ trợ streamer đang live bằng iPhone:

- Đọc bình luận, quà, theo dõi, chia sẻ theo thời gian thực.
- Tự động đọc lời cảm ơn khi được tặng quà (giọng Google TTS).
- Dịch bình luận nước ngoài sang tiếng Việt, gợi ý 3 câu trả lời kèm **phiên âm tiếng Việt** để streamer tự đọc, hoặc bấm ▶ để máy đọc bằng tiếng gốc.
- Tự soạn câu trả lời tiếng Việt → dịch sang ngôn ngữ người xem kèm phiên âm.
- Thống kê realtime và lưu lịch sử từng buổi live.

## Cài đặt

Yêu cầu Node.js 22.5 trở lên.

```bash
npm install
cp .env.example .env   # rồi điền LLM_API_KEY
npm start
```

Terminal sẽ in ra địa chỉ:

- `http://localhost:3000`: mở trên chính máy tính.
- `http://<IP-máy-tính>:3000`: mở trên điện thoại/iPad **cùng Wi-Fi** (Safari → Chia sẻ → *Thêm vào MH chính* để dùng như app).

## Cách dùng khi livestream

1. iPhone: mở TikTok và bắt đầu live như bình thường.
2. Máy hỗ trợ: mở TikCom, nhập `@username` của bạn → **Kết nối**.
3. Bấm **Bật âm thanh** (trình duyệt bắt buộc phải bấm 1 lần mới cho phát tiếng).
4. Đặt loa của máy hỗ trợ gần iPhone để micro thu giọng đọc vào buổi live.
5. Bình luận nước ngoài có viền xanh, bản dịch hiện ngay bên dưới. Bấm vào để xem gợi ý trả lời:
   - Dòng chữ to: phiên âm để bạn đọc.
   - Dòng xám: câu gốc. Dòng xanh: nghĩa tiếng Việt.
   - Nút ▶: máy đọc câu trả lời bằng tiếng gốc.

Nút **Demo** chạy dữ liệu giả lập để làm quen giao diện khi chưa live.

## Cấu hình (`.env`)

| Biến | Ý nghĩa |
|---|---|
| `LLM_BASE_URL` | Địa chỉ API tương thích OpenAI |
| `LLM_MODEL` | Tên model |
| `LLM_API_KEY` | API key |
| `LLM_CONCURRENCY` | Số yêu cầu LLM chạy song song (mặc định 3) |
| `SIGN_API_KEY` | (Không bắt buộc) API key Euler Stream, giúp kết nối TikTok ổn định hơn |
| `PORT` | Cổng web (mặc định 3000) |
| `DB_PATH` | File dữ liệu (mặc định `data/tikcom.sqlite`) |

Các tùy chọn khác (chế độ gợi ý tự động/thủ công, mẫu câu cảm ơn, ngưỡng kim cương, thông tin kênh cho AI) chỉnh trong tab **Cài đặt**.

## Lưu ý

- Kết nối TikTok dùng thư viện **không chính thức** (`tiktok-live-connector`); có thể ngừng hoạt động khi TikTok thay đổi.
- Giọng đọc dùng Google Translate TTS miễn phí, không chính thức.
- Nếu bạn đeo tai nghe có micro khi live, micro sẽ không thu được loa ngoài → cần mixer/sound card.

## Cấu trúc

```
src/
  server.ts   Express + WebSocket, các API
  live.ts     Điều phối: nhận sự kiện, gọi LLM, cảm ơn, thống kê
  tiktok.ts   Kết nối TikTok Live, tự kết nối lại, xử lý combo quà
  demo.ts     Nguồn dữ liệu giả lập
  llm.ts      Prompt phân tích/dịch/phiên âm
  tts.ts      Google TTS (có cache)
  db.ts       SQLite: cài đặt, buổi live, sự kiện
  stats.ts    Thống kê realtime
public/       Giao diện web (HTML/CSS/JS thuần, không cần build)
```
