// Web Push (iOS 16.4+ home-screen apps, Android, desktop).
import { isIOS, isStandalone } from './ui.js';

export function pushStatus() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  }
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

function b64urlToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// Must be called from a tap (iOS requires a user gesture).
export async function enablePush(live) {
  const st = pushStatus();
  if (st === 'needs-install') throw new Error('On iPhone, alerts only work from the home-screen app. Add GHOSTLINE to your Home Screen first.');
  if (st === 'unsupported') throw new Error('This browser can’t do push alerts.');
  if (!live?.cfg?.vapidPublicKey) throw new Error('Alerts aren’t set up on the server yet (missing VAPID key).');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Alerts are off. Turn them on in Settings → Notifications → GHOSTLINE.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const key = b64urlToBytes(live.cfg.vapidPublicKey);
  if (sub && sub.options?.applicationServerKey) {
    const old = new Uint8Array(sub.options.applicationServerKey);
    if (old.length !== key.length || old.some((b, i) => b !== key[i])) { await sub.unsubscribe(); sub = null; }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await live.savePushSubscription(sub);
  return true;
}

// Re-save the subscription quietly on launch (endpoints can rotate).
export async function refreshPush(live) {
  try {
    if (pushStatus() !== 'granted' || !live) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await live.savePushSubscription(sub);
    else await enablePush(live);
  } catch { /* best effort */ }
}

// Local notification (used by the demo so you can see what alerts look like).
export async function localNotify(title, body, tag) {
  try {
    if (pushStatus() !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', renotify: true });
  } catch { /* ignore */ }
}
