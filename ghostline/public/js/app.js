// GHOSTLINE app shell: boot, routing, and shared state.
import { el, setRole, sheet, icon, esc } from './ui.js';
import { getLive } from './backend-supabase.js';
import { refreshPush } from './push.js';
import * as basic from './screens-basic.js';
import * as lobby from './screens-lobby.js';
import * as game from './screens-game.js';

const SCREENS = {
  onboarding: basic.onboarding, home: basic.home, signin: basic.signin, profile: basic.profileSetup, settings: basic.settings,
  privacy: basic.privacyScreen, howto: basic.howtoScreen, help: basic.helpScreen, blocked: basic.blockedScreen,
  demo: lobby.demoSetup, host: lobby.hostSetup, join: lobby.join, lobby: lobby.lobby,
  game: game.gameScreen, results: game.results,
};

const store = {
  get(k, d = null) { try { const v = localStorage.getItem('gl.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { if (v == null) localStorage.removeItem('gl.' + k); else localStorage.setItem('gl.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

export const app = {
  store,
  live: null,
  profile: null,
  demo: null,
  stack: [],
  cleanup: null,
  root: null,
  backGuard: null,

  // The API for whatever game you're in: the demo server or Supabase.
  api() { return this.demo ? this.demo.api : this.live; },
  get isDemo() { return !!this.demo; },

  render(name, params, dir) {
    const fn = SCREENS[name];
    if (!fn) throw new Error('No screen ' + name);
    const prev = this.root.querySelector('.screen:not(.leaving)');
    try { this.cleanup?.(); } catch (e) { console.error(e); }
    this.cleanup = null;
    this.backGuard = null;
    if (prev) { prev.classList.add('leaving'); setTimeout(() => prev.remove(), 220); }
    const scr = el(`<section class="screen${dir === 'back' ? ' back' : ''}" data-screen="${name}"></section>`);
    this.root.appendChild(scr);
    if (!['game', 'lobby', 'results'].includes(name)) setRole(null); // in-game screens colour themselves by team
    try {
      const c = fn(scr, this, params || {});
      if (typeof c === 'function') this.cleanup = c;
    } catch (e) {
      console.error(e);
      scr.innerHTML = `<div class="grow stack-16" style="justify-content:center"><div class="card err-card">${icon('circle-alert')}<div><b>Well, that broke.</b><p class="dim">${esc(e.message)}</p></div></div><button class="btn btn-secondary" data-home>Back home</button></div>`;
      scr.querySelector('[data-home]').onclick = () => this.go('home', {}, { reset: true });
    }
  },
  go(name, params = {}, { replace = false, reset = false } = {}) {
    if (reset) this.stack = [];
    else if (replace) this.stack.pop();
    this.stack.push({ name, params });
    try { history[replace || reset ? 'replaceState' : 'pushState']({ depth: this.stack.length }, '', location.pathname); } catch { /* ignore */ }
    this.render(name, params, 'fwd');
  },
  back() {
    if (this.backGuard && this.backGuard() === false) { try { history.pushState({ depth: this.stack.length }, '', location.pathname); } catch { /* ignore */ } return; }
    if (this.stack.length <= 1) { this.go('home', {}, { reset: true }); return; }
    this.stack.pop();
    const top = this.stack[this.stack.length - 1];
    this.render(top.name, top.params, 'back');
  },
  endDemo() {
    this.demo?.destroy();
    this.demo = null;
  },

  // Make sure we have Supabase + a signed-in user with a profile; route through sign-in if needed.
  async requireAccount(next) {
    this.live = this.live || await getLive();
    if (!this.live) {
      await sheet({
        title: 'Not hooked up yet',
        lead: 'This copy of GHOSTLINE isn’t connected to its database yet, so real games are off. The setup guide (DEPLOY.md) walks through it in about 20 minutes. Meanwhile, the demo works right now.',
        actions: [{ label: 'Try the demo', kind: 'btn-primary', value: 'demo' }, { label: 'OK', value: null }],
      }).then((v) => v === 'demo' && this.go('demo'));
      return false;
    }
    const user = await this.live.user();
    if (!user) { this.go('signin', { next }); return false; }
    if (!this.profile) this.profile = await this.live.profile().catch(() => null);
    if (!this.profile) { this.go('profile', { next }); return false; }
    return true;
  },
};

window.addEventListener('popstate', () => app.back());

async function boot() {
  app.root = document.getElementById('app');
  app.root.innerHTML = '';
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  // wait for Leaflet (deferred script)
  if (!window.L) await new Promise((r) => window.addEventListener('DOMContentLoaded', r, { once: true }));

  const qs = new URLSearchParams(location.search);
  const joinCode = qs.get('join');
  if (qs.has('join') || qs.has('game') || qs.has('source')) history.replaceState(null, '', '/');

  // Test hooks: ?demo=1&speed=60 jumps straight to the demo.
  if (qs.get('demo')) {
    store.set('onboarded', true);
    app.go('demo', { speed: Number(qs.get('speed')) || undefined, bots: Number(qs.get('bots')) || undefined }, { reset: true });
    return;
  }

  if (!store.get('onboarded')) app.go('onboarding', { joinCode }, { reset: true });
  else app.go('home', {}, { reset: true });
  if (joinCode) { store.set('pendingJoin', joinCode.toUpperCase()); }

  // Live backend in the background: restore session, profile, push, and any game in progress.
  app.live = await getLive();
  if (!app.live) return;
  const user = await app.live.user().catch(() => null);
  if (!user) return;
  app.profile = await app.live.profile().catch(() => null);
  refreshPush(app.live);
  const active = store.get('activeGame');
  if (active && store.get('onboarded') && !app.demo) {
    const top = app.stack[app.stack.length - 1]?.name;
    if (top === 'home') app.go('game', { code: active, resume: true });
  } else if (store.get('pendingJoin') && store.get('onboarded') && app.profile) {
    const code = store.get('pendingJoin'); store.set('pendingJoin', null);
    app.go('join', { code });
  }
}

boot();
