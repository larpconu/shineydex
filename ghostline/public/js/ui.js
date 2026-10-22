// Small UI toolkit: icons, escaping, haptics, sheets, banners, confetti, counters.
import ICONS from './icon-data.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function icon(name, cls = '') {
  return `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Haptics: Vibration API where it exists (Android). iOS Safari has no Vibration API, but since
// iOS 18 toggling a native <input switch> gives a light tap, which we borrow here.
let iosSwitch;
export function haptic(pattern = 12) {
  try {
    if (navigator.vibrate) { navigator.vibrate(pattern); return; }
    if (!iosSwitch) {
      iosSwitch = el('<label aria-hidden="true" style="position:fixed;left:-100px;top:-100px;opacity:0;pointer-events:none"><input type="checkbox" switch></label>');
      document.body.appendChild(iosSwitch);
    }
    const pulses = Array.isArray(pattern) ? Math.ceil(pattern.length / 2) : 1;
    for (let i = 0; i < Math.min(pulses, 3); i++) setTimeout(() => iosSwitch.click(), i * 140);
  } catch { /* no haptics, no problem */ }
}

// Press feedback for every button: short tap.
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.btn, .pick, .icon-btn, .tabbar button');
  if (b && !b.disabled) haptic(8);
}, { passive: true });

// ---------- Banners ----------
let bannerHost;
export function banner(text, { kind = 'info', icon: ic = 'bell', ms = 4200, vibrate = null } = {}) {
  if (!bannerHost) { bannerHost = el('<div class="banners" role="status" aria-live="polite"></div>'); document.body.appendChild(bannerHost); }
  const b = el(`<div class="banner ${kind}"><div class="ic">${icon(ic)}</div><div class="grow">${esc(text)}</div></div>`);
  bannerHost.prepend(b);
  while (bannerHost.children.length > 3) bannerHost.lastChild.remove();
  if (vibrate) haptic(vibrate);
  const close = () => { b.classList.add('out'); setTimeout(() => b.remove(), 260); };
  b.addEventListener('click', close);
  setTimeout(close, ms);
  return close;
}

export const toast = (text, kind = 'info') => banner(text, { kind, icon: kind === 'danger' ? 'circle-alert' : kind === 'good' ? 'circle-check' : 'info', ms: 3000 });

// ---------- Bottom sheets ----------
// sheet({ title, lead, body (html), actions: [{ label, icon, kind, value, danger }] }) → Promise<value|null>
export function sheet({ title = '', lead = '', body = '', actions = [], onMount, dismissable = true } = {}) {
  return new Promise((resolve) => {
    const bd = el('<div class="backdrop"></div>');
    const sh = el(`<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="grab"></div>
      ${title ? `<h3>${esc(title)}</h3>` : ''}
      ${lead ? `<p class="lead">${esc(lead)}</p>` : ''}
      <div class="sheet-body">${body}</div>
      <div class="stack" style="margin-top:${body || lead ? 16 : 4}px"></div>
    </div>`);
    const holder = sh.querySelector('.stack');
    let done = false;
    const close = (val) => {
      if (done) return; done = true;
      bd.classList.add('closing'); sh.classList.add('closing');
      setTimeout(() => { bd.remove(); sh.remove(); }, 230);
      resolve(val);
    };
    for (const a of actions) {
      const btn = el(`<button class="btn ${a.kind || 'btn-secondary'}">${a.icon ? icon(a.icon) : ''}<span>${esc(a.label)}</span></button>`);
      btn.addEventListener('click', async () => {
        if (a.handler) { const r = await a.handler(sh); if (r === false) return; }
        close(a.value ?? a.label);
      });
      holder.appendChild(btn);
    }
    if (dismissable) bd.addEventListener('click', () => close(null));
    // swipe down to dismiss
    let y0 = null;
    sh.addEventListener('touchstart', (e) => { if (sh.scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
    sh.addEventListener('touchmove', (e) => {
      if (y0 == null) return;
      const dy = e.touches[0].clientY - y0;
      if (dy > 0) sh.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    sh.addEventListener('touchend', (e) => {
      if (y0 == null) return;
      const dy = e.changedTouches[0].clientY - y0; y0 = null;
      sh.style.transform = '';
      if (dy > 90 && dismissable) close(null);
    });
    document.body.append(bd, sh);
    onMount?.(sh, close);
  });
}

export function confirmSheet(title, lead, okLabel = 'Do it', { danger = false, okKind } = {}) {
  return sheet({
    title, lead,
    actions: [
      { label: okLabel, kind: okKind || (danger ? 'btn-danger solid' : 'btn-primary'), value: true },
      { label: 'Never mind', kind: 'btn-secondary', value: false },
    ],
  }).then((v) => v === true);
}

// ---------- Confetti ----------
export function confetti(colors = ['#C6FF3D', '#38E1FF', '#F2F4F8']) {
  if (reducedMotion()) return;
  const c = el('<canvas class="confetti"></canvas>');
  document.body.appendChild(c);
  const dpr = devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
  const parts = Array.from({ length: 160 }, () => ({
    x: innerWidth / 2 + (Math.random() - .5) * 80, y: innerHeight * .32,
    vx: (Math.random() - .5) * 14, vy: -Math.random() * 15 - 5,
    r: Math.random() * Math.PI, vr: (Math.random() - .5) * .4,
    w: 6 + Math.random() * 6, h: 8 + Math.random() * 10,
    color: colors[Math.floor(Math.random() * colors.length)], shape: Math.random() < .3 ? 'c' : 'r',
  }));
  const t0 = performance.now();
  (function frame(t) {
    const dt = 1;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += .38 * dt; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - (t - t0) / 3200);
      if (p.shape === 'c') { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 2);
      ctx.restore();
    }
    if (t - t0 < 3300) requestAnimationFrame(frame); else c.remove();
  })(t0);
}

// Number counter that ticks instead of jumping.
export function countTo(node, to, ms = 700) {
  const from = Number(node.dataset.v || 0);
  node.dataset.v = to;
  if (reducedMotion() || from === to) { node.textContent = to; return; }
  const t0 = performance.now();
  (function step(t) {
    const k = Math.min(1, (t - t0) / ms);
    node.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}

export function rangeFill(input) {
  const p = ((input.value - input.min) / (input.max - input.min)) * 100;
  input.style.setProperty('--p', `${p}%`);
}

export function setRole(role) {
  if (role) document.body.dataset.role = role; else delete document.body.dataset.role;
}

export function errText(e) {
  const m = e?.message || String(e);
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'No signal. Check your connection and try again.';
  return m.replace(/^.*?:\s(?=[A-Z])/, '');
}

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
