// ---------- Tiện ích ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');

const fmtTime = (ts) => new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

const fmtDuration = (ms) => {
  const m = Math.max(0, Math.floor(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}g ${m % 60}p` : `${m} phút`;
};

let toastTimer;
function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast${isError ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), isError ? 5000 : 2500);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Lỗi HTTP ${res.status}`);
  return data;
}

const isMobile = () => window.matchMedia('(max-width: 860px)').matches;

// ---------- Trạng thái ----------
const state = {
  status: { state: 'idle', message: 'Chưa kết nối', demo: false },
  settings: {},
  events: new Map(),
  order: [],
  stats: null,
  selectedId: null,
  lastManualPick: 0,
  customReplies: new Map(),
};

// ---------- Âm thanh / TTS ----------
const audio = new Audio();
audio.preload = 'auto';
const SILENT_MP3 =
  'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRBqpAAAAAAD/+xDEAAPAAAGkAAAAIAAANIAAAARMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxCmDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';

const tts = {
  enabled: localStorage.getItem('tts-enabled') === '1',
  queue: [],
  playing: false,
  current: null,
  volume: Number(localStorage.getItem('tts-volume') ?? 1),
};
audio.volume = tts.volume;

function ttsUrl(text, lang) {
  return `/api/tts?lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(text)}`;
}

function updateSoundButton() {
  const btn = $('#btn-sound');
  btn.classList.toggle('off', !tts.enabled);
  btn.textContent = tts.enabled ? '🔊 Âm thanh: Bật' : '🔇 Bật âm thanh';
}

/** Trình duyệt (nhất là Safari iOS) chỉ cho phát âm thanh sau khi người dùng chạm vào trang. */
async function unlockAudio() {
  try {
    audio.src = SILENT_MP3;
    await audio.play();
  } catch {
    /* bỏ qua */
  }
}

function enqueueSpeech(text, lang = 'vi') {
  if (!tts.enabled) return;
  tts.queue.push({ text, lang });
  if (tts.queue.length > 20) tts.queue.shift();
  playNext();
}

async function playNext() {
  if (tts.playing || tts.queue.length === 0) return;
  const item = tts.queue.shift();
  await playAudio(item);
  playNext();
}

function playAudio(item, onState) {
  return new Promise((resolve) => {
    tts.playing = true;
    tts.current = item;
    onState?.(true);
    const done = () => {
      audio.onended = audio.onerror = null;
      tts.playing = false;
      tts.current = null;
      onState?.(false);
      resolve();
    };
    audio.onended = done;
    audio.onerror = () => {
      toast('Không phát được giọng đọc (lỗi TTS)', true);
      done();
    };
    audio.src = ttsUrl(item.text, item.lang);
    audio.play().catch((err) => {
      if (err?.name === 'NotAllowedError') {
        tts.enabled = false;
        updateSoundButton();
        toast('Trình duyệt chặn âm thanh — bấm "Bật âm thanh" để cho phép', true);
      }
      done();
    });
  });
}

/** Phát ngay (ưu tiên hơn hàng đợi cảm ơn) khi streamer bấm nút ▶ */
function playNow(text, lang, button) {
  if (tts.current?.manual && tts.current.text === text) {
    audio.pause();
    audio.onended?.();
    return;
  }
  if (tts.playing) {
    audio.pause();
    audio.onended?.();
  }
  const setBtn = (on) => {
    if (!button) return;
    button.classList.toggle('playing', on);
    button.textContent = on ? '■' : '▶';
  };
  playAudio({ text, lang, manual: true }, setBtn).then(playNext);
}

$('#btn-sound').addEventListener('click', async () => {
  tts.enabled = !tts.enabled;
  localStorage.setItem('tts-enabled', tts.enabled ? '1' : '0');
  updateSoundButton();
  if (tts.enabled) {
    await unlockAudio();
    requestWakeLock();
    toast('Đã bật âm thanh trên thiết bị này');
  } else {
    tts.queue = [];
    audio.pause();
  }
});

// Nếu trước đó đã bật, chạm lần đầu vào trang sẽ mở khóa âm thanh.
document.addEventListener(
  'pointerdown',
  () => {
    if (tts.enabled) unlockAudio();
    requestWakeLock();
  },
  { once: true },
);

