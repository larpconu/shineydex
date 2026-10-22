// Install state + service worker registration.

export const isIOS = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isAndroid = (): boolean => /Android/i.test(navigator.userAgent);

/** True when running as an installed home-screen app. */
export const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iOS version as "major.minor" (e.g. "18.5"), or null if not iOS. */
export function iosVersion(): string | null {
  const m = navigator.userAgent.match(/OS (\d+)_(\d+)/);
  return isIOS() && m ? `${m[1]}.${m[2]}` : null;
}

/** Compare "major.minor" versions: true if v >= min. */
export function versionAtLeast(v: string, min: string): boolean {
  const [a, b] = v.split('.').map(Number), [c, d] = min.split('.').map(Number);
  return a > c || (a === c && b >= d);
}

/** Register the service worker (production builds only). Reloads once when a new version takes over. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  let reloaded = false;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; window.location.reload(); }
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Check for updates whenever the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch((e) => console.warn('Service worker failed', e));
  });
}
