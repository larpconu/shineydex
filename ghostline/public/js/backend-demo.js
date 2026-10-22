// Demo backend: an in-memory copy of the Supabase server (supabase/schema.sql) so you can play
// solo against bots, offline, with no account. It mirrors the SQL functions *and* the row-level
// security policies, so bots and you only ever see what the real rules allow.
import * as L from './logic.js';

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'u' + Math.random().toString(36).slice(2) + Date.now().toString(36));
const fail = (msg) => { throw new Error(msg); };
const key = (code, uid) => `${code}|${uid}`;

export class DemoClock {
  constructor(speed = 1) { this.speed = speed; this.base = Date.now(); this.real0 = performance.now(); }
  now() { return this.base + (performance.now() - this.real0) * this.speed; }
  setSpeed(s) { this.base = this.now(); this.real0 = performance.now(); this.speed = s; }
  skip(ms) { this.base += ms; }
}

export class DemoServer {
  constructor(clock) {
    this.clock = clock;
    this.profiles = new Map();
    this.blocks = [];
    this.reports = [];
    this.games = new Map();
    this.players = [];
    this.locations = new Map();
    this.reveals = new Map();
    this.pings = [];
    this.radio = [];
    this.events = [];
    this.seq = 1;
    this.subs = new Set();
    this.pushListeners = new Set();
    this.dirty = new Set();
    this.timer = setInterval(() => this.tick(), 200);
  }
  now() { return this.clock.now(); }
  destroy() { clearInterval(this.timer); this.subs.clear(); }

  // ---------------- "row-level security" ----------------
  me(code, uid) { return this.players.find((p) => p.game_code === code && p.user_id === uid); }
  teamOf(code, uid) { return this.me(code, uid)?.team ?? null; }
  statusOf(code, uid) { return this.me(code, uid)?.status ?? null; }
  gameStatus(code) { return this.games.get(code)?.status ?? null; }

  policy = {
    games: (uid, r) => this.statusOf(r.code, uid) != null,
    game_players: (uid, r) => this.statusOf(r.game_code, uid) != null,
    locations: (uid, r) => ['active', 'tagged'].includes(this.statusOf(r.game_code, uid)) && r.team === this.teamOf(r.game_code, uid),
    reveals: (uid, r) => ['active', 'tagged'].includes(this.statusOf(r.game_code, uid)) && this.teamOf(r.game_code, uid) === 'hunter',
    pings: (uid, r) => this.statusOf(r.game_code, uid) != null && (this.teamOf(r.game_code, uid) === 'hunter' || this.gameStatus(r.game_code) === 'ended'),
    radio: (uid, r) => ['active', 'tagged'].includes(this.statusOf(r.game_code, uid)) && r.team === this.teamOf(r.game_code, uid),
    events: (uid, r) => this.statusOf(r.game_code, uid) != null
      && (r.audience === 'all' || r.audience === this.teamOf(r.game_code, uid)) && (r.target == null || r.target === uid),
    profiles: (uid, r) => r.id === uid,
  };

  table(name) {
    return {
      games: [...this.games.values()], game_players: this.players, locations: [...this.locations.values()],
      reveals: [...this.reveals.values()], pings: this.pings, radio: this.radio, events: this.events,
      profiles: [...this.profiles.values()],
    }[name] || [];
  }

  // SELECT … as a player: rows the policy allows, then the caller's filter.
  select(uid, name, where = () => true) {
    const pol = this.policy[name];
    if (!pol) fail('permission denied for table ' + name);
    return this.table(name).filter((r) => pol(uid, r) && where(r)).map((r) => structuredClone(r));
  }