// Giữ màn hình luôn sáng
let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    }
  } catch {
    /* không hỗ trợ */
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestWakeLock();
});

// ---------- WebSocket ----------
let ws;
let wsRetry = 0;
function connectWs() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => (wsRetry = 0);
  ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
  ws.onclose = () => {
    renderStatus({ state: 'reconnecting', message: 'Mất kết nối tới máy chủ TikCom, đang thử lại...' });
    setTimeout(connectWs, Math.min(1000 * 2 ** wsRetry++, 10000));
  };
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'init':
      state.events.clear();
      state.order = [];
      $('#feed').innerHTML = '';
      msg.events.forEach((e) => upsertEvent(e, true));
      applySettings(msg.settings);
      renderStatus(msg.status);
      state.stats = msg.stats;
      renderStats();
      if (msg.lastUsername && !$('#username').value) $('#username').value = msg.lastUsername;
      scrollFeed(true);
      renderReply();
      break;
    case 'status':
      renderStatus(msg.status);
      break;
    case 'event':
      upsertEvent(msg.event);
      break;
    case 'stats':
      state.stats = msg.stats;
      renderStats();
      break;
    case 'settings':
      applySettings(msg.settings);
      break;
    case 'speak':
      enqueueSpeech(msg.text, msg.lang);
      break;
    case 'clear':
      state.events.clear();
      state.order = [];
      state.selectedId = null;
      state.customReplies.clear();
      $('#feed').innerHTML = '';
      renderReply();
      break;
  }
}

// ---------- Kết nối TikTok ----------
function renderStatus(status) {
  state.status = { ...state.status, ...status };
  const s = state.status;
  $('#status').dataset.state = s.state;
  $('#status-text').textContent = s.message;
  const active = s.state !== 'idle';
  $('#btn-connect').hidden = active;
  $('#btn-demo').hidden = active;
  $('#btn-disconnect').hidden = !active;
  $('#username').disabled = active;
}

$('#connect-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('#username').value.trim();
  if (!username) return toast('Nhập username TikTok của bạn (ví dụ @tenkenh)', true);
  try {
    await api('/api/connect', { method: 'POST', body: { username } });
  } catch (err) {
    toast(err.message, true);
  }
});

$('#btn-demo').addEventListener('click', async () => {
  try {
    await api('/api/connect', { method: 'POST', body: { demo: true } });
  } catch (err) {
    toast(err.message, true);
  }
});

$('#btn-disconnect').addEventListener('click', async () => {
  try {
    await api('/api/disconnect', { method: 'POST' });
  } catch (err) {
    toast(err.message, true);
  }
});

// ---------- Feed ----------
const feed = $('#feed');
let stickToBottom = true;

feed.addEventListener('scroll', () => {
  stickToBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
  if (stickToBottom) $('#btn-jump').hidden = true;
});

$('#btn-jump').addEventListener('click', () => scrollFeed(true));

function scrollFeed(force = false) {
  if (force || stickToBottom) {
    feed.scrollTop = feed.scrollHeight;
    stickToBottom = true;
    $('#btn-jump').hidden = true;
  } else {
    $('#btn-jump').hidden = false;
  }
}

const isForeign = (e) => e.kind === 'chat' && e.analysis?.result && !e.analysis.result.isVietnamese;

function avatarHtml(user) {
  if (user.avatar) return `<img class="avatar" src="${escapeHtml(user.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`;
  return `<div class="avatar">${escapeHtml((user.name || '?').trim().charAt(0).toUpperCase())}</div>`;
}

function langBadge(e) {
  const a = e.analysis || {};
  if (a.status === 'pending') return '<span class="badge pending">đang dịch…</span>';
  if (a.status === 'error') return '<span class="badge error">lỗi</span>';
  if (isForeign(e)) return `<span class="badge">${escapeHtml(a.result.lang)}</span>`;
  return '';
}

