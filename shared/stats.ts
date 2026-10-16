export interface RankItem {
  name: string;
  value: number;
}

export interface LiveStats {
  startedAt: number | null;
  viewers: number;
  peakViewers: number;
  totalLikes: number;
  comments: number;
  commenters: number;
  gifts: number;
  diamonds: number;
  follows: number;
  shares: number;
  joins: number;
  foreignComments: number;
  languages: RankItem[];
  topGifters: RankItem[];
  topCommenters: RankItem[];
  /** Mỗi phần tử là 1 phút, cũ → mới, tối đa 60 phút gần nhất */
  timeline: { minute: number; comments: number; diamonds: number; viewers: number }[];
}

function top(map: Map<string, { name: string; value: number }>, n: number): RankItem[] {
  return [...map.values()].sort((a, b) => b.value - a.value).slice(0, n);
}

export class StatsTracker {
  private startedAt: number | null = null;
  private viewers = 0;
  peakViewers = 0;
  totalLikes = 0;
  private comments = 0;
  private gifts = 0;
  private diamonds = 0;
  private follows = 0;
  private shares = 0;
  private joins = 0;
  private foreignComments = 0;
  private commenters = new Map<string, { name: string; value: number }>();
  private gifters = new Map<string, { name: string; value: number }>();
  private languages = new Map<string, { name: string; value: number }>();
  private timeline = new Map<number, { minute: number; comments: number; diamonds: number; viewers: number }>();

  reset() {
    Object.assign(this, new StatsTracker());
    this.startedAt = Date.now();
  }

  private bucket(ts: number) {
    const minute = Math.floor(ts / 60000) * 60000;
    let b = this.timeline.get(minute);
    if (!b) {
      b = { minute, comments: 0, diamonds: 0, viewers: this.viewers };
      this.timeline.set(minute, b);
      if (this.timeline.size > 60) this.timeline.delete(this.timeline.keys().next().value!);
    }
    return b;
  }

  chat(userId: string, name: string, ts: number) {
    this.comments++;
    const c = this.commenters.get(userId) ?? { name, value: 0 };
    c.name = name;
    c.value++;
    this.commenters.set(userId, c);
    this.bucket(ts).comments++;
  }

  language(lang: string, langName: string) {
    if (lang !== 'vi') this.foreignComments++;
    const l = this.languages.get(lang) ?? { name: langName || lang, value: 0 };
    if (langName) l.name = langName;
    l.value++;
    this.languages.set(lang, l);
  }

  gift(userId: string, name: string, count: number, diamondsEach: number, ts: number) {
    const total = count * diamondsEach;
    this.gifts += count;
    this.diamonds += total;
    const g = this.gifters.get(userId) ?? { name, value: 0 };
    g.name = name;
    g.value += total;
    this.gifters.set(userId, g);
    this.bucket(ts).diamonds += total;
  }

  follow() {
    this.follows++;
  }

  share() {
    this.shares++;
  }

  join() {
    this.joins++;
  }

  setViewers(n: number) {
    this.viewers = n;
    this.peakViewers = Math.max(this.peakViewers, n);
    this.bucket(Date.now()).viewers = n;
  }

  setTotalLikes(n: number) {
    this.totalLikes = Math.max(this.totalLikes, n);
  }

  snapshot(): LiveStats {
    return {
      startedAt: this.startedAt,
      viewers: this.viewers,
      peakViewers: this.peakViewers,
      totalLikes: this.totalLikes,
      comments: this.comments,
      commenters: this.commenters.size,
      gifts: this.gifts,
      diamonds: this.diamonds,
      follows: this.follows,
      shares: this.shares,
      joins: this.joins,
      foreignComments: this.foreignComments,
      languages: top(this.languages, 10),
      topGifters: top(this.gifters, 10),
      topCommenters: top(this.commenters, 10),
      timeline: [...this.timeline.values()],
    };
  }
}