  gameState(uid, code) {
    const byCode = (r) => (r.game_code ?? r.code) === code;
    const game = this.select(uid, 'games', byCode)[0] || null;
    if (game) delete game.kicked;
    return {
      server_now: this.now(),
      game,
      players: this.select(uid, 'game_players', byCode).sort((a, b) => a.joined_at - b.joined_at),
      locations: this.select(uid, 'locations', byCode),
      reveals: this.select(uid, 'reveals', byCode),
      pings: this.select(uid, 'pings', byCode).sort((a, b) => a.n - b.n),
      radio: this.select(uid, 'radio', byCode).slice(-150),
      events: this.select(uid, 'events', byCode).slice(-60),
    };
  }

  subscribe(uid, code, cb) {
    const s = { uid, code, cb };
    this.subs.add(s);
    queueMicrotask(() => this.subs.has(s) && cb(this.gameState(uid, code)));
    return () => this.subs.delete(s);
  }
  changed(code) {
    if (!this.dirty.size) queueMicrotask(() => this.flush());
    this.dirty.add(code);
  }
  flush() {
    const codes = [...this.dirty]; this.dirty.clear();
    for (const s of this.subs) if (codes.includes(s.code)) s.cb(this.gameState(s.uid, s.code));
  }

  // ---------------- accounts ----------------
  addProfile(id, name, username) {
    if ([...this.profiles.values()].some((p) => p.username === username && p.id !== id)) fail('That username is taken.');
    this.profiles.set(id, { id, name, username, created_at: this.now() });
  }

  // ---------------- push + banners ----------------
  announce(code, kind, audience, target, body, push = false, data = {}, activeOnly = false, title = 'GHOSTLINE') {
    this.events.push({ id: this.seq++, game_code: code, kind, audience, target, body, data, created_at: this.now() });
    if (push) {
      for (const fn of this.pushListeners) fn({ code, kind, audience, target, activeOnly, title, body });
    }
    this.changed(code);
  }