function renderItem(e) {
  const el = document.createElement('div');
  el.dataset.id = e.id;
  el.dataset.kind = e.kind;
  const time = `<span>${fmtTime(e.ts)}</span>`;

  if (e.kind === 'chat') {
    const foreign = isForeign(e);
    el.className = `item chat${foreign ? ' foreign' : ''}${state.selectedId === e.id ? ' selected' : ''}`;
    el.innerHTML = `
      ${avatarHtml(e.user)}
      <div class="body">
        <div class="name">${escapeHtml(e.user.name)} ${time} ${langBadge(e)}</div>
        <div class="text">${escapeHtml(e.text)}</div>
        ${foreign && e.analysis.result.translation ? `<div class="translation">🇻🇳 ${escapeHtml(e.analysis.result.translation)}</div>` : ''}
      </div>`;
  } else if (e.kind === 'gift') {
    el.className = `item gift${e.final ? '' : ' streaking'}`;
    const total = e.count * e.diamonds;
    el.innerHTML = `
      ${e.image ? `<img class="gift-img" src="${escapeHtml(e.image)}" alt="" referrerpolicy="no-referrer" />` : '<div class="avatar">🎁</div>'}
      <div class="body">
        <div class="name">${escapeHtml(e.user.name)} ${time}</div>
        <div class="text">tặng ${escapeHtml(e.giftNameVi)} × ${e.count}${total ? ` · ${fmt(total)} 💎` : ''}${e.final ? '' : ' …'}</div>
      </div>`;
  } else {
    const label = { follow: '➕ đã theo dõi', share: '↗️ đã chia sẻ buổi live', member: '👋 đã vào phòng' }[e.kind];
    el.className = `item social ${e.kind}`;
    el.innerHTML = `<div class="body"><div class="text">${escapeHtml(e.user.name)} ${label}</div></div>`;
  }
  applyFilter(el, e);
  return el;
}

function applyFilter(el, e) {
  const onlyForeign = $('#f-foreign').checked;
  const showJoins = $('#f-joins').checked;
  let visible = true;
  if (e.kind === 'member' && !showJoins) visible = false;
  if (onlyForeign && e.kind === 'chat' && !isForeign(e) && e.analysis?.status !== 'pending') visible = false;
  if (onlyForeign && (e.kind === 'member' || e.kind === 'follow' || e.kind === 'share')) visible = false;
  el.hidden = !visible;
}

$('#f-foreign').addEventListener('change', refilter);
$('#f-joins').addEventListener('change', refilter);
function refilter() {
  for (const el of feed.children) {
    const e = state.events.get(el.dataset.id);
    if (e) applyFilter(el, e);
  }
  localStorage.setItem('filters', JSON.stringify({ foreign: $('#f-foreign').checked, joins: $('#f-joins').checked }));
  scrollFeed(true);
}
try {
  const f = JSON.parse(localStorage.getItem('filters') || '{}');
  $('#f-foreign').checked = Boolean(f.foreign);
  $('#f-joins').checked = Boolean(f.joins);
} catch {
  /* bỏ qua */
}

const MAX_FEED = 400;

function upsertEvent(e, initial = false) {
  const prev = state.events.get(e.id);
  state.events.set(e.id, e);
  const el = renderItem(e);
  const existing = prev && feed.querySelector(`[data-id="${CSS.escape(e.id)}"]`);
  if (existing) {
    existing.replaceWith(el);
  } else {
    state.order.push(e.id);
    feed.appendChild(el);
    if (state.order.length > MAX_FEED) {
      const old = state.order.shift();
      state.events.delete(old);
      feed.querySelector(`[data-id="${CSS.escape(old)}"]`)?.remove();
    }
  }
  if (initial) return;
  if (!existing) scrollFeed();

  if (e.kind === 'chat') {
    if (e.id === state.selectedId) renderReply();
    else maybeAutoSelect(e);
  }
}

/** Tự chuyển sang comment nước ngoài mới nhất, trừ khi streamer vừa chọn tay (để không bị nhảy khi đang đọc). */
function maybeAutoSelect(e) {
  if (!$('#auto-follow').checked || isMobile()) return;
  if (!isForeign(e) || e.analysis.status !== 'done') return;
  if (Date.now() - state.lastManualPick < 15000) return;
  if (tts.current?.manual) return;
  select(e.id, false);
}

feed.addEventListener('click', (ev) => {
  const item = ev.target.closest('.item.chat');
  if (!item) return;
  select(item.dataset.id, true);
});

