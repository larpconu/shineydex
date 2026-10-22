/// <reference lib="webworker" />
// GHOSTLINE service worker: caches the app shell so it opens instantly (even offline),
// caches map tiles you've already seen, and shows push alerts.
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL, matchPrecache } from 'workbox-precaching';
import { registerRoute, NavigationRoute, setCatchHandler } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Every page (including deep links like /j/K7Q2FX) is served the cached app shell.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/__\//, /^\/api\//] }));

// Map tiles you've seen stay available with a weak signal.
registerRoute(
  ({ url }) => url.hostname.endsWith('basemaps.cartocdn.com') || url.hostname.endsWith('arcgisonline.com'),
  new CacheFirst({ cacheName: 'gl-tiles', plugins: [new ExpirationPlugin({ maxEntries: 600, maxAgeSeconds: 30 * 86400 })] }),
);

// If something isn't cached and the network is gone, show the friendly offline page.
setCatchHandler(async ({ request }) => {
  if (request.destination === 'document') return (await matchPrecache('/offline.html')) ?? Response.error();
  return Response.error();
});

// New versions take over right away (the app reloads itself when this happens).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Push alerts. iOS requires every push to show a notification, so we always do.
self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; tag?: string; url?: string; notification?: { title?: string; body?: string } } = {};
  try { data = event.data?.json() ?? {}; } catch { data = { body: event.data?.text() }; }
  const title = data.title ?? data.notification?.title ?? 'GHOSTLINE';
  const body = data.body ?? data.notification?.body ?? '';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag: data.tag ?? 'ghostline',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url ?? '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins[0] as WindowClient | undefined;
    if (win) { await win.focus(); return; }
    await self.clients.openWindow(url);
  })());
});