  // ---------------- game functions (mirror schema.sql) ----------------
  create_game(uid, { lat, lng, radius, roundMin, pingMin, headMin, shrink }) {
    const me = this.profiles.get(uid) || fail('Set up your profile first.');
    let code; do code = L.makeCode(); while (this.games.has(code));
    this.games.set(code, {
      code, host_id: uid, host_name: me.name, status: 'lobby', zone_lat: lat, zone_lng: lng, zone_radius: radius,
      round_min: roundMin, ping_min: pingMin, head_min: headMin, shrink, cur_lat: lat, cur_lng: lng, cur_radius: radius,
      shrinks: [], shrink_warned: 0, shrink_done: 0, kicked: [], created_at: this.now(), started_at: null, hunt_at: null,
      ends_at: null, next_ping_at: null, ping_count: 0, next_event_at: null, ended_at: null, end_reason: null, winner: null,
    });
    this.addPlayer(code, me);
    this.changed(code);
    return code;
  }
  addPlayer(code, me) {
    this.players.push({
      game_code: code, user_id: me.id, name: me.name, username: me.username, initials: L.initials(me.name), pick: 'random',
      team: null, ready: false, status: 'active', joined_at: this.now() + this.players.length * 1e-3, tagged_at: null,
      tagged_by: null, tagged_by_name: null, left_at: null,
    });
  }
  peek_game(uid, code) {
    const g = this.games.get(String(code).toUpperCase());
    if (!g) return null;
    return { code: g.code, host_name: g.host_name, status: g.status, players: this.players.filter((p) => p.game_code === g.code && p.status !== 'left').length };
  }
  join_game(uid, code) {
    const me = this.profiles.get(uid) || fail('Set up your profile first.');
    const g = this.games.get(String(code).toUpperCase()) || fail('No game with that code. Typo?');
    const ex = this.me(g.code, uid);
    if (ex) { if (ex.status === 'left') fail('You left this one. No take-backs.'); return g.code; }
    if (g.status !== 'lobby') fail('That game already started.');
    if (g.kicked.includes(uid)) fail('The host removed you from this game.');
    if (this.blocks.some((b) => b.blocker === g.host_id && b.blocked === uid)) fail('You can’t join this game.');
    if (this.players.filter((p) => p.game_code === g.code).length >= L.MAX_PLAYERS) fail('Lobby’s full (30 max).');
    this.addPlayer(g.code, me);
    this.changed(g.code);
    return g.code;
  }
  set_pick(uid, code, pick) {
    if (!['hunter', 'runner', 'random'].includes(pick)) fail('Bad pick.');
    if (this.gameStatus(code) !== 'lobby') fail('Too late to switch.');
    const p = this.me(code, uid); if (p) { p.pick = pick; p.ready = false; }
    this.changed(code);
  }
  set_ready(uid, code, ready) {
    if (this.gameStatus(code) !== 'lobby') fail('Game already started.');
    const p = this.me(code, uid); if (p) p.ready = !!ready;
    this.changed(code);
  }
  kick_player(uid, code, user) {
    const g = this.games.get(code);
    if (g?.host_id !== uid) fail('Only the host can do that.');
    if (g.status !== 'lobby') fail('You can only remove players in the lobby.');
    if (user === g.host_id) fail('You can’t kick yourself.');
    this.players = this.players.filter((p) => !(p.game_code === code && p.user_id === user));
    if (!g.kicked.includes(user)) g.kicked.push(user);
    this.changed(code);
  }
  start_game(uid, code) {
    const g = this.games.get(code);
    if (g?.host_id !== uid) fail('Only the host can start.');
    if (g.status !== 'lobby') fail('Already started.');
    const ps = this.players.filter((p) => p.game_code === code);
    if (ps.length < L.MIN_PLAYERS) fail('You need at least 3 players.');
    const chk = L.teamCheck(ps);
    if (!chk.teamsOk) fail(`Teams don’t work: ${chk.n} players need ${chk.min} to ${chk.max} hunters.`);
    if (chk.notReady.length) fail('Still waiting on: ' + chk.notReady.map((p) => p.name).join(', '));
    const teams = L.assignTeams(ps);
    for (const p of ps) p.team = teams.get(p.user_id);
    const now = this.now();
    g.started_at = now;
    g.hunt_at = now + g.head_min * 60_000;
    g.ends_at = g.hunt_at + g.round_min * 60_000;
    g.next_ping_at = g.hunt_at + (g.head_min === 0 ? g.ping_min * 60_000 : 0);
    g.shrinks = g.shrink ? L.buildShrinks({ lat: g.zone_lat, lng: g.zone_lng, radius: g.zone_radius }, g.hunt_at, g.round_min) : [];
    g.shrink_warned = 0; g.shrink_done = 0;
    g.status = g.head_min > 0 ? 'headstart' : 'hunt';
    g.next_event_at = L.nextEventAt(g);
    this.announce(code, 'start', 'runner', null, g.head_min > 0 ? 'Go go go! Hide inside the zone.' : 'No head start. Run!');
    this.announce(code, 'start', 'hunter', null, g.head_min > 0 ? 'Eyes shut. Runners are scattering.' : 'Hunt’s on. Go get ’em.');
  }
  eval_outside(code, user) {
    const g = this.games.get(code), p = this.me(code, user), l = this.locations.get(key(code, user));
    if (!l) return null;
    const k = key(code, user);
    if (g.status !== 'hunt' || p?.team !== 'runner' || p.status !== 'active') {
      this.reveals.delete(k); l.out_since = null; return null;
    }
    const now = this.now();
    if (L.distance(l.lat, l.lng, g.cur_lat, g.cur_lng) > g.cur_radius) {
      if (l.out_since == null) l.out_since = now;
      if (now - l.out_since >= L.OUT_REVEAL_MS) {
        const had = this.reveals.has(k);
        this.reveals.set(k, { game_code: code, user_id: user, initials: l.initials, lat: l.lat, lng: l.lng, since: l.out_since + L.OUT_REVEAL_MS, updated_at: l.updated_at });
        if (!had) {
          this.announce(code, 'reveal', 'hunter', null, `${p.name} is out of bounds. Live on your map!`);
          this.announce(code, 'revealed', 'runner', user, 'You’re out of bounds. Hunters can see you live!');
        }
        this.changed(code);
      }
      return l.out_since;
    }
    l.out_since = null;
    if (this.reveals.delete(k)) this.changed(code);
    return null;
  }
  finish(code, reason) {
    const g = this.games.get(code);
    if (!g || !['headstart', 'hunt'].includes(g.status)) return;
    g.winner = this.players.some((p) => p.game_code === code && p.team === 'runner' && p.status === 'active') ? 'runners' : 'hunters';
    g.status = 'ended'; g.ended_at = this.now(); g.end_reason = reason; g.next_event_at = null;
    for (const m of [this.locations, this.reveals]) for (const k of [...m.keys()]) if (k.startsWith(code + '|')) m.delete(k);
    const msg = { time: 'Time! Round over.', all_tagged: 'Time! Round over. Every runner got tagged.', host: 'Time! Round over. The host called it.', no_hunters: 'Time! Round over. The hunters all bailed.' }[reason] || 'Time! Round over.';
    this.announce(code, 'end', 'all', null, msg, true, { winner: g.winner, reason });
  }
  check_over(code) {
    if (!['headstart', 'hunt'].includes(this.gameStatus(code))) return;
    const ps = this.players.filter((p) => p.game_code === code && p.status === 'active');
    if (!ps.some((p) => p.team === 'runner')) this.finish(code, 'all_tagged');
    else if (!ps.some((p) => p.team === 'hunter')) this.finish(code, 'no_hunters');
  }
  do_ping(code) {
    const g = this.games.get(code);
    g.ping_count += 1;
    const positions = [...this.locations.values()].filter((l) => l.game_code === code && this.me(code, l.user_id)?.team === 'runner' && this.me(code, l.user_id)?.status === 'active')
      .map((l) => ({ user_id: l.user_id, initials: l.initials, lat: l.lat, lng: l.lng, fix_at: l.updated_at }));
    this.pings.push({ id: this.seq++, game_code: code, n: g.ping_count, taken_at: this.now(), positions });
    this.announce(code, 'ping', 'runner', null, 'Ping! Your location was just sent. Move!', true, {}, true);
    this.announce(code, 'ping', 'hunter', null, `Fresh ping: ${positions.length} runner${positions.length === 1 ? '' : 's'} spotted.`);
  }
  advance(code) {
    const g = this.games.get(code);
    if (!['headstart', 'hunt'].includes(g.status)) return;
    const now = this.now();
    if (g.status === 'headstart' && now >= g.hunt_at) {
      g.status = 'hunt';
      this.announce(code, 'hunt', 'all', null, 'Head start’s over. The hunt is on!', true);
    }
    if (g.status === 'hunt') {
      if (now >= g.ends_at) { this.finish(code, 'time'); return; }
      const iv = g.ping_min * 60_000;
      if (g.next_ping_at <= now && g.next_ping_at < g.ends_at) {
        this.do_ping(code);
        g.next_ping_at += iv * (Math.floor((now - g.next_ping_at) / iv) + 1);
      }
      while (g.shrink_warned < g.shrinks.length && g.shrinks[g.shrink_warned].warn_at <= now) {
        g.shrink_warned++;
        this.announce(code, 'shrink_warn', 'all', null, 'Zone shrinks in 1 min.', true, { index: g.shrink_warned - 1 });
      }
      while (g.shrink_done < g.shrinks.length && g.shrinks[g.shrink_done].at <= now) {
        const s = g.shrinks[g.shrink_done++];
        g.cur_lat = s.lat; g.cur_lng = s.lng; g.cur_radius = s.radius;
        this.announce(code, 'shrink', 'all', null, 'The zone just shrank. Stay inside!');
      }
    }
    g.next_event_at = L.nextEventAt(g);
    this.changed(code);
  }
  tick() {
    const now = this.now();
    for (const g of this.games.values()) {
      if (['headstart', 'hunt'].includes(g.status) && g.next_event_at <= now) this.advance(g.code);
    }
    for (const l of [...this.locations.values()]) {
      if (this.gameStatus(l.game_code) === 'hunt' && l.team === 'runner') this.eval_outside(l.game_code, l.user_id);
    }
  }
  cleanup() {
    const cutoff = this.now() - 7 * 86400_000;
    const gone = [...this.games.values()].filter((g) => (g.ended_at ?? g.created_at) < cutoff).map((g) => g.code);
    for (const code of gone) {
      this.games.delete(code);
      this.players = this.players.filter((p) => p.game_code !== code);
      this.pings = this.pings.filter((p) => p.game_code !== code);
      this.radio = this.radio.filter((p) => p.game_code !== code);
      this.events = this.events.filter((p) => p.game_code !== code);
      for (const m of [this.locations, this.reveals]) for (const k of [...m.keys()]) if (k.startsWith(code + '|')) m.delete(k);
      this.changed(code);
    }
    this.reports = this.reports.filter((r) => r.created_at >= cutoff);
    return gone.length;
  }
  counts(code) {
    const n = (arr) => arr.filter((r) => (r.game_code ?? r.code) === code).length;
    return {
      game: this.games.has(code) ? 1 : 0, players: n(this.players), locations: n([...this.locations.values()]),
      pings: n(this.pings), radio: n(this.radio), events: n(this.events),
    };
  }

