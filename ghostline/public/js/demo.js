// Demo mode: you vs. bots on a simulated server. Bots get exactly the same view of the game the
// real rules give a player (hunter bots only learn runner positions from pings and reveals), and
// they move like people on foot: walking, jogging when chased, hiding, and wandering.
import { DemoServer, DemoClient, DemoClock, uuid } from './backend-demo.js';
import * as L from './logic.js';
import { localNotify } from './push.js';

const BOT_NAMES = ['Juno Vale', 'Pip', 'Rook', 'Nova Quinn', 'Moth', 'Ziggy', 'Echo', 'Sprout', 'Taco Tuesday', 'Wisp', 'Kit Marlow', 'Bean'];
const RADIO = {
  runner: ['Found a killer spot behind the big tree.', 'Anyone else hear footsteps?', 'Moving after this ping. Too crowded here.',
    'I am one with the bushes now.', 'Zone’s getting tight, heads up.', 'Hunter in a red hoodie heading north. Avoid.',
    'Low battery, low brightness, high hopes.', 'If I get tagged, avenge me.'],
  hunter: ['Last ping put two of them near the north edge.', 'I’ll sweep east, you take the playground.', 'Pretty sure I just heard giggling.',
    'Fan out. Nobody hides forever.', 'Got eyes on a jacket. Checking.', 'Next ping soon, hold position.', 'They always hide by the bins. Always.'],
};

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function randomInZone(z, minK = 0.15, maxK = 0.85) {
  const ang = Math.random() * Math.PI * 2, r = z.radius * Math.sqrt(rnd(minK * minK, maxK * maxK));
  return L.offsetPoint(z.lat, z.lng, Math.cos(ang) * r, Math.sin(ang) * r);
}
function stepToward(pos, target, meters) {
  const d = L.distance(pos.lat, pos.lng, target.lat, target.lng);
  if (d <= meters || d === 0) return { lat: target.lat, lng: target.lng, arrived: true };
  const k = meters / d;
  return { lat: pos.lat + (target.lat - pos.lat) * k, lng: pos.lng + (target.lng - pos.lng) * k, arrived: false };
}
function clampInto(z, p, k = 0.92) {
  const d = L.distance(z.lat, z.lng, p.lat, p.lng);
  if (d <= z.radius * k) return p;
  const f = (z.radius * k) / d;
  return { lat: z.lat + (p.lat - z.lat) * f, lng: z.lng + (p.lng - z.lng) * f };
}
const dist = (a, b) => L.distance(a.lat, a.lng, b.lat, b.lng);

export class DemoSession {
  constructor({ speed = 5, bots = 6, profile } = {}) {
    this.clock = new DemoClock(speed);
    this.server = new DemoServer(this.clock);
    const me = { id: 'me-' + uuid(), name: profile?.name || 'You', username: profile?.username || 'you' };
    this.me = new DemoClient(this.server, me);
    this.me.mode = 'demo';
    this.me.session = this;
    this.botCount = bots;
    this.bots = [];
    this.code = null;
    this.pickMode = 'mix';
    this.myPos = null;
    this.myTarget = null;
    this.posListeners = new Set();
    this.lastReal = performance.now();
    this.nextChatter = performance.now() + rnd(8000, 14000);
    this.loop = setInterval(() => this.step(), 200);
    // Alerts: show a system notification if the app is in the background, like a real push.
    this.server.pushListeners.add((p) => {
      const mine = this.server.me(p.code, this.me.uid);
      if (!mine || mine.status === 'left') return;
      if (p.target && p.target !== this.me.uid) return;
      if (p.audience !== 'all' && p.audience !== mine.team) return;
      if (p.activeOnly && mine.status !== 'active') return;
      if (document.visibilityState === 'hidden') localNotify(p.title, p.body, p.kind);
    });
  }
  get api() { return this.me; }
  get speed() { return this.clock.speed; }
  setSpeed(s) { this.clock.setSpeed(s); }

  destroy() {
    clearInterval(this.loop);
    for (const b of this.bots) b.unwatch?.();
    this.server.destroy();
    this.posListeners.clear();
  }

