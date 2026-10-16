import { enqueueSpeech } from './audio';
import { useApp } from './store';
import type { ServerMessage } from './types';

let retry = 0;

function handle(msg: ServerMessage) {
  const app = useApp.getState();
  switch (msg.type) {
    case 'init':
      app.init(msg);
      break;
    case 'status':
      useApp.setState({ status: msg.status });
      break;
    case 'event':
      app.upsertEvent(msg.event);
      break;
    case 'stats':
      useApp.setState({ stats: msg.stats });
      break;
    case 'settings':
      useApp.setState({ settings: msg.settings });
      break;
    case 'speak':
      enqueueSpeech(msg.text, msg.lang);
      break;
    case 'clear':
      app.clear();
      break;
  }
}

export function connectSocket() {
  useApp.setState({ ws: 'connecting' });
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => {
    retry = 0;
    useApp.setState({ ws: 'open' });
  };
  ws.onmessage = (e) => handle(JSON.parse(e.data) as ServerMessage);
  ws.onclose = () => {
    useApp.setState({ ws: 'closed' });
    setTimeout(connectSocket, Math.min(1000 * 2 ** retry++, 10000));
  };
}

// Giữ màn hình máy hỗ trợ luôn sáng trong lúc live
let wakeLock: WakeLockSentinel | null = null;
export async function keepScreenOn() {
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
  if (document.visibilityState === 'visible') void keepScreenOn();
});
document.addEventListener('pointerdown', () => void keepScreenOn(), { once: true });