async function select(id, manual) {
  const prevSel = state.selectedId && feed.querySelector(`[data-id="${CSS.escape(state.selectedId)}"]`);
  prevSel?.classList.remove('selected');
  state.selectedId = id;
  feed.querySelector(`[data-id="${CSS.escape(id)}"]`)?.classList.add('selected');
  if (manual) {
    state.lastManualPick = Date.now();
    if (isMobile()) $('#reply-panel').classList.add('open');
  }
  renderReply();

  const e = state.events.get(id);
  if (manual && e && (e.analysis.status === 'none' || e.analysis.status === 'error' || (e.analysis.status === 'skipped' && !e.analysis.result))) {
    try {
      await api(`/api/analyze/${encodeURIComponent(id)}`, { method: 'POST' });
    } catch (err) {
      toast(err.message, true);
    }
  }
}

$('#btn-close-sheet').addEventListener('click', () => $('#reply-panel').classList.remove('open'));

// ---------- Panel gợi ý ----------
function suggestionHtml(s, i, lang) {
  return `
    <div class="suggestion">
      <div class="num">${i === 'custom' ? 'CÂU CỦA BẠN' : `GỢI Ý ${i + 1}`}</div>
      <div class="phonetic">${escapeHtml(s.phonetic || s.text)}</div>
      <div class="text">${escapeHtml(s.text)}</div>
      <div class="meaning">🇻🇳 ${escapeHtml(s.meaning)}</div>
      <div class="play"><button class="play-btn" type="button" data-text="${escapeHtml(s.text)}" data-lang="${escapeHtml(lang)}" title="Phát giọng đọc">▶</button></div>
    </div>`;
}

function renderReply() {
  const box = $('#reply');
  const e = state.selectedId && state.events.get(state.selectedId);
  if (!e) {
    box.innerHTML = `<div class="empty">Bấm vào một bình luận để xem bản dịch<br />và gợi ý câu trả lời kèm phiên âm.<br /><br /><span class="muted">Bình luận nước ngoài có viền xanh ở bên trái.</span></div>`;
    return;
  }
  const a = e.analysis || {};
  const r = a.result;
  let html = `
    <div class="original">
      <div class="who">${escapeHtml(e.user.name)} · ${fmtTime(e.ts)} ${r && !r.isVietnamese ? `<span class="badge">${escapeHtml(r.langName || r.lang)}</span>` : ''}</div>
      <div class="comment">${escapeHtml(e.text)}</div>
      ${r?.commentPhonetic && !r.isVietnamese ? `<div class="phonetic">🗣 ${escapeHtml(r.commentPhonetic)}</div>` : ''}
      ${r?.translation && !r.isVietnamese ? `<div class="vi">🇻🇳 ${escapeHtml(r.translation)}</div>` : ''}
      ${
        r && !r.isVietnamese
          ? `<div class="tools"><button class="btn small ghost" type="button" data-speak="${escapeHtml(e.text)}" data-lang="${escapeHtml(r.lang)}">🔈 Nghe comment</button>
             <button class="btn small ghost" type="button" id="btn-reanalyze">↻ Gợi ý khác</button></div>`
          : ''
      }
    </div>`;

  if (a.status === 'pending' || a.status === 'none') {
    html += `<div class="loading"><span class="spinner"></span> Đang dịch và tạo gợi ý…</div>`;
  } else if (a.status === 'error') {
    html += `<div class="loading">⚠️ ${escapeHtml(a.error || 'Lỗi')} <button class="btn small" type="button" id="btn-retry">Thử lại</button></div>`;
  } else if (!r || r.isVietnamese) {
    html += `<div class="empty">Đây là bình luận tiếng Việt — không cần dịch.</div>`;
  } else {
    html += r.suggestions.map((s, i) => suggestionHtml(s, i, r.lang)).join('');
    const custom = state.customReplies.get(e.id);
    if (custom) html += suggestionHtml(custom, 'custom', r.lang);
    html += `
      <div class="custom-reply">
        <h3>Tự soạn câu trả lời bằng tiếng Việt → dịch sang ${escapeHtml(r.langName || r.lang)}</h3>
        <form id="custom-form">
          <input id="custom-text" type="text" placeholder="Ví dụ: Mình ở Hà Nội, cảm ơn bạn nhé!" autocomplete="off" />
          <button class="btn primary" type="submit">Dịch</button>
        </form>
      </div>`;
  }

  const focused = document.activeElement?.id === 'custom-text';
  const draft = $('#custom-text')?.value;
  box.innerHTML = html;
  if (draft) $('#custom-text').value = draft;
  if (focused) $('#custom-text')?.focus();
}