  makeBot(i) {
    const name = BOT_NAMES[i % BOT_NAMES.length];
    const bot = new Bot(this, new DemoClient(this.server, { id: 'bot-' + uuid(), name, username: name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14) + '_bot' }), i);
    this.bots.push(bot);
    return bot;
  }

  desiredPick(i) {
    if (this.pickMode !== 'mix') return this.pickMode;
    return ['hunter', 'random', 'runner', 'random', 'runner', 'hunter', 'random', 'runner', 'random', 'runner', 'random'][i % 11];
  }
  setPickMode(mode) {
    this.pickMode = mode;
    for (const b of this.bots) b.lobbyDirty = true;
  }

  // You host: bots trickle in using your code, like friends would.
  hostFlow(code) {
    this.code = code;
    const g = this.server.games.get(code);
    this.center = { lat: g.zone_lat, lng: g.zone_lng };
    this.placeMe();
    for (let i = 0; i < this.botCount; i++) {
      setTimeout(async () => {
        const b = this.makeBot(i);
        b.pos = randomInZone({ ...this.center, radius: g.zone_radius }, 0, 0.3);
        try { await b.client.joinGame(code); b.watch(code); } catch { /* kicked/blocked etc. */ }
      }, 700 + i * rnd(450, 900));
    }
  }

  // A bot hosts; you get its code to type in.
  async joinFlow(center) {
    this.center = center;
    const host = this.makeBot(0);
    host.isHost = true;
    host.pos = { ...center };
    const code = await host.client.createGame({ lat: center.lat, lng: center.lng, radius: 450, roundMin: 20, pingMin: 2, headMin: 1, shrink: true });
    this.code = code;
    host.watch(code);
    this.placeMe();
    for (let i = 1; i < this.botCount; i++) {
      setTimeout(async () => {
        const b = this.makeBot(i);
        b.pos = randomInZone({ ...center, radius: 450 }, 0, 0.3);
        await b.client.joinGame(code).catch(() => {});
        b.watch(code);
      }, 400 + i * rnd(300, 700));
    }
    return code;
  }

  placeMe() {
    if (!this.myPos) this.myPos = L.offsetPoint(this.center.lat, this.center.lng, rnd(-60, 60), rnd(-60, 60));
    this.emitMe();
  }
  setMyTarget(lat, lng) { this.myTarget = { lat, lng }; }
  watchMe(cb) {
    this.posListeners.add(cb);
    if (this.myPos) cb({ ...this.myPos, acc: 5, t: Date.now() });
    return () => this.posListeners.delete(cb);
  }
  emitMe() { for (const cb of this.posListeners) cb({ ...this.myPos, acc: 5, t: Date.now() }); }

  // Who's physically where (bots "see" people nearby in real life — that's not app data).
  actors() {
    const out = this.bots.map((b) => ({ uid: b.client.uid, pos: b.pos, bot: b }));
    if (this.myPos) out.push({ uid: this.me.uid, pos: this.myPos, human: true });
    return out;
  }

  step() {
    const nowReal = performance.now();
    const dt = Math.min(2, (nowReal - this.lastReal) / 1000) * this.clock.speed; // simulated seconds
    this.lastReal = nowReal;
    if (this.myPos && this.myTarget) {
      const n = stepToward(this.myPos, this.myTarget, 3.2 * dt);
      this.myPos = { lat: n.lat, lng: n.lng };
      if (n.arrived) this.myTarget = null;
      this.emitMe();
    }
    for (const b of this.bots) b.update(dt, nowReal);
    if (nowReal > this.nextChatter) {
      this.nextChatter = nowReal + rnd(18000, 35000);
      const g = this.code && this.server.games.get(this.code);
      if (g && ['headstart', 'hunt'].includes(g.status)) {
        const talkers = this.bots.filter((b) => b.player()?.status === 'active');
        const b = talkers.length && pick(talkers);
        if (b) b.client.sendRadio(this.code, pick(RADIO[b.player().team])).catch(() => {});
      }
    }
  }
}

