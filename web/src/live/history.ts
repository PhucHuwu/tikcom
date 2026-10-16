import type { EventRow } from '@shared/types';
import { api } from '../lib/api';
import { uid, type Timer } from './source';

const FLUSH_MS = 5000;
const MAX_BUFFER = 3000;

/** Mã cố định cho thiết bị này, để máy chủ biết thiết bị nào đang ghi lịch sử */
function clientId() {
  let id = localStorage.getItem('client-id');
  if (!id) {
    id = uid();
    localStorage.setItem('client-id', id);
  }
  return id;
}

type Row = EventRow & { eid: string };

/**
 * Gom sự kiện rồi gửi lên máy chủ theo lô. Nhiều thiết bị cùng mở một kênh thì
 * chỉ một thiết bị được ghi; thiết bị đó tắt thì thiết bị khác tự động ghi tiếp.
 */
export class HistoryWriter {
  private id: number | null = null;
  private events: Row[] = [];
  private langs: { eid: string; lang: string }[] = [];
  private timer: Timer | null = null;
  private flushing = false;
  private counters = { peakViewers: 0, totalLikes: 0 };
  owner = true;

  async open(username: string, demo: boolean) {
    const s = await api<{ id: number; startedAt: number }>('/api/sessions', {
      method: 'POST',
      body: { username, demo, clientId: clientId() },
    });
    this.id = s.id;
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
    return s;
  }

  add(row: Row) {
    if (this.id == null) return;
    this.events.push(row);
    if (this.events.length > MAX_BUFFER) this.events.splice(0, this.events.length - MAX_BUFFER);
  }

  setLang(eid: string, lang: string) {
    if (this.id == null) return;
    const pending = this.events.find((e) => e.eid === eid);
    if (pending) pending.lang = lang;
    else this.langs.push({ eid, lang });
  }

  setCounters(peakViewers: number, totalLikes: number) {
    this.counters = { peakViewers, totalLikes };
  }

  private payload(end: boolean) {
    return { clientId: clientId(), events: this.events.slice(0, 500), langs: this.langs.slice(0, 500), ...this.counters, end };
  }

  async flush(end = false) {
    if (this.id == null || this.flushing) return;
    this.flushing = true;
    const body = this.payload(end);
    try {
      const res = await api<{ owner: boolean }>(`/api/sessions/${this.id}/sync`, { method: 'POST', body });
      this.owner = res.owner;
      this.events.splice(0, body.events.length);
      this.langs.splice(0, body.langs.length);
    } catch (err) {
      // Giữ lại dữ liệu, lần sau gửi lại
      console.warn('[history]', err);
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Gửi phần còn lại và dừng ghi. Khi tải lại/đóng tab (keepalive) thì không đánh dấu kết thúc,
   * để lần mở sau nối tiếp được vào cùng buổi live.
   */
  close(keepalive = false, end = !keepalive) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const id = this.id;
    this.id = null;
    if (id == null) return;
    const body = JSON.stringify(this.payload(end));
    this.events = [];
    this.langs = [];
    void fetch(`/api/sessions/${id}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: keepalive && body.length < 60_000,
    }).catch(() => {});
  }
}
