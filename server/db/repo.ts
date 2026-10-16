import { DEFAULT_SETTINGS, type EventRow, type SessionDetail, type SessionSummary, type Settings } from '../../shared/types.js';
import { THANK_PRESETS } from '../../shared/thanks.js';
import { getDriver } from './driver.js';

/** Thiết bị đang ghi lịch sử không gửi gì trong khoảng này thì thiết bị khác được ghi thay */
const OWNER_TIMEOUT_MS = 45_000;
/** Buổi live không còn thiết bị nào gửi dữ liệu sau khoảng này thì coi như đã kết thúc */
const STALE_SESSION_MS = 5 * 60_000;

const num = (v: unknown) => Number(v ?? 0);

async function getKV(key: string) {
  const db = await getDriver();
  const rows = await db.query<{ value: string }>('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0]?.value;
}

async function setKV(key: string, value: string) {
  const db = await getDriver();
  await db.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [key, value]);
}

export async function loadSettings(): Promise<Settings> {
  const raw = await getKV('app');
  try {
    return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const merged = { ...(await loadSettings()), ...pickSettings(patch) };
  merged.minDiamonds = Math.max(0, Number(merged.minDiamonds) || 0);
  await setKV('app', JSON.stringify(merged));
  return merged;
}

/** Chỉ nhận các khóa hợp lệ, đúng kiểu */
function pickSettings(patch: Partial<Settings>): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined && typeof v === typeof def) out[k] = typeof v === 'string' ? v.slice(0, 2000) : v;
  }
  if (out.thankLang !== undefined && !THANK_PRESETS.some((p) => p.lang === out.thankLang)) delete out.thankLang;
  if (out.suggestMode !== undefined && out.suggestMode !== 'auto' && out.suggestMode !== 'manual') delete out.suggestMode;
  return out as Partial<Settings>;
}

export const getLastUsername = async () => (await getKV('lastUsername')) ?? '';
export const setLastUsername = (name: string) => setKV('lastUsername', name);

async function closeStaleSessions() {
  const db = await getDriver();
  await db.query('UPDATE sessions SET ended_at = last_seen WHERE ended_at IS NULL AND last_seen < $1', [Date.now() - STALE_SESSION_MS]);
}

/** Mở buổi live mới, hoặc nối vào buổi đang diễn ra của cùng kênh (khi nhiều thiết bị cùng mở). */
export async function openSession(username: string, demo: boolean, clientId: string) {
  const db = await getDriver();
  await closeStaleSessions();
  if (!demo) {
    const [open] = await db.query<{ id: number; started_at: number }>(
      'SELECT id, started_at FROM sessions WHERE username = $1 AND demo = $2 AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1',
      [username, false],
    );
    if (open) return { id: num(open.id), startedAt: num(open.started_at) };
  }
  const now = Date.now();
  const [row] = await db.query<{ id: number }>(
    'INSERT INTO sessions (username, started_at, last_seen, owner, demo) VALUES ($1, $2, $2, $3, $4) RETURNING id',
    [username, now, clientId, demo],
  );
  return { id: num(row.id), startedAt: now };
}

export interface SyncPayload {
  clientId: string;
  events: (EventRow & { eid: string })[];
  langs: { eid: string; lang: string }[];
  peakViewers: number;
  totalLikes: number;
  end?: boolean;
}

/** Nhận dữ liệu từ trình duyệt. Chỉ một thiết bị (owner) được ghi để lịch sử không bị trùng. */
export async function syncSession(id: number, p: SyncPayload): Promise<{ owner: boolean }> {
  const db = await getDriver();
  const now = Date.now();
  const [s] = await db.query<{ owner: string; last_seen: number; ended_at: number | null }>(
    'SELECT owner, last_seen, ended_at FROM sessions WHERE id = $1',
    [id],
  );
  if (!s) throw new Error('Không tìm thấy buổi live');
  const owner = s.owner === p.clientId || now - num(s.last_seen) > OWNER_TIMEOUT_MS;
  if (!owner) return { owner: false };

  const events = p.events.slice(0, 500);
  if (events.length) {
    const cols = 11;
    const values: unknown[] = [];
    const tuples = events.map((e, i) => {
      values.push(id, e.eid, e.ts, e.kind, e.userId, e.userName, e.text?.slice(0, 500), e.lang, e.giftName, e.giftCount, e.diamonds);
      return `(${Array.from({ length: cols }, (_, j) => `$${i * cols + j + 1}`).join(', ')})`;
    });
    await db.query(
      `INSERT INTO events (session_id, eid, ts, kind, user_id, user_name, text, lang, gift_name, gift_count, diamonds) VALUES ${tuples.join(', ')}`,
      values,
    );
  }
  for (const l of p.langs.slice(0, 500)) {
    await db.query('UPDATE events SET lang = $1 WHERE session_id = $2 AND eid = $3', [l.lang, id, l.eid]);
  }
  await db.query(
    `UPDATE sessions SET owner = $1, last_seen = $2,
       peak_viewers = GREATEST(peak_viewers, $3), total_likes = GREATEST(total_likes, $4),
       ended_at = CASE WHEN $5 THEN CAST($2 AS BIGINT) ELSE NULL END
     WHERE id = $6`.replace(/GREATEST/g, db.kind === 'sqlite' ? 'MAX' : 'GREATEST'),
    [p.clientId, now, Math.round(p.peakViewers) || 0, Math.round(p.totalLikes) || 0, Boolean(p.end), id],
  );
  return { owner: true };
}