  send_location(uid, code, lat, lng, acc = null) {
    const g = this.games.get(code), p = this.me(code, uid);
    if (!p || !p.team || p.status !== 'active' || !['headstart', 'hunt'].includes(g?.status)) return { ok: false, server_now: this.now() };
    const k = key(code, uid), prev = this.locations.get(k);
    this.locations.set(k, { game_code: code, user_id: uid, team: p.team, initials: p.initials, lat, lng, acc, out_since: prev?.out_since ?? null, updated_at: this.now() });
    const out = this.eval_outside(code, uid);
    this.changed(code);
    return { ok: true, server_now: this.now(), out_since: out };
  }
  send_radio(uid, code, body) {
    const p = this.me(code, uid);
    if (!p || !p.team || p.status === 'left') fail('Radio’s off for you.');
    const text = String(body || '').trim().slice(0, 280);
    if (!text) return;
    this.radio.push({ id: this.seq++, game_code: code, user_id: uid, name: p.name, team: p.team, body: text, created_at: this.now() });
    this.changed(code);
  }
  request_tag(uid, code, runner) {
    const me = this.me(code, uid), r = this.me(code, runner);
    if (this.gameStatus(code) !== 'hunt') fail('No tagging right now.');
    if (me?.team !== 'hunter' || me.status !== 'active') fail('Only hunters can tag.');
    if (r?.team !== 'runner' || r.status !== 'active') fail('They’re already out.');
    if (this.events.some((e) => e.game_code === code && e.kind === 'tag_request' && e.target === runner && e.data.hunter_id === uid && e.created_at > this.now() - 10_000)) return;
    this.announce(code, 'tag_request', 'runner', runner, `${me.name} says they tagged you. True?`, true, { hunter_id: uid, hunter_name: me.name }, false, 'Tagged?');
  }
  confirm_tag(uid, code, hunter) {
    const me = this.me(code, uid), h = this.me(code, hunter);
    if (this.gameStatus(code) !== 'hunt') fail('No tagging right now.');
    if (me?.team !== 'runner' || me.status !== 'active') fail('You’re not a free runner.');
    if (h?.team !== 'hunter') fail('Pick the hunter who got you.');
    Object.assign(me, { status: 'tagged', tagged_at: this.now(), tagged_by: h.user_id, tagged_by_name: h.name });
    this.locations.delete(key(code, uid)); this.reveals.delete(key(code, uid));
    this.announce(code, 'tag', 'all', null, `Tagged: ${h.name} got ${me.name}.`, true, { runner_id: uid, hunter_id: hunter });
    this.check_over(code);
  }
  deny_tag(uid, code, hunter) {
    const me = this.me(code, uid); if (!me) return;
    this.announce(code, 'tag_denied', 'hunter', hunter, `${me.name} says you missed. Ouch.`);
  }
  leave_game(uid, code) {
    const g = this.games.get(code), me = this.me(code, uid);
    if (!g || !me) return;
    if (g.status === 'lobby') {
      if (g.host_id === uid) {
        this.games.delete(code);
        this.players = this.players.filter((p) => p.game_code !== code);
        this.events = this.events.filter((e) => e.game_code !== code);
      } else this.players = this.players.filter((p) => p !== me);
      this.changed(code);
      return;
    }
    if (me.status === 'left' || g.status === 'ended') return;
    me.status = 'left'; me.left_at = this.now();
    this.locations.delete(key(code, uid)); this.reveals.delete(key(code, uid));
    this.announce(code, 'left', 'all', null, `${me.name} bailed.`);
    this.check_over(code);
  }
  end_game(uid, code) {
    if (this.games.get(code)?.host_id !== uid) fail('Only the host can end the round.');
    this.finish(code, 'host');
  }
}

