// Builds the GHOSTLINE logo, app icons, favicon and iOS splash screens.
// Run: npm run brand   (uses Playwright's Chromium to rasterize the SVGs)
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const opentype = require('opentype.js');

const out = (p) => new URL(`../${p}`, import.meta.url);
mkdirSync(out('brand'), { recursive: true });
mkdirSync(out('public/icons'), { recursive: true });

const C = { navy: '#0B1018', lime: '#C6FF3D', cyan: '#38E1FF' };

// ---- Symbol: one continuous ghost shape, three-wave hem, two hollow eyes (even-odd cutouts) ----
// Drawn on a 512 grid. Body 220 wide, dome radius 110 centred at (256, 236).
const W = 220, X0 = 256 - W / 2, X1 = 256 + W / 2, TOP_CY = 236, R = W / 2, HEM = 360, wave = W / 3, wr = wave / 2;
const ghostPath = [
  `M ${X0} ${TOP_CY}`,
  `A ${R} ${R} 0 0 1 ${X1} ${TOP_CY}`,
  `L ${X1} ${HEM}`,
  `A ${wr} ${wr} 0 0 1 ${X1 - wave} ${HEM}`,
  `A ${wr} ${wr} 0 0 1 ${X1 - 2 * wave} ${HEM}`,
  `A ${wr} ${wr} 0 0 1 ${X0} ${HEM}`,
  'Z',
  // eyes: rounded-rect "pills" cut out of the body
  ...[214, 298].map((cx) => `M ${cx - 17} 230 a 17 17 0 0 1 34 0 v 22 a 17 17 0 0 1 -34 0 Z`),
].join(' ');

// Radar arc behind the upper-right shoulder.
const arc = (r, a0, a1) => {
  const rad = (a) => (a * Math.PI) / 180;
  const p = (a) => [256 + r * Math.cos(rad(a)), TOP_CY + r * Math.sin(rad(a))].map((v) => v.toFixed(2)).join(' ');
  return `M ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)}`;
};
const radar = `<path d="${arc(158, -78, -8)}" fill="none" stroke="${C.cyan}" stroke-width="12" stroke-linecap="round"/>
  <path d="${arc(196, -64, -22)}" fill="none" stroke="${C.cyan}" stroke-width="8" stroke-linecap="round" opacity=".45"/>`;

const symbol = (ghost = C.lime, radarMarkup = radar) =>
  `${radarMarkup}\n  <path d="${ghostPath}" fill="${ghost}" fill-rule="evenodd"/>`;

const glow = `<defs><radialGradient id="g" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="${C.lime}" stop-opacity=".22"/>
    <stop offset=".55" stop-color="${C.lime}" stop-opacity=".06"/>
    <stop offset="1" stop-color="${C.lime}" stop-opacity="0"/></radialGradient></defs>`;

