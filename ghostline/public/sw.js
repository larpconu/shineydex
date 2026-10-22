// GHOSTLINE service worker: offline app shell + Web Push.
const VERSION = 'gl-v1';
const SHELL = [
  '/', '/index.html', '/manifest.webmanifest', '/config.js', '/favicon.ico',
  '/css/app.css',
  '/js/app.js', '/js/ui.js', '/js/icon-data.js', '/js/logic.js', '/js/content.js', '/js/map.js', '/js/geo.js', '/js/push.js',
  '/js/backend-supabase.js', '/js/backend-demo.js', '/js/demo.js',
  '/js/screens-basic.js', '/js/screens-lobby.js', '/js/screens-game.js',
  '/vendor/leaflet/leaflet.js', '/vendor/leaflet/leaflet.css', '/vendor/supabase.js',
  '/fonts/space-grotesk-latin-700-normal.woff2', '/fonts/space-grotesk-latin-500-normal.woff2',
  '/fonts/inter-latin-400-normal.woff2', '/fonts/inter-latin-500-normal.woff2', '/fonts/inter-latin-600-normal.woff2',
  '/fonts/jetbrains-mono-latin-700-normal.woff2',
  '/icons/mark.svg', '/icons/wordmark.svg', '/icons/favicon.svg', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-180.png',
];
const TILE_CACHE = 'gl-tiles';
const TILE_LIMIT = 400;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k !== TILE_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trimTiles() {
  const c = await caches.open(TILE_CACHE);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - TILE_LIMIT; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Map tiles: cache as you go so recently seen areas work with a flaky signal.
  if (url.hostname.endsWith('basemaps.cartocdn.com')) {
    e.respondWith((async () => {
      const c = await caches.open(TILE_CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trimTiles(); }
        return res;
      } catch { return hit || Response.error(); }
    })());
    return;
  }
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // always live

  // Pages: network first, fall back to the cached shell.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put('/index.html', copy));
      return res;
    }).catch(() => caches.match('/index.html')));
    return;
  }

  // Everything else: cached copy right away, refreshed in the background.
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});

// ---- Web Push ----
self.addEventListener('push', (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch { p = { body: e.data?.text() }; }
  const title = p.title || 'GHOSTLINE';
  const opts = {
    body: p.body || '',
    tag: p.tag || 'ghostline',
    renotify: true,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: p.code ? `/?game=${p.code}` : '/' },
    vibrate: [80, 40, 80],
  };
  // iOS requires every push to show a notification, so we always do.
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = e.notification.data?.url || '/';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) { await c.focus(); return; } }
    await self.clients.openWindow(target);
  })());
});