$('#reply').addEventListener('click', async (ev) => {
  const play = ev.target.closest('.play-btn');
  if (play) {
    state.lastManualPick = Date.now();
    if (!tts.enabled) {
      tts.enabled = true;
      localStorage.setItem('tts-enabled', '1');
      updateSoundButton();
    }
    playNow(play.dataset.text, play.dataset.lang, play);
    return;
  }
  const speak = ev.target.closest('[data-speak]');
  if (speak) {
    playNow(speak.dataset.speak, speak.dataset.lang);
    return;
  }
  if (ev.target.id === 'btn-retry' || ev.target.id === 'btn-reanalyze') {
    const e = state.events.get(state.selectedId);
    if (!e) return;
    state.lastManualPick = Date.now();
    e.analysis = { status: 'none' };
    try {
      await api(`/api/analyze/${encodeURIComponent(e.id)}?force=1`, { method: 'POST' });
    } catch (err) {
      toast(err.message, true);
    }
  }
});

$('#reply').addEventListener('submit', async (ev) => {
  if (ev.target.id !== 'custom-form') return;
  ev.preventDefault();
  const e = state.events.get(state.selectedId);
  const input = $('#custom-text');
  const text = input.value.trim();
  if (!e || !text) return;
  state.lastManualPick = Date.now();
  const btn = ev.target.querySelector('button');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    const r = e.analysis.result;
    const s = await api('/api/translate', { method: 'POST', body: { text, lang: r.lang, langName: r.langName } });
    state.customReplies.set(e.id, s);
    input.value = '';
    renderReply();
  } catch (err) {
    toast(err.message, true);
    btn.disabled = false;
    btn.textContent = 'Dịch';
  }
});

// ---------- KPI & Thống kê ----------
function renderStats() {
  const s = state.stats;
  if (!s) return;
  const live = state.status.state !== 'idle' && s.startedAt;
  const kpis = [
    ['👀 Đang xem', fmt(s.viewers)],
    ['💬 Bình luận', fmt(s.comments)],
    ['💎 Kim cương', fmt(s.diamonds)],
    ['❤️ Lượt thích', fmt(s.totalLikes)],
    ['➕ Theo dõi', fmt(s.follows), 'extra'],
    ['🌍 Nước ngoài', fmt(s.foreignComments), 'extra'],
    ['🎁 Quà', fmt(s.gifts), 'extra'],
    ['⏱ Thời lượng', live ? fmtDuration(Date.now() - s.startedAt) : '—', 'extra'],
  ];
  $('#kpis').innerHTML = kpis
    .map(([l, v, cls]) => `<div class="kpi ${cls || ''}"><div class="label">${l}</div><div class="value">${v}</div></div>`)
    .join('');

  if (!$('#tab-stats').classList.contains('active')) return;
  $('#stats').innerHTML = `
    <div class="panel wide">
      <div class="panel-head"><h2>Diễn biến theo phút</h2></div>
      ${timelineChart(s.timeline)}
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Tổng quan</h2></div>
      <div class="summary-grid">
        ${kpiBox('Người xem cao nhất', fmt(s.peakViewers))}
        ${kpiBox('Người bình luận', fmt(s.commenters))}
        ${kpiBox('Lượt vào phòng', fmt(s.joins))}
        ${kpiBox('Chia sẻ', fmt(s.shares))}
        ${kpiBox('Số quà', fmt(s.gifts))}
        ${kpiBox('Bình luận/phút', s.startedAt ? (s.comments / Math.max(1, (Date.now() - s.startedAt) / 60000)).toFixed(1) : '0')}
      </div>
    </div>
    <div class="panel"><div class="panel-head"><h2>🏆 Top người tặng quà</h2></div>${rankList(s.topGifters, '💎')}</div>
    <div class="panel"><div class="panel-head"><h2>💬 Bình luận nhiều nhất</h2></div>${rankList(s.topCommenters)}</div>
    <div class="panel"><div class="panel-head"><h2>🌍 Ngôn ngữ người xem</h2></div>${rankList(s.languages, '', true)}</div>`;
}

const kpiBox = (label, value) => `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div></div>`;