const svg = (vb, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">\n  ${body}\n</svg>\n`;

// Mark on transparent (for in-app use).
const markSvg = svg('0 0 512 512', symbol());
// App icon: rounded square (for display) and full-bleed square (for iOS/Android, which round corners themselves).
const iconBody = (rounded) => `${glow}
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="${C.navy}"/>
  <circle cx="256" cy="262" r="210" fill="url(#g)"/>
  ${symbol()}`;
const iconSvg = svg('0 0 512 512', iconBody(true));
const iconSquareSvg = svg('0 0 512 512', iconBody(false));
// Maskable: shrink the mark into the 80% safe zone.
const maskableSvg = svg('0 0 512 512', `${glow}
  <rect width="512" height="512" fill="${C.navy}"/>
  <circle cx="256" cy="262" r="200" fill="url(#g)"/>
  <g transform="translate(256 262) scale(.82) translate(-256 -262)">${symbol()}</g>`);
// One-colour: white on transparent.
const monoRadar = radar.replaceAll(C.cyan, '#FFFFFF');
const monoSvg = svg('0 0 512 512', symbol('#FFFFFF', monoRadar));
// Favicon: tighter crop, single bold arc so it survives 16px.
const favSvg = svg('0 0 512 512', `<rect width="512" height="512" rx="120" fill="${C.navy}"/>
  <g transform="translate(256 256) scale(1.18) translate(-256 -250)">
  <path d="${arc(158, -78, -8)}" fill="none" stroke="${C.cyan}" stroke-width="16" stroke-linecap="round"/>
  <path d="${ghostPath}" fill="${C.lime}" fill-rule="evenodd"/></g>`);

// ---- Wordmark: Space Grotesk 700, caps, -0.03em, lime dot in the G's counter. Outlined to paths. ----
const font = opentype.parse(readFileSync(new URL('../node_modules/@expo-google-fonts/space-grotesk/700Bold/SpaceGrotesk_700Bold.ttf', import.meta.url)).buffer);
const size = 100, track = -0.03 * size;
const f2 = (v) => (Math.round(v * 100) / 100).toString();
const pathData = (p) => p.commands.map((c) => c.type === 'Z' ? 'Z'
  : c.type === 'Q' ? `Q${f2(c.x1)} ${f2(c.y1)} ${f2(c.x)} ${f2(c.y)}`
  : c.type === 'C' ? `C${f2(c.x1)} ${f2(c.y1)} ${f2(c.x2)} ${f2(c.y2)} ${f2(c.x)} ${f2(c.y)}`
  : `${c.type}${f2(c.x)} ${f2(c.y)}`).join('');
let x = 0; const parts = []; let gBox;
for (const ch of 'GHOSTLINE') {
  const glyph = font.charToGlyph(ch);
  const p = glyph.getPath(x, 100, size);
  if (ch === 'G' && !gBox) gBox = p.getBoundingBox();
  parts.push(pathData(p));
  x += glyph.advanceWidth * (size / font.unitsPerEm) + track;
}
const wmWidth = x - track;
// The G's counter: the hollow between its bowl (inner edge ~13 units in from the outside at 100px).
// Space Grotesk's G has a crossbar reaching into that hollow; we mask the bar's inner half away and
// drop a lime "ping" dot in the middle of the counter instead.
const capTop = gBox.y1, base = gBox.y2, gw = gBox.x2 - gBox.x1, stroke = 0.236 * gw;
const counter = { x1: gBox.x1 + stroke, x2: gBox.x2 - stroke, y1: capTop + 0.16 * (base - capTop), y2: base - 0.16 * (base - capTop) };
const dot = { cx: (counter.x1 + counter.x2) / 2, cy: (counter.y1 + counter.y2) / 2, r: (counter.x2 - counter.x1) * 0.27 };
const barCut = { x: dot.cx - dot.r * 1.6, y: dot.cy - 2.5, w: counter.x2 - (dot.cx - dot.r * 1.6) + 0.3, h: 14.5 };
const wordmark = (fill, dotFill) => svg(`-6 ${Math.floor(capTop) - 6} ${Math.ceil(wmWidth) + 12} ${Math.ceil(base - capTop) + 12}`,
  `<defs><mask id="gcut" maskUnits="userSpaceOnUse" x="-10" y="0" width="${Math.ceil(wmWidth) + 20}" height="140">
    <rect x="-10" y="0" width="${Math.ceil(wmWidth) + 20}" height="140" fill="#fff"/>
    <rect x="${barCut.x.toFixed(2)}" y="${barCut.y.toFixed(2)}" width="${barCut.w.toFixed(2)}" height="${barCut.h}" fill="#000"/></mask></defs>
  <path d="${parts[0]}" fill="${fill}" mask="url(#gcut)"/>
  <path d="${parts.slice(1).join(' ')}" fill="${fill}"/>
  <circle cx="${dot.cx.toFixed(2)}" cy="${dot.cy.toFixed(2)}" r="${dot.r.toFixed(2)}" fill="${dotFill}"/>`);

const files = {
  'brand/ghostline-mark.svg': markSvg,
  'brand/ghostline-icon.svg': iconSvg,
  'brand/ghostline-icon-square.svg': iconSquareSvg,
  'brand/ghostline-mark-mono-white.svg': monoSvg,
  'brand/ghostline-wordmark.svg': wordmark('#F2F4F8', C.lime),
  'brand/ghostline-wordmark-mono-white.svg': wordmark('#FFFFFF', '#FFFFFF'),
  'public/icons/mark.svg': markSvg,
  'public/icons/wordmark.svg': wordmark('#F2F4F8', C.lime),
  'public/icons/favicon.svg': favSvg,
  'public/icons/icon.svg': iconSvg,
};
for (const [p, s] of Object.entries(files)) writeFileSync(out(p), s);

// ---- Rasterize ----
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
async function png(svgText, size, path, { w = size, h = size, bg = 'transparent', inner = null } = {}) {
  await page.setViewportSize({ width: w, height: h });
  const content = inner ?? `<img src="data:image/svg+xml;base64,${Buffer.from(svgText).toString('base64')}" style="width:${size}px;height:${size}px;display:block">`;
  await page.setContent(`<html><body style="margin:0;background:${bg};width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center">${content}</body></html>`);
  await page.waitForTimeout(50);
  const buf = await page.screenshot({ omitBackground: bg === 'transparent', type: 'png' });
  writeFileSync(out(path), buf);
  return buf;
}
for (const s of [180, 192, 512, 1024]) await png(iconSquareSvg, s, `public/icons/icon-${s}.png`);
for (const s of [180, 192, 512, 1024]) await png(iconSquareSvg, s, `brand/png/icon-${s}.png`).catch(async () => { mkdirSync(out('brand/png'), { recursive: true }); await png(iconSquareSvg, s, `brand/png/icon-${s}.png`); });
await png(maskableSvg, 512, 'public/icons/maskable-512.png');
await png(monoSvg, 512, 'brand/png/mark-mono-white-512.png');
await png(markSvg, 512, 'brand/png/mark-512.png');
const fav32 = await png(favSvg, 32, 'public/icons/favicon-32.png');
// favicon.ico with an embedded PNG (valid ICO, supported everywhere that matters)
const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico.writeUInt8(32, 6); ico.writeUInt8(32, 7); ico.writeUInt8(0, 8); ico.writeUInt8(0, 9);
ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(fav32.length, 14); ico.writeUInt32LE(22, 18);
writeFileSync(out('public/favicon.ico'), Buffer.concat([ico, fav32]));

// iOS launch screens (portrait). device px = css px * dpr
const splashes = [
  [375, 667, 2], [414, 896, 2], [375, 812, 3], [414, 896, 3], [390, 844, 3], [428, 926, 3],
  [393, 852, 3], [430, 932, 3], [402, 874, 3], [440, 956, 3], [360, 780, 3],
];
const wmSvg = files['public/icons/wordmark.svg'];
const splashList = [];
for (const [w, h, dpr] of splashes) {
  const W2 = w * dpr, H2 = h * dpr, name = `splash-${W2}x${H2}.png`;
  const mark = Math.round(W2 * 0.34);
  const inner = `<div style="display:flex;flex-direction:column;align-items:center;gap:${Math.round(W2 * 0.05)}px;position:relative">
    <div style="position:absolute;width:${mark * 2.2}px;height:${mark * 2.2}px;border-radius:50%;top:${-mark * 0.6}px;background:radial-gradient(circle,rgba(198,255,61,.12),rgba(198,255,61,0) 65%)"></div>
    <img src="data:image/svg+xml;base64,${Buffer.from(markSvg).toString('base64')}" style="width:${mark}px;height:${mark}px;position:relative">
    <img src="data:image/svg+xml;base64,${Buffer.from(wmSvg).toString('base64')}" style="width:${Math.round(W2 * 0.5)}px;position:relative"></div>`;
  await png(null, 0, `public/icons/${name}`, { w: W2, h: H2, bg: C.navy, inner });
  splashList.push({ w, h, dpr, name });
}
writeFileSync(out('public/icons/splash.json'), JSON.stringify(splashList));
await browser.close();
console.log('brand built:', Object.keys(files).length, 'svgs,', splashList.length, 'splashes');