const SUMMARY_SQL = `
  SELECT s.id, s.username, s.started_at, s.ended_at, s.last_seen, s.peak_viewers, s.total_likes, s.demo,
         COUNT(*) FILTER (WHERE e.kind = 'chat') AS comments,
         COUNT(DISTINCT CASE WHEN e.kind = 'chat' THEN e.user_id END) AS commenters,
         COALESCE(SUM(CASE WHEN e.kind = 'gift' THEN e.gift_count END), 0) AS gifts,
         COALESCE(SUM(CASE WHEN e.kind = 'gift' THEN e.gift_count * e.diamonds END), 0) AS diamonds,
         COUNT(*) FILTER (WHERE e.kind = 'follow') AS follows,
         COUNT(*) FILTER (WHERE e.kind = 'share') AS shares,
         COUNT(*) FILTER (WHERE e.kind = 'member') AS joins
  FROM sessions s LEFT JOIN events e ON e.session_id = s.id`;

function toSummary(r: Record<string, unknown>): SessionSummary {
  const startedAt = num(r.started_at);
  const endedAt = r.ended_at == null ? null : num(r.ended_at);
  return {
    id: num(r.id),
    username: String(r.username),
    startedAt,
    endedAt,
    durationMin: Math.round(((endedAt ?? num(r.last_seen)) - startedAt) / 60000),
    peakViewers: num(r.peak_viewers),
    totalLikes: num(r.total_likes),
    comments: num(r.comments),
    commenters: num(r.commenters),
    gifts: num(r.gifts),
    diamonds: num(r.diamonds),
    follows: num(r.follows),
    shares: num(r.shares),
    joins: num(r.joins),
    demo: Boolean(num(r.demo)) || r.demo === true,
  };
}

export async function listSessions(limit = 50): Promise<SessionSummary[]> {
  const db = await getDriver();
  await closeStaleSessions();
  const rows = await db.query(`${SUMMARY_SQL} GROUP BY s.id ORDER BY s.started_at DESC LIMIT $1`, [limit]);
  return rows.map(toSummary);
}

export async function sessionDetail(id: number): Promise<SessionDetail | null> {
  const db = await getDriver();
  const [row] = await db.query(`${SUMMARY_SQL} WHERE s.id = $1 GROUP BY s.id`, [id]);
  if (!row) return null;
  const [topGifters, topCommenters, languages, giftTypes, timeline] = await Promise.all([
    db.query(
      `SELECT MAX(user_name) AS name, SUM(gift_count * diamonds) AS diamonds, SUM(gift_count) AS gifts
       FROM events WHERE session_id = $1 AND kind = 'gift' GROUP BY user_id ORDER BY diamonds DESC LIMIT 10`,
      [id],
    ),
    db.query(
      `SELECT MAX(user_name) AS name, COUNT(*) AS comments
       FROM events WHERE session_id = $1 AND kind = 'chat' GROUP BY user_id ORDER BY comments DESC LIMIT 10`,
      [id],
    ),
    db.query(
      `SELECT lang, COUNT(*) AS count FROM events
       WHERE session_id = $1 AND kind = 'chat' AND lang IS NOT NULL GROUP BY lang ORDER BY count DESC`,
      [id],
    ),
    db.query(
      `SELECT gift_name AS name, SUM(gift_count) AS count, SUM(gift_count * diamonds) AS diamonds
       FROM events WHERE session_id = $1 AND kind = 'gift' GROUP BY gift_name ORDER BY diamonds DESC LIMIT 15`,
      [id],
    ),
    db.query(
      `SELECT (ts / 60000) * 60000 AS minute,
              COUNT(*) FILTER (WHERE kind = 'chat') AS comments,
              COALESCE(SUM(CASE WHEN kind = 'gift' THEN gift_count * diamonds END), 0) AS diamonds
       FROM events WHERE session_id = $1 GROUP BY minute ORDER BY minute`,
      [id],
    ),
  ]);
  return {
    summary: toSummary(row),
    topGifters: topGifters.map((r) => ({ name: String(r.name), diamonds: num(r.diamonds), gifts: num(r.gifts) })),
    topCommenters: topCommenters.map((r) => ({ name: String(r.name), comments: num(r.comments) })),
    languages: languages.map((r) => ({ lang: String(r.lang), count: num(r.count) })),
    giftTypes: giftTypes.map((r) => ({ name: String(r.name), count: num(r.count), diamonds: num(r.diamonds) })),
    timeline: timeline.map((r) => ({ minute: num(r.minute), comments: num(r.comments), diamonds: num(r.diamonds) })),
  };
}

export async function deleteSession(id: number) {
  const db = await getDriver();
  await db.query('DELETE FROM events WHERE session_id = $1', [id]);
  await db.query('DELETE FROM sessions WHERE id = $1', [id]);
}