class Bot {
  constructor(session, client, idx) {
    this.s = session;
    this.client = client;
    this.idx = idx;
    this.pos = null;
    this.target = null;
    this.view = null;
    this.code = null;
    this.lobbyDirty = true;
    this.busy = false;
    this.lastSend = 0;
    this.lastSendReal = 0;
    this.seenEvents = new Set();
    this.walk = rnd(1.4, 2.2);
    this.risky = idx % 4 === 1; // this one will wander out of bounds once
    this.riskyAt = null;
    this.riskyDone = false;
    this.tagCooldown = new Map();
    this.fleeUntil = 0;
    this.restUntil = 0;
    this.lastPingSeen = 0;
  }
  player() { return this.code ? this.s.server.me(this.code, this.client.uid) : null; }
  watch(code) {
    this.code = code;
    this.unwatch = this.client.watch(code, (st) => this.onState(st));
  }
  async act(fn) {
    if (this.busy) return;
    this.busy = true;
    try { await fn(); } catch { /* the server said no; fine */ } finally { this.busy = false; }
  }
  onState(st) {
    this.view = st;
    const g = st.game;
    if (!g) return;
    const me = st.players.find((p) => p.user_id === this.client.uid);
    if (!me) return; // kicked
    if (g.status === 'lobby') return this.lobby(st, me);
    for (const e of st.events) {
      if (this.seenEvents.has(e.id)) continue;
      this.seenEvents.add(e.id);
      if (e.kind === 'tag_request' && e.target === this.client.uid) this.answerTag(e.data.hunter_id);
      if (e.kind === 'shrink_warn' && me.team === 'runner') this.hideSpot = null; // re-think hiding spot
      if (e.kind === 'ping' && me.team === 'runner' && Math.random() < 0.5) this.hideSpot = null; // shake off the hunters
    }
  }
  lobby(st, me) {
    const want = this.isHost && this.s.pickMode === 'mix' ? 'hunter' : this.s.desiredPick(this.idx);
    if (me.pick !== want && this.lobbyDirty) {
      this.lobbyDirty = false;
      return this.act(() => this.client.setPick(this.code, want)).then(() => setTimeout(() => this.act(() => this.client.setReady(this.code, true)), rnd(600, 1600) / Math.max(1, this.s.speed / 4)));
    }
    this.lobbyDirty = false;
    if (!me.ready && !this.readyTimer) {
      this.readyTimer = setTimeout(() => { this.readyTimer = null; this.act(() => this.client.setReady(this.code, true)); }, rnd(800, 2200));
    }
    if (this.isHost) {
      const chk = L.teamCheck(st.players);
      if (chk.ok && !this.startTimer && st.players.length >= this.s.botCount + 1) {
        this.startTimer = setTimeout(() => { this.startTimer = null; this.act(() => this.client.startGame(this.code)); }, 1800);
      }
      if (!chk.ok && this.startTimer) { clearTimeout(this.startTimer); this.startTimer = null; }
    }
  }
  answerTag(hunterId) {
    const hunter = this.s.actors().find((a) => a.uid === hunterId);
    const close = hunter && this.pos && dist(hunter.pos, this.pos) <= (hunter.human ? 25 : 15);
    setTimeout(() => this.act(() => close ? this.client.confirmTag(this.code, hunterId) : this.client.denyTag(this.code, hunterId)), rnd(700, 1600));
  }
  update(dt, nowReal) {
    const g = this.code && this.s.server.games.get(this.code);
    const me = this.player();
    if (!g || !me || !this.pos || !['headstart', 'hunt'].includes(g.status) || me.status !== 'active') return;
    const zone = L.currentZone(g);
    const simNow = this.s.clock.now();
    if (me.team === 'runner') this.runner(g, zone, dt, simNow); else this.hunter(g, zone, dt, simNow);
    // share location like a phone would: every ~5 simulated seconds (not more than ~3×/sec real)
    if (simNow - this.lastSend > 5000 && nowReal - this.lastSendReal > 350) {
      this.lastSend = simNow; this.lastSendReal = nowReal;
      const j = L.offsetPoint(this.pos.lat, this.pos.lng, rnd(-3, 3), rnd(-3, 3));
      this.client.sendLocation(this.code, j.lat, j.lng, 6).catch(() => {});
    }
  }
  move(target, speed, dt) {
    const n = stepToward(this.pos, target, speed * dt);
    this.pos = { lat: n.lat, lng: n.lng };
    return n.arrived;
  }
  runner(g, zone, dt, now) {
    const next = L.upcomingShrink(g);
    const safe = next && g.shrink_warned > g.shrink_done ? { lat: next.lat, lng: next.lng, radius: next.radius } : zone;
    // someone hunting me in person?
    const threat = this.s.actors().filter((a) => a.uid !== this.client.uid && this.s.server.teamOf(this.code, a.uid) === 'hunter'
      && this.s.server.statusOf(this.code, a.uid) === 'active').map((a) => ({ a, d: dist(a.pos, this.pos) })).sort((x, y) => x.d - y.d)[0];
    if (g.status === 'hunt' && threat && threat.d < 55 && now > this.restUntil) {
      if (!this.fleeUntil) this.fleeUntil = now + rnd(15000, 30000);
      if (now < this.fleeUntil) {
        const away = { lat: this.pos.lat + (this.pos.lat - threat.a.pos.lat) * 4, lng: this.pos.lng + (this.pos.lng - threat.a.pos.lng) * 4 };
        this.move(clampInto(safe, away), 3.4, dt);
        return;
      }
      this.fleeUntil = 0; this.restUntil = now + 40000; // out of breath
    }
    // the risky one pops out of bounds for a bit
    if (this.risky && g.status === 'hunt' && !this.riskyDone) {
      if (!this.riskyAt) this.riskyAt = g.hunt_at + (g.ends_at - g.hunt_at) * rnd(0.12, 0.3);
      if (now > this.riskyAt) {
        if (!this.outside) {
          const ang = Math.random() * Math.PI * 2;
          this.outside = L.offsetPoint(zone.lat, zone.lng, Math.cos(ang) * (zone.radius + 60), Math.sin(ang) * (zone.radius + 60));
        }
        if (this.move(this.outside, 2.4, dt)) {
          this.outsideSince ??= now;
          if (now - this.outsideSince > 55000) { this.riskyDone = true; this.hideSpot = null; }
        }
        return;
      }
    }
    if (!this.hideSpot || dist(this.hideSpot, safe) > safe.radius * 0.9) this.hideSpot = randomInZone(safe, 0.25, 0.85);
    this.move(this.hideSpot, this.walk, dt);
  }
  hunter(g, zone, dt, now) {
    if (g.status === 'headstart') {
      if (!this.target || dist(this.pos, this.target) < 2) this.target = randomInZone({ ...zone, radius: 30 }, 0, 1);
      this.move(this.target, 0.6, dt);
      return;
    }
    // runner in sight? chase + tag
    const prey = this.s.actors().filter((a) => this.s.server.teamOf(this.code, a.uid) === 'runner' && this.s.server.statusOf(this.code, a.uid) === 'active')
      .map((a) => ({ a, d: dist(a.pos, this.pos) })).sort((x, y) => x.d - y.d)[0];
    if (prey && prey.d < 45) {
      this.move(prey.a.pos, 3.6, dt);
      if (prey.d < 8 && (this.tagCooldown.get(prey.a.uid) || 0) < now) {
        this.tagCooldown.set(prey.a.uid, now + 12000);
        this.act(() => this.client.requestTag(this.code, prey.a.uid));
      }
      return;
    }
    // otherwise follow the intel the app gives hunters: live reveals, then the latest ping
    const v = this.view;
    const active = new Set((v?.players || []).filter((p) => p.team === 'runner' && p.status === 'active').map((p) => p.user_id));
    const reveal = (v?.reveals || []).filter((r) => active.has(r.user_id)).sort((a, b) => dist(a, this.pos) - dist(b, this.pos))[0];
    const latest = v?.pings?.[v.pings.length - 1];
    if (latest && latest.n !== this.lastPingSeen) { this.lastPingSeen = latest.n; this.chasing = null; }
    if (reveal) this.target = reveal;
    else if (!this.chasing && latest && this.pingDone !== latest.n) {
      const cands = latest.positions.filter((p) => active.has(p.user_id)).sort((a, b) => dist(a, this.pos) - dist(b, this.pos));
      const mine = cands[this.idx % Math.max(1, cands.length)] || cands[0];
      if (mine) this.chasing = this.target = { lat: mine.lat, lng: mine.lng };
    }
    if (!this.target || dist(this.pos, this.target) < 6) {
      if (this.chasing) this.pingDone = this.lastPingSeen;
      this.chasing = null;
      this.target = randomInZone(zone, 0.1, 0.9);
    }
    this.move(clampInto({ ...zone, radius: zone.radius + 80 }, this.target, 1), 2.6, dt);
  }
}