// One player's connection to the demo server. Same method names as the Supabase backend.
export class DemoClient {
  constructor(server, profile) {
    this.server = server;
    this.profile = profile;
    this.uid = profile.id;
    server.addProfile(profile.id, profile.name, profile.username);
  }
  call(fn, ...args) {
    return new Promise((resolve, reject) => {
      setTimeout(() => { try { resolve(this.server[fn](this.uid, ...args)); } catch (e) { reject(e); } }, 15);
    });
  }
  now() { return this.server.now(); }
  createGame(o) { return this.call('create_game', o); }
  peekGame(code) { return this.call('peek_game', code); }
  joinGame(code) { return this.call('join_game', code); }
  setPick(code, pick) { return this.call('set_pick', code, pick); }
  setReady(code, r) { return this.call('set_ready', code, r); }
  kick(code, user) { return this.call('kick_player', code, user); }
  startGame(code) { return this.call('start_game', code); }
  leave(code) { return this.call('leave_game', code); }
  endGame(code) { return this.call('end_game', code); }
  sendLocation(code, lat, lng, acc) { return this.call('send_location', code, lat, lng, acc); }
  sendRadio(code, body) { return this.call('send_radio', code, body); }
  requestTag(code, runner) { return this.call('request_tag', code, runner); }
  confirmTag(code, hunter) { return this.call('confirm_tag', code, hunter); }
  denyTag(code, hunter) { return this.call('deny_tag', code, hunter); }
  watch(code, cb) { return this.server.subscribe(this.uid, code, cb); }
  // Rules lab: run a raw read as this player and see what the policies let through.
  probe(table, where) {
    try { return { ok: true, rows: this.server.select(this.uid, table, where) }; } catch (e) { return { ok: false, error: e.message, rows: [] }; }
  }
  async block(user) {
    if (!this.server.blocks.some((b) => b.blocker === this.uid && b.blocked === user.user_id)) {
      this.server.blocks.push({ blocker: this.uid, blocked: user.user_id, blocked_name: user.name, blocked_username: user.username, created_at: this.now() });
    }
  }
  async unblock(userId) { this.server.blocks = this.server.blocks.filter((b) => !(b.blocker === this.uid && b.blocked === userId)); }
  async listBlocks() { return this.server.blocks.filter((b) => b.blocker === this.uid).map((b) => ({ ...b })); }
  async report(r) { this.server.reports.push({ ...r, reporter: this.uid, created_at: this.now() }); }
}

export { uuid };
