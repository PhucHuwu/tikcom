import { giftNameVi } from '@shared/gifts';
import type { LiveUser } from '@shared/types';
import type { LiveSource, SourceEvent, SourceHandlers, Timer } from './source';

const USERS: LiveUser[] = [
  { id: 'd1', name: 'Emily 🌸' },
  { id: 'd2', name: 'Kenji' },
  { id: 'd3', name: 'Min-ji 💜' },
  { id: 'd4', name: 'Wei Chen' },
  { id: 'd5', name: 'Somchai' },
  { id: 'd6', name: 'Putri' },
  { id: 'd7', name: 'Lan Anh' },
  { id: 'd8', name: 'Tuấn' },
  { id: 'd9', name: 'Carlos' },
  { id: 'd10', name: 'Hà Vy' },
];

const COMMENTS: [number, string][] = [
  [0, 'Hello, I love your stream!'],
  [0, 'Where are you from?'],
  [0, 'You are so beautiful 😍'],
  [1, 'こんにちは！日本から見ています'],
  [2, '안녕하세요! 너무 예뻐요'],
  [3, '你好，你在哪里？'],
  [4, 'สวัสดีครับ'],
  [5, 'Halo kak, salam dari Indonesia'],
  [8, '¡Hola! ¿Qué estás cocinando?'],
  [6, 'chị ơi cho em xin link áo với'],
  [7, 'hay quá ad ơi'],
  [9, 'đẹp quá chị ơi ❤️'],
  [7, '👍👍👍'],
  [0, 'What song is this?'],
  [2, '몇 살이에요?'],
];

const GIFTS = [
  { id: '5655', name: 'Rose', diamonds: 1, streak: true },
  { id: '5827', name: 'Ice Cream Cone', diamonds: 1, streak: true },
  { id: '5487', name: 'Finger Heart', diamonds: 5, streak: true },
  { id: '5879', name: 'Doughnut', diamonds: 30, streak: false },
  { id: '6064', name: 'Perfume', diamonds: 20, streak: false },
  { id: '6369', name: 'Lion', diamonds: 29999, streak: false },
];

const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

/** Nguồn dữ liệu giả lập để thử giao diện khi chưa livestream. */
export class DemoSource implements LiveSource {
  private timers: Timer[] = [];
  private viewers = 120;
  private likes = 0;
  private commentIdx = 0;

  constructor(private readonly on: SourceHandlers) {}

  async start() {
    this.on.status({ state: 'connected', message: 'Chế độ demo: dữ liệu giả lập', roomId: 'demo' });
    this.loop(() => this.chat(), 4000, 9000);
    this.loop(() => this.gift(), 12000, 25000);
    this.loop(() => this.social(), 6000, 14000);
    this.loop(() => this.counters(), 3000, 5000);
    this.timers.push(setTimeout(() => this.chat(), 500));
  }

  stop() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private out(e: SourceEvent) {
    this.on.event(e);
  }

  private loop(fn: () => void, min: number, max: number) {
    const tick = () => {
      fn();
      this.timers.push(setTimeout(tick, min + Math.random() * (max - min)));
    };
    this.timers.push(setTimeout(tick, min + Math.random() * (max - min)));
  }

  private chat() {
    const [userIdx, text] = COMMENTS[this.commentIdx++ % COMMENTS.length];
    this.out({ kind: 'chat', user: USERS[userIdx], text });
  }

  private gift() {
    const g = pick(GIFTS.slice(0, Math.random() < 0.95 ? 5 : 6));
    const user = pick(USERS);
    const base = {
      kind: 'gift' as const,
      key: `${user.id}:${g.id}:${Date.now()}`,
      user,
      giftId: g.id,
      giftName: g.name,
      giftNameVi: giftNameVi(g.name),
      diamonds: g.diamonds,
    };
    if (!g.streak) {
      this.out({ ...base, count: 1, final: true });
      return;
    }
    const total = 1 + Math.floor(Math.random() * 9);
    for (let i = 1; i <= total; i++) {
      this.timers.push(setTimeout(() => this.out({ ...base, count: i, final: false }), i * 300));
    }
    this.timers.push(setTimeout(() => this.out({ ...base, count: total, final: true }), total * 300 + 1500));
  }

  private social() {
    const r = Math.random();
    const user = pick(USERS);
    if (r < 0.6) this.out({ kind: 'member', user });
    else if (r < 0.85) this.out({ kind: 'follow', user });
    else this.out({ kind: 'share', user });
  }

  private counters() {
    this.viewers = Math.max(10, this.viewers + Math.round((Math.random() - 0.4) * 15));
    this.likes += Math.floor(Math.random() * 60);
    this.out({ kind: 'viewers', count: this.viewers });
    this.out({ kind: 'likes', total: this.likes });
  }
}
