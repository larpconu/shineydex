// End-to-end PWA test against the Firebase Hosting + Functions emulators (npm run test:e2e).
// Checks install metadata, the service worker, offline start, deep links, the health function,
// and screen layout on iPhone 15 and iPhone SE sizes. Screenshots go to docs/screens/.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5000';
const SHOTS = new URL('../../docs/screens/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const DEVICES = { 'iphone-15': { width: 393, height: 852 }, 'iphone-se': { width: 375, height: 667 } };

const results = [];
async function check(name, fn) {
  try { await fn(); results.push(['PASS', name]); console.log('PASS', name); }
  catch (e) { results.push(['FAIL', name, e.message]); console.log('FAIL', name, '\n   ', e.message); }
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function newPage(device) {
  const ctx = await browser.newContext({ viewport: DEVICES[device], deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IOS_UA, serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('   page error:', e.message));
  return { ctx, page };
}

// Layout sanity: no sideways scrolling, tap targets ≥ 44 px, nothing hidden under the edges.
async function layoutOk(page) {
  const r = await page.evaluate(() => {
    const sc = document.querySelector('.screen');
    const small = [...document.querySelectorAll('button, a')].filter((b) => {
      const s = b.getBoundingClientRect();
      return s.width > 0 && (s.height < 44 || s.width < 44) && getComputedStyle(b).visibility !== 'hidden';
    }).map((b) => b.textContent.trim().slice(0, 30) || b.getAttribute('aria-label'));
    const off = [...document.querySelectorAll('.screen *')].filter((n) => { const s = n.getBoundingClientRect(); return s.width && (s.right > innerWidth + 1 || s.left < -1); })
      .filter((n) => !n.closest('.radar-bg')).map((n) => n.className || n.tagName);
    return { overflowX: sc.scrollWidth - sc.clientWidth, small, off };
  });
  assert.equal(r.overflowX, 0, 'screen scrolls sideways');
  assert.deepEqual(r.small, [], `tap targets under 44px: ${r.small.join(', ')}`);
  assert.deepEqual(r.off, [], `elements off screen: ${r.off.join(', ')}`);
}

const { ctx, page } = await newPage('iphone-15');

await check('home screen renders (logo, tagline, Host/Join/Demo)', async () => {
  await page.goto(BASE + '/');
  await page.waitForSelector('[data-screen=home] .wordmark');
  for (const t of ['Host a game', 'Join a game', 'Try a demo round', 'How to play', 'History', 'Settings']) {
    assert.ok(await page.getByText(t, { exact: false }).first().isVisible(), `missing "${t}"`);
  }
  assert.ok(await page.locator('.radar-bg .sweep').count(), 'radar sweep');
});

await check('web app manifest is complete', async () => {
  const href = await page.getAttribute('link[rel=manifest]', 'href');
  assert.equal(href, '/manifest.json');
  const m = await (await page.request.get(BASE + href)).json();
  assert.equal(m.name, 'GHOSTLINE');
  assert.equal(m.short_name, 'GHOSTLINE');
  assert.equal(m.display, 'standalone');
  assert.equal(m.orientation, 'portrait');
  assert.equal(m.theme_color.toUpperCase(), '#0B1018');
  for (const size of ['180x180', '192x192', '512x512', '1024x1024']) assert.ok(m.icons.some((i) => i.sizes === size), `icon ${size}`);
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'), 'maskable icon');
  for (const i of m.icons) {
    const r = await page.request.get(BASE + i.src);
    assert.equal(r.status(), 200, i.src);
    assert.equal(r.headers()['content-type'], 'image/png', i.src);
  }
});

await check('iOS install tags: touch icon, status bar, theme colour, splash screens', async () => {
  assert.equal(await page.getAttribute('meta[name=theme-color]', 'content'), '#0B1018');
  assert.equal(await page.getAttribute('meta[name=apple-mobile-web-app-capable]', 'content'), 'yes');
  assert.equal(await page.getAttribute('meta[name=apple-mobile-web-app-status-bar-style]', 'content'), 'black-translucent');
  assert.match(await page.getAttribute('meta[name=viewport]', 'content'), /viewport-fit=cover/);
  const touch = await page.getAttribute('link[rel=apple-touch-icon]', 'href');
  assert.equal((await page.request.get(BASE + touch)).status(), 200);
  const splashes = await page.$$eval('link[rel=apple-touch-startup-image]', (ls) => ls.map((l) => [l.getAttribute('href'), l.getAttribute('media')]));
  assert.ok(splashes.length >= 10, 'splash screens');
  assert.ok(splashes.some(([, m]) => m.includes('393px') && m.includes('852px')), 'iPhone 15 splash');
  assert.ok(splashes.some(([, m]) => m.includes('375px') && m.includes('667px')), 'iPhone SE splash');
  for (const [h] of splashes) assert.equal((await page.request.get(BASE + h)).status(), 200, h);
});

await check('service worker installs and precaches the app shell', async () => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  const n = await page.evaluate(async () => {
    const keys = await caches.keys();
    const pre = keys.find((k) => k.includes('precache'));
    return pre ? (await (await caches.open(pre)).keys()).length : 0;
  });
  assert.ok(n >= 15, `precached ${n} files`);
});

await check('health function answers through Hosting (/api/health) with server time', async () => {
  const t0 = Date.now();
  const r = await page.request.get(BASE + '/api/health');
  assert.equal(r.status(), 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.ok(Math.abs(j.serverTime - t0) < 60_000, 'server time looks right');
});

await check('system check: offline cache, Firebase config and server clock all green', async () => {
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.getByText('System check').click();
  for (const id of ['offline', 'firebase', 'server']) {
    await page.waitForSelector(`[data-check=${id}][data-state=ok]`, { timeout: 15000 }).catch(async () => {
      const t = await page.textContent(`[data-check=${id}]`);
      throw new Error(`${id} not ok: ${t}`);
    });
  }
  await page.screenshot({ path: SHOTS + 'iphone-15-system-check.png' });
});

await check('app opens offline (cached shell + offline banner)', async () => {
  await ctx.setOffline(true);
  await page.goto(BASE + '/');
  await page.waitForSelector('[data-screen=home] .wordmark', { timeout: 10000 });
  assert.ok(await page.locator('.banner.offline').isVisible(), 'offline banner');
  await page.screenshot({ path: SHOTS + 'iphone-15-offline.png' });
  await ctx.setOffline(false);
});

await check('deep link /j/CODE opens Join with the code (also offline)', async () => {
  await page.goto(BASE + '/j/k7q2fx');
  await page.waitForSelector('[data-testid=deep-code]');
  assert.equal(await page.textContent('[data-testid=deep-code]'), 'K7Q2FX');
  await page.goBack().catch(() => {});
  await ctx.setOffline(true);
  await page.goto(BASE + '/j/ABC234');
  assert.equal(await page.textContent('[data-testid=deep-code]'), 'ABC234');
  await ctx.setOffline(false);
});

await check('back button returns home', async () => {
  await page.goto(BASE + '/');
  await page.waitForSelector('[data-screen=home]');
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.waitForSelector('[data-screen=settings]');
  await page.goBack();
  await page.waitForSelector('[data-screen=home]');
});
await ctx.close();

for (const device of Object.keys(DEVICES)) {
  const { ctx: c, page: p } = await newPage(device);
  for (const [name, open] of [
    ['home', async () => { await p.goto(BASE + '/'); await p.waitForSelector('[data-screen=home] .wordmark'); }],
    ['install-guide', async () => { await p.getByText('Install it for real.').click(); await p.waitForSelector('[data-screen=install]'); }],
    ['settings', async () => { await p.goto(BASE + '/'); await p.getByRole('button', { name: 'Settings' }).first().click(); await p.waitForSelector('[data-screen=settings]'); }],
    ['coming-soon', async () => { await p.goto(BASE + '/'); await p.getByText('Host a game').click(); await p.waitForSelector('[data-screen=soon]'); }],
  ]) {
    await check(`${device}: ${name} layout (no sideways scroll, 44px tap targets)`, async () => {
      await open();
      await p.waitForTimeout(450); // let entry animations settle
      await layoutOk(p);
      await p.screenshot({ path: `${SHOTS}${device}-${name}.png` });
    });
  }
  await c.close();
}

await browser.close();
const failed = results.filter((r) => r[0] === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