function rankList(items, unit = '', bars = false) {
  if (!items?.length) return '<p class="muted pad">Chưa có dữ liệu</p>';
  const max = Math.max(...items.map((i) => i.value), 1);
  return `<ol class="rank">${items
    .map(
      (it, i) => `<li><span class="pos">${i + 1}</span><span class="n">${escapeHtml(it.name)}${
        bars ? `<div class="bar"><span style="width:${(it.value / max) * 100}%"></span></div>` : ''
      }</span><span class="v">${fmt(it.value)} ${unit}</span></li>`,
    )
    .join('')}</ol>`;
}

function timelineChart(points) {
  if (!points?.length) return '<p class="muted pad">Chưa có dữ liệu</p>';
  const W = 600;
  const H = 160;
  const pad = 4;
  const n = points.length;
  const maxC = Math.max(...points.map((p) => p.comments), 1);
  const maxV = Math.max(...points.map((p) => p.viewers ?? 0), 1);
  const maxD = Math.max(...points.map((p) => p.diamonds), 1);
  const bw = (W - pad * 2) / n;
  const x = (i) => pad + i * bw + bw / 2;
  const bars = points
    .map((p, i) => {
      const h = (p.comments / maxC) * (H - 20);
      return `<rect x="${pad + i * bw + bw * 0.15}" y="${H - h}" width="${bw * 0.7}" height="${h}" rx="2" fill="#fe2c55" opacity="0.75"><title>${fmtTime(p.minute)}: ${p.comments} bình luận</title></rect>`;
    })
    .join('');
  const viewerLine = points.some((p) => p.viewers)
    ? `<polyline fill="none" stroke="#25f4ee" stroke-width="2" points="${points.map((p, i) => `${x(i)},${H - ((p.viewers ?? 0) / maxV) * (H - 20)}`).join(' ')}" />`
    : '';
  const gifts = points
    .map((p, i) => (p.diamonds ? `<circle cx="${x(i)}" cy="${H - (p.diamonds / maxD) * (H - 20)}" r="4" fill="#ffcf4a"><title>${fmt(p.diamonds)} 💎</title></circle>` : ''))
    .join('');
  return `<div class="chart">
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${bars}${viewerLine}${gifts}</svg>
    <div class="legend"><span><i style="background:#fe2c55"></i>Bình luận (tối đa ${fmt(maxC)})</span><span><i style="background:#25f4ee"></i>Người xem (tối đa ${fmt(maxV)})</span><span><i style="background:#ffcf4a"></i>Kim cương</span>
    <span style="margin-left:auto">${fmtTime(points[0].minute)} → ${fmtTime(points[n - 1].minute)}</span></div>
  </div>`;
}

setInterval(renderStats, 5000);

// ---------- Lịch sử ----------
async function loadSessions() {
  try {
    const sessions = await api('/api/sessions');
    $('#sessions').innerHTML = sessions.length
      ? sessions
          .map(
            (s) => `<div class="session-row" data-id="${s.id}">
              <div class="t">${s.demo ? '🧪 Demo' : '@' + escapeHtml(s.username)} · ${new Date(s.startedAt).toLocaleString('vi-VN')}</div>
              <div class="m">${fmtDuration((s.endedAt ?? Date.now()) - s.startedAt)} · ${fmt(s.comments)} bình luận · ${fmt(s.diamonds)} 💎 · ${fmt(s.peakViewers)} người xem cao nhất${s.endedAt ? '' : ' · 🔴 đang live'}</div>
            </div>`,
          )
          .join('')
      : '<p class="muted pad">Chưa có buổi live nào.</p>';
  } catch (err) {
    toast(err.message, true);
  }
}

$('#sessions').addEventListener('click', async (ev) => {
  const row = ev.target.closest('.session-row');
  if (!row) return;
  $$('.session-row').forEach((r) => r.classList.toggle('active', r === row));
  try {
    renderSessionDetail(await api(`/api/sessions/${row.dataset.id}`));
  } catch (err) {
    toast(err.message, true);
  }
});

$('#btn-refresh-history').addEventListener('click', loadSessions);

