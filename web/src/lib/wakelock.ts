// Giữ màn hình máy hỗ trợ luôn sáng trong lúc live
let wakeLock: WakeLockSentinel | null = null;

async function keepScreenOn() {
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
