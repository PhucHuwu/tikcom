import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { DEFAULT_SETTINGS, type Settings } from './types.js';

mkdirSync(dirname(config.dbPath), { recursive: true });
const db = new DatabaseSync(config.dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    peak_viewers INTEGER NOT NULL DEFAULT 0,
    total_likes INTEGER NOT NULL DEFAULT 0,
    demo INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    ts INTEGER NOT NULL,
    kind TEXT NOT NULL,
    user_id TEXT,
    user_name TEXT,
    text TEXT,
    lang TEXT,
    gift_name TEXT,
    gift_count INTEGER,
    diamonds INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, kind);
`);

export function loadSettings(): Settings {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('app') as { value: string } | undefined;
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    'app',
    JSON.stringify(settings),
  );
}

export function getSetting(key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    value,
  );
}

export function createSession(username: string, demo: boolean): number {
  const r = db
    .prepare('INSERT INTO sessions (username, started_at, demo) VALUES (?, ?, ?)')
    .run(username, Date.now(), demo ? 1 : 0);
  return Number(r.lastInsertRowid);
}

export function endSession(id: number, peakViewers: number, totalLikes: number) {
  db.prepare('UPDATE sessions SET ended_at = ?, peak_viewers = ?, total_likes = ? WHERE id = ?').run(
    Date.now(),
    peakViewers,
    totalLikes,
    id,
  );
}

export function updateSessionCounters(id: number, peakViewers: number, totalLikes: number) {
  db.prepare('UPDATE sessions SET peak_viewers = ?, total_likes = ? WHERE id = ?').run(peakViewers, totalLikes, id);
}

/** Phiên bị bỏ dở (app tắt đột ngột) → đánh dấu kết thúc tại thời điểm event cuối. */
export function closeDanglingSessions() {
  db.exec(`
    UPDATE sessions SET ended_at = COALESCE((SELECT MAX(ts) FROM events WHERE session_id = sessions.id), started_at)
    WHERE ended_at IS NULL
  `);
}

export interface EventRow {
  sessionId: number;
  ts: number;
  kind: string;
  userId?: string;
  userName?: string;
  text?: string;
  lang?: string;
  giftName?: string;
  giftCount?: number;
  diamonds?: number;
}

const insertEvent = db.prepare(`
  INSERT INTO events (session_id, ts, kind, user_id, user_name, text, lang, gift_name, gift_count, diamonds)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export function logEvent(e: EventRow) {
  insertEvent.run(
    e.sessionId,
    e.ts,
    e.kind,
    e.userId ?? null,
    e.userName ?? null,
    e.text ?? null,
    e.lang ?? null,
    e.giftName ?? null,
    e.giftCount ?? null,
    e.diamonds ?? null,
  );
}

const updateLang = db.prepare(
  "UPDATE events SET lang = ? WHERE id = (SELECT id FROM events WHERE session_id = ? AND kind = 'chat' AND ts = ? AND user_id = ? LIMIT 1)",
);

export function setChatLang(sessionId: number, ts: number, userId: string, lang: string) {
  updateLang.run(lang, sessionId, ts, userId);
}

export interface SessionSummary {
  id: number;
  username: string;
  startedAt: number;
  endedAt: number | null;
  durationMin: number;
  peakViewers: number;
  totalLikes: number;
  comments: number;
  commenters: number;
  gifts: number;
  diamonds: number;
  follows: number;
  shares: number;
  joins: number;
  demo: boolean;
}

export function listSessions(limit = 50): SessionSummary[] {
  const rows = db
    .prepare(
      `
    SELECT s.id, s.username, s.started_at AS startedAt, s.ended_at AS endedAt,
           s.peak_viewers AS peakViewers, s.total_likes AS totalLikes, s.demo,
           SUM(e.kind = 'chat') AS comments,
           COUNT(DISTINCT CASE WHEN e.kind = 'chat' THEN e.user_id END) AS commenters,
           COALESCE(SUM(CASE WHEN e.kind = 'gift' THEN e.gift_count END), 0) AS gifts,
           COALESCE(SUM(CASE WHEN e.kind = 'gift' THEN e.gift_count * e.diamonds END), 0) AS diamonds,
           SUM(e.kind = 'follow') AS follows,
           SUM(e.kind = 'share') AS shares,
           SUM(e.kind = 'member') AS joins
    FROM sessions s LEFT JOIN events e ON e.session_id = s.id
    GROUP BY s.id ORDER BY s.started_at DESC LIMIT ?
  `,
    )
    .all(limit) as Record<string, number | string | null>[];
  return rows.map((r) => {
    const startedAt = Number(r.startedAt);
    const endedAt = r.endedAt == null ? null : Number(r.endedAt);
    return {
      id: Number(r.id),
      username: String(r.username),
      startedAt,
      endedAt,
      durationMin: Math.round(((endedAt ?? Date.now()) - startedAt) / 60000),
      peakViewers: Number(r.peakViewers),
      totalLikes: Number(r.totalLikes),
      comments: Number(r.comments ?? 0),
      commenters: Number(r.commenters ?? 0),
      gifts: Number(r.gifts ?? 0),
      diamonds: Number(r.diamonds ?? 0),
      follows: Number(r.follows ?? 0),
      shares: Number(r.shares ?? 0),
      joins: Number(r.joins ?? 0),
      demo: Boolean(r.demo),
    };
  });
}

export function sessionDetail(id: number) {
  const summary = listSessions(1000).find((s) => s.id === id);
  if (!summary) return null;
  const topGifters = db
    .prepare(
      `SELECT user_name AS name, SUM(gift_count * diamonds) AS diamonds, SUM(gift_count) AS gifts
       FROM events WHERE session_id = ? AND kind = 'gift' GROUP BY user_id ORDER BY diamonds DESC LIMIT 10`,
    )
    .all(id);
  const topCommenters = db
    .prepare(
      `SELECT user_name AS name, COUNT(*) AS comments
       FROM events WHERE session_id = ? AND kind = 'chat' GROUP BY user_id ORDER BY comments DESC LIMIT 10`,
    )
    .all(id);
  const languages = db
    .prepare(
      `SELECT lang, COUNT(*) AS count FROM events
       WHERE session_id = ? AND kind = 'chat' AND lang IS NOT NULL GROUP BY lang ORDER BY count DESC`,
    )
    .all(id);
  const giftTypes = db
    .prepare(
      `SELECT gift_name AS name, SUM(gift_count) AS count, SUM(gift_count * diamonds) AS diamonds
       FROM events WHERE session_id = ? AND kind = 'gift' GROUP BY gift_name ORDER BY diamonds DESC LIMIT 15`,
    )
    .all(id);
  const timeline = db
    .prepare(
      `SELECT (ts / 60000) * 60000 AS minute,
              SUM(kind = 'chat') AS comments,
              COALESCE(SUM(CASE WHEN kind = 'gift' THEN gift_count * diamonds END), 0) AS diamonds
       FROM events WHERE session_id = ? GROUP BY minute ORDER BY minute`,
    )
    .all(id);
  return { summary, topGifters, topCommenters, languages, giftTypes, timeline };
}

export function deleteSession(id: number) {
  db.prepare('DELETE FROM events WHERE session_id = ?').run(id);
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}