function renderSessionDetail(d) {
  const s = d.summary;
  const toRank = (rows, key) => rows.map((r) => ({ name: r.name || r.lang || '?', value: Number(r[key]) }));
  $('#session-detail').innerHTML = `
    <div class="panel-head"><h2>${s.demo ? '🧪 Demo' : '@' + escapeHtml(s.username)} · ${new Date(s.startedAt).toLocaleString('vi-VN')}</h2>
      <button class="btn small danger" type="button" data-delete="${s.id}">Xóa</button></div>
    <div class="summary-grid">
      ${kpiBox('Thời lượng', fmtDuration((s.endedAt ?? Date.now()) - s.startedAt))}
      ${kpiBox('Người xem cao nhất', fmt(s.peakViewers))}
      ${kpiBox('Bình luận', fmt(s.comments))}
      ${kpiBox('Người bình luận', fmt(s.commenters))}
      ${kpiBox('Kim cương', fmt(s.diamonds))}
      ${kpiBox('Số quà', fmt(s.gifts))}
      ${kpiBox('Lượt thích', fmt(s.totalLikes))}
      ${kpiBox('Theo dõi mới', fmt(s.follows))}
      ${kpiBox('Chia sẻ', fmt(s.shares))}
      ${kpiBox('Lượt vào phòng', fmt(s.joins))}
    </div>
    ${timelineChart(d.timeline.map((t) => ({ minute: Number(t.minute), comments: Number(t.comments), diamonds: Number(t.diamonds) })))}
    <div class="detail-grid">
      <div><h3>🏆 Top tặng quà</h3>${rankList(toRank(d.topGifters, 'diamonds'), '💎')}</div>
      <div><h3>💬 Bình luận nhiều nhất</h3>${rankList(toRank(d.topCommenters, 'comments'))}</div>
      <div><h3>🎁 Loại quà</h3>${rankList(toRank(d.giftTypes, 'diamonds'), '💎')}</div>
      <div><h3>🌍 Ngôn ngữ</h3>${rankList(toRank(d.languages, 'count'), '', true)}</div>
    </div>`;
}

$('#session-detail').addEventListener('click', async (ev) => {
  const id = ev.target.dataset?.delete;
  if (!id || !confirm('Xóa buổi live này khỏi lịch sử?')) return;
  try {
    await api(`/api/sessions/${id}`, { method: 'DELETE' });
    $('#session-detail').innerHTML = '<p class="muted pad">Đã xóa.</p>';
    loadSessions();
  } catch (err) {
    toast(err.message, true);
  }
});

// ---------- Cài đặt ----------
const settingsForm = $('#settings-form');

function applySettings(settings) {
  state.settings = settings;
  if (settingsForm.contains(document.activeElement)) return;
  for (const [key, value] of Object.entries(settings)) {
    const input = settingsForm.elements.namedItem(key);
    if (!input) continue;
    if (input.type === 'checkbox') input.checked = Boolean(value);
    else input.value = value;
  }
}

settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const patch = {};
  for (const key of Object.keys(state.settings)) {
    const input = settingsForm.elements.namedItem(key);
    if (!input) continue;
    patch[key] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
  }
  try {
    await api('/api/settings', { method: 'PUT', body: patch });
    document.activeElement?.blur();
    $('#settings-saved').textContent = '✓ Đã lưu';
    setTimeout(() => ($('#settings-saved').textContent = ''), 2000);
  } catch (err) {
    toast(err.message, true);
  }
});

$('#volume').value = tts.volume;
$('#volume').addEventListener('input', (e) => {
  tts.volume = Number(e.target.value);
  audio.volume = tts.volume;
  localStorage.setItem('tts-volume', String(tts.volume));
});

$('#btn-test-voice').addEventListener('click', () => {
  const tpl = settingsForm.elements.namedItem('giftTemplate').value || 'Cảm ơn {name} đã tặng {count} {gift}!';
  const text = tpl.replace('{name}', 'Minh Anh').replace('{count}', '5').replace('{gift}', 'bông hồng');
  playNow(text, 'vi');
});

// ---------- Tabs ----------
$('#tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b === btn));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${btn.dataset.tab}`));
  if (btn.dataset.tab === 'stats') renderStats();
  if (btn.dataset.tab === 'history') loadSessions();
  if (btn.dataset.tab === 'live') scrollFeed(true);
});

// ---------- Khởi động ----------
updateSoundButton();
renderReply();
connectWs();
