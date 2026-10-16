/** Câu cảm ơn mẫu theo ngôn ngữ giọng đọc. Biến: {name}, {count}, {gift} */
export interface ThankPreset {
  /** Mã ngôn ngữ Google TTS */
  lang: string;
  /** Tên hiển thị bằng tiếng Việt */
  label: string;
  gift: string;
  follow: string;
  share: string;
  /** Câu nghe thử âm lượng */
  hello: string;
  /** Gọi thay tên khi tên người xem chỉ có emoji */
  friend: string;
}

export const THANK_PRESETS: ThankPreset[] = [
  {
    lang: 'vi',
    label: 'Tiếng Việt',
    gift: 'Cảm ơn {name} đã tặng {count} {gift}!',
    follow: 'Cảm ơn {name} đã theo dõi kênh!',
    share: 'Cảm ơn {name} đã chia sẻ buổi live!',
    hello: 'Xin chào mọi người, cảm ơn đã vào xem live!',
    friend: 'bạn',
  },
  {
    lang: 'en',
    label: 'Tiếng Anh',
    gift: 'Thank you {name} for the {count} {gift}!',
    follow: 'Thank you {name} for the follow!',
    share: 'Thank you {name} for sharing the live!',
    hello: 'Hello everyone, thanks for watching!',
    friend: 'friend',
  },
  {
    lang: 'zh-CN',
    label: 'Tiếng Trung',
    gift: '谢谢{name}送的{count}个{gift}！',
    follow: '谢谢{name}的关注！',
    share: '谢谢{name}分享直播！',
    hello: '大家好，谢谢来看直播！',
    friend: '朋友',
  },
  {
    lang: 'ja',
    label: 'Tiếng Nhật',
    gift: '{name}さん、{gift}を{count}個ありがとう！',
    follow: '{name}さん、フォローありがとう！',
    share: '{name}さん、シェアありがとう！',
    hello: 'みなさん、こんにちは。見てくれてありがとう！',
    friend: 'みなさん',
  },
  {
    lang: 'ko',
    label: 'Tiếng Hàn',
    gift: '{name}님, {gift} {count}개 감사합니다!',
    follow: '{name}님, 팔로우 감사합니다!',
    share: '{name}님, 공유해 주셔서 감사합니다!',
    hello: '안녕하세요 여러분, 봐주셔서 감사합니다!',
    friend: '친구',
  },
  {
    lang: 'th',
    label: 'Tiếng Thái',
    gift: 'ขอบคุณ {name} สำหรับ {gift} {count} ชิ้นนะคะ!',
    follow: 'ขอบคุณ {name} ที่กดติดตามนะคะ!',
    share: 'ขอบคุณ {name} ที่แชร์ไลฟ์นะคะ!',
    hello: 'สวัสดีทุกคน ขอบคุณที่มาดูไลฟ์นะคะ!',
    friend: 'เพื่อน',
  },
  {
    lang: 'id',
    label: 'Tiếng Indonesia',
    gift: 'Terima kasih {name} untuk {count} {gift}!',
    follow: 'Terima kasih {name} sudah follow!',
    share: 'Terima kasih {name} sudah share live ini!',
    hello: 'Halo semuanya, terima kasih sudah menonton!',
    friend: 'teman',
  },
  {
    lang: 'es',
    label: 'Tiếng Tây Ban Nha',
    gift: '¡Gracias {name} por {count} {gift}!',
    follow: '¡Gracias {name} por seguirme!',
    share: '¡Gracias {name} por compartir el directo!',
    hello: '¡Hola a todos, gracias por ver el directo!',
    friend: 'amigo',
  },
  {
    lang: 'pt',
    label: 'Tiếng Bồ Đào Nha',
    gift: 'Obrigado {name} pelos {count} {gift}!',
    follow: 'Obrigado {name} por seguir!',
    share: 'Obrigado {name} por compartilhar a live!',
    hello: 'Olá pessoal, obrigado por assistir!',
    friend: 'amigo',
  },
  {
    lang: 'fr',
    label: 'Tiếng Pháp',
    gift: 'Merci {name} pour les {count} {gift} !',
    follow: 'Merci {name} pour le follow !',
    share: "Merci {name} d'avoir partagé le live !",
    hello: "Bonjour tout le monde, merci d'être là !",
    friend: 'mon ami',
  },
  {
    lang: 'de',
    label: 'Tiếng Đức',
    gift: 'Danke {name} für {count} {gift}!',
    follow: 'Danke {name} fürs Folgen!',
    share: 'Danke {name} fürs Teilen!',
    hello: 'Hallo zusammen, danke fürs Zuschauen!',
    friend: 'Freund',
  },
  {
    lang: 'ru',
    label: 'Tiếng Nga',
    gift: 'Спасибо, {name}, за {gift}, {count} шт.!',
    follow: 'Спасибо, {name}, за подписку!',
    share: 'Спасибо, {name}, что поделились эфиром!',
    hello: 'Всем привет, спасибо, что смотрите!',
    friend: 'друг',
  },
];

export const thankPreset = (lang: string) => THANK_PRESETS.find((p) => p.lang === lang) ?? THANK_PRESETS[0];

/** Mẫu câu đang là mặc định của một ngôn ngữ nào đó (chưa bị sửa tay) */
export const isPresetTemplate = (kind: 'gift' | 'follow' | 'share', text: string) =>
  THANK_PRESETS.some((p) => p[kind] === text.trim());
