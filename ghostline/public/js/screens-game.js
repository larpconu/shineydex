// The round: head start, hunt map, tagging, Radio, the ⋯ menu, and results.
import { $, $$, esc, icon, el, sheet, confirmSheet, toast, banner, errText, haptic, confetti, countTo, setRole } from './ui.js';
import * as L from './logic.js';
import { makeMap, zoneLayers, markerSet } from './map.js';
import { watchGps, keepAwake } from './geo.js';
import { playerSheet } from './screens-lobby.js';

const SEND_MIN_MS = 4000, SEND_MAX_MS = 10000, SEND_MOVE_M = 8;
const STALE_MS = 90_000;

export function gameScreen(root, app, params) {
  const api = app.api();
  if (!api) { app.go('home', {}, { reset: true }); return; }
  const code = params.code;
  const myId = api.uid ?? app.profile?.id;
  const demo = app.isDemo ? app.demo : null;
  root.classList.add('game');
  root.innerHTML = `
    <div class="map" data-map></div>
    <div class="oob-vignette hidden" data-vignette></div>
    <div class="hud" data-hud>
      <span class="role-badge" data-role>${icon('ghost')}<span>…</span></span>
      <div class="hud-stat"><span class="lbl" data-ping-lbl>Next ping</span><span class="val" data-ping>--:--</span></div>
      <span class="sep"></span>
      <div class="hud-stat"><span class="lbl">Runners left</span><span class="val"><span data-left>-</span><span class="dim"> of </span><span data-total>-</span></span></div>
      <span class="sep"></span>
      <div class="hud-stat"><span class="lbl">Time</span><span class="val" data-clock>--:--</span></div>
    </div>
    <div class="subhud" data-subhud></div>
    <div class="game-actions" data-actions></div>
    ${demo ? `<span class="chip zone demo-hint" data-demo-hint>${icon('footprints')} Demo: tap the map to walk</span>` : ''}
    <div class="radio-panel hidden" data-radio>
      <div class="radio-head"><h3 data-radio-title>Radio</h3><span class="chip" data-radio-chip></span></div>
      <div class="radio-log" data-log></div>
      <form class="radio-input" data-send><input class="input" maxlength="280" placeholder="Say something sneaky…" aria-label="Message" enterkeyhint="send"><button class="send" aria-label="Send">${icon('send')}</button></form>
    </div>
    <div data-overlay></div>
    <nav class="tabbar" role="tablist">
      <button role="tab" aria-selected="true" data-tab="map">${icon('map')}<span>Map</span></button>
      <button role="tab" aria-selected="false" data-tab="radio">${icon('radio')}<span>Radio</span><i class="dot hidden" data-unread></i></button>
      <button role="tab" aria-selected="false" data-tab="more" aria-label="More">${icon('ellipsis')}<span>More</span></button>
    </nav>`;

  const map = makeMap($('[data-map]', root), { zoom: 16 });
  const zones = zoneLayers(map);
  const people = markerSet(map);
  let st = null, me = null, myPos = null, firstFit = true, tab = 'map';
  let lastEventId = null, lastPingN = null, lastRadioId = 0, seenRadio = 0;
  let outSince = null, peeked = false, stopShare = null, stopWake = null, lastSent = null, gpsErr = null, tagPrompt = null;
  let ended = false;
  const blocked = app.blocked || (app.blocked = new Set());
  api.listBlocks?.().then((l) => l.forEach((b) => blocked.add(b.blocked))).catch(() => {});

  // ---------- my position ----------
  const onFix = (fix) => {
    myPos = fix; gpsErr = null;
    drawMarkers();
    maybeSend();
    checkZone();
  };
  const startSharing = () => {
    if (stopShare) return;
    stopShare = demo ? demo.watchMe(onFix) : watchGps(onFix, (e) => { gpsErr = e; drawSub(); });
    stopWake = keepAwake((s) => { wake = s; drawSub(); });
  };
  let wake = 'off';
  const stopSharing = () => { stopShare?.(); stopShare = null; stopWake?.(); stopWake = null; };
  let sending = false;
  const maybeSend = async (force = false) => {
    if (!myPos || !sharingAllowed() || sending) return;
    const now = Date.now();
    const moved = lastSent ? L.distance(lastSent.lat, lastSent.lng, myPos.lat, myPos.lng) : Infinity;
    const age = lastSent ? now - lastSent.t : Infinity;
    if (!force && !(age >= SEND_MAX_MS || (moved >= SEND_MOVE_M && age >= SEND_MIN_MS))) return;
    sending = true;
    try {
      const r = await api.sendLocation(code, myPos.lat, myPos.lng, myPos.acc);
      lastSent = { lat: myPos.lat, lng: myPos.lng, t: Date.now() };
      if (r && r.ok === false) stopSharing();
      else if (r && 'out_since' in r) { outSince = r.out_since ?? null; checkZone(); }
    } catch { /* retry next tick */ }
    sending = false;
  };
  const sharingAllowed = () => st?.game && ['headstart', 'hunt'].includes(st.game.status) && me?.status === 'active' && !!me.team;
  const heartbeat = setInterval(() => maybeSend(), demo ? 1000 : 2500);

  // ---------- map clicks (demo walking) ----------
  map.on('click', (e) => {
    if (!demo) return;
    demo.setMyTarget(e.latlng.lat, e.latlng.lng);
    $('[data-demo-hint]', root)?.classList.add('hidden');
  });

  // ---------- zone ----------
  const isOutside = () => {
    if (!myPos || !st?.game) return false;
    const z = L.currentZone(st.game);
    return L.distance(myPos.lat, myPos.lng, z.lat, z.lng) > z.radius;
  };
  const checkZone = () => {
    const runnerActive = me?.team === 'runner' && me.status === 'active' && st?.game?.status === 'hunt';
    if (runnerActive && isOutside()) { if (outSince == null) outSince = api.now(); }
    else outSince = null;
    drawSub();
  };

  // ---------- drawing ----------
  const team = () => me?.team;
  const drawHud = () => {
    if (!st?.game) return;
    const g = st.game;
    const runners = st.players.filter((p) => p.team === 'runner');
    const left = runners.filter((p) => p.status === 'active').length;
    countTo($('[data-left]', root), left);
    $('[data-total]', root).textContent = runners.length;
    const spectator = me?.status !== 'active';
    const badge = $('[data-role]', root);
    badge.className = `role-badge${spectator ? ' spectator' : ''}`;
    badge.innerHTML = spectator ? `${icon('eye')}<span>${me?.status === 'tagged' ? 'Out' : 'Gone'}</span>`
      : team() === 'hunter' ? `${icon('crosshair')}<span>Hunter</span>` : `${icon('footprints')}<span>Runner</span>`;
  };
  const tickHud = () => {
    if (!st?.game) return;
    const g = st.game, now = api.now();
    const pingEl = $('[data-ping]', root), lbl = $('[data-ping-lbl]', root);
    if (g.status === 'headstart') { lbl.textContent = 'Hunt in'; pingEl.textContent = L.fmtClock(g.hunt_at - now); }
    else if (g.status === 'hunt') {
      lbl.textContent = 'Next ping';
      pingEl.textContent = g.next_ping_at < g.ends_at ? L.fmtClock(g.next_ping_at - now) : 'none';
    }
    $('[data-clock]', root).textContent = g.ends_at ? L.fmtClock((g.status === 'headstart' ? g.ends_at : g.ends_at) - now) : '--:--';
    // ages on ping markers
    for (const n of $$('[data-since]', root)) {
      const age = now - Number(n.dataset.since);
      const chip = n.querySelector('.age');
      if (chip) chip.textContent = `${L.fmtAgo(age)} ago`;
      const life = Math.max(1, st.game.ping_min * 60_000 * 2);
      n.style.opacity = String(Math.max(0.3, 1 - age / life));
    }
    // head start overlay countdown
    const big = $('[data-big]', root);
    if (big) {
      const left = Math.max(0, g.hunt_at - now), total = Math.max(1, g.hunt_at - g.started_at);
      big.textContent = L.fmtClock(left);
      const ring = $('[data-ring]', root);
      if (ring) ring.style.strokeDashoffset = String(ring.dataset.len * (1 - left / total));
      const mini = $('[data-mini]', root); if (mini) mini.textContent = L.fmtClock(left);
    }
    // out of zone countdown
    const oob = $('[data-oob-count]', root);
    if (oob && outSince != null) {
      const leftMs = L.OUT_REVEAL_MS - (now - outSince);
      oob.textContent = leftMs > 0 ? L.fmtClock(leftMs) : 'LIVE';
      $('[data-oob-text]', root).textContent = leftMs > 0 ? 'Get back in the zone!' : 'Hunters can see you live!';
    }
  };
  const hudTimer = setInterval(tickHud, 250);

  const drawZone = () => {
    const g = st.game;
    const z = L.currentZone(g);
    zones.setZone(z);
    const next = L.upcomingShrink(g);
    zones.setNext(next && g.status !== 'ended' ? next : null);
    if (firstFit) { firstFit = false; zones.fit(z, 30); }
  };

  const latestPingPositions = () => {
    const out = new Map();
    for (const p of st.pings) for (const pos of p.positions) out.set(pos.user_id, { ...pos, taken_at: p.taken_at, n: p.n });
    return out;
  };

  const drawMarkers = () => {
    if (!st?.game) return;
    const list = [];
    const myTeam = team();
    const playersById = new Map(st.players.map((p) => [p.user_id, p]));
    const now = api.now();
    // teammates, live (the server only sends us our own team's rows)
    for (const l of st.locations) {
      if (l.user_id === myId) continue;
      const p = playersById.get(l.user_id);
      if (!p || p.status !== 'active') continue;
      const stale = now - l.updated_at > STALE_MS;
      list.push({ id: 'live:' + l.user_id, lat: l.lat, lng: l.lng, z: 500, html: `<div class="mk" style="opacity:${stale ? 0.45 : 1}"><div class="mk-dot ${l.team}" title="${esc(p.name)}">${esc(l.initials)}</div></div>` });
    }
    if (myTeam === 'hunter') {
      const revealed = new Set(st.reveals.map((r) => r.user_id));
      for (const [uid, pos] of latestPingPositions()) {
        const p = playersById.get(uid);
        if (!p || p.status !== 'active' || revealed.has(uid)) continue;
        list.push({ id: `ping:${uid}:${pos.n}`, lat: pos.lat, lng: pos.lng, z: 300, html: `<div class="mk"><div class="mk-ping" data-since="${pos.taken_at}"><div class="ring">${esc(pos.initials)}</div><span class="mk-chip age">${L.fmtAgo(now - pos.taken_at)} ago</span></div></div>` });
      }
      for (const r of st.reveals) {
        const p = playersById.get(r.user_id);
        if (!p || p.status !== 'active') continue;
        list.push({ id: 'reveal:' + r.user_id, lat: r.lat, lng: r.lng, z: 600, html: `<div class="mk mk-live"><div class="mk-dot runner">${esc(r.initials)}</div><span class="mk-chip live">LIVE</span></div>` });
      }
    }
    if (myPos && me?.status === 'active' && myTeam) {
      list.push({ id: 'me', lat: myPos.lat, lng: myPos.lng, z: 1000, html: `<div class="mk"><div class="mk-dot me ${myTeam}">${esc(me.initials)}</div></div>` });
    }
    people.sync(list);
    tickHud();
  };

  const drawSub = () => {
    const sub = $('[data-subhud]', root);
    const bits = [];
    const g = st?.game;
    if (outSince != null && me?.team === 'runner' && me.status === 'active') {
      bits.push(`<div class="oob-banner">${icon('circle-alert')}<span data-oob-text>Get back in the zone!</span><span class="mono" data-oob-count>0:30</span></div>`);
    }
    $('[data-vignette]', root).classList.toggle('hidden', outSince == null);
    if (me && me.status === 'tagged') bits.push(`<span class="chip">${icon('eye')} Spectating · tagged by ${esc(me.tagged_by_name || 'a hunter')}</span>`);
    if (g && ['headstart', 'hunt'].includes(g.status) && me?.status === 'active') {
      if (gpsErr) bits.push(`<button class="chip danger" data-gps-help>${icon('locate-fixed')} ${esc(gpsErr.code === 1 ? 'Location blocked' : 'No GPS fix')} · Help</button>`);
      if (!demo && wake !== 'on') bits.push(`<span class="chip warn">${icon('sun-dim')} Keep the screen on</span>`);
    }
    if (peeked && g?.status === 'headstart' && me?.team === 'runner') bits.push(`<span class="chip runner">${icon('timer')} Hide! <span class="mono" data-mini></span></span>`);
    sub.innerHTML = bits.join('');
    $('[data-gps-help]', sub)?.addEventListener('click', () => app.go('help', { anchor: 'loc-help' }));
    tickHud();
  };

  const drawActions = () => {
    const box = $('[data-actions]', root);
    const g = st.game;
    if (g.status !== 'hunt' || me?.status !== 'active' || tab !== 'map') { box.innerHTML = ''; return; }
    box.innerHTML = me.team === 'runner'
      ? `<button class="btn btn-runner huge" data-got>${icon('hand')}<span>I got tagged</span></button>`
      : `<button class="btn btn-hunter huge" data-tag>${icon('target')}<span>Tag a runner</span></button>`;
    $('[data-got]', box)?.addEventListener('click', iGotTagged);
    $('[data-tag]', box)?.addEventListener('click', tagSomeone);
  };

  const drawOverlay = () => {
    const ov = $('[data-overlay]', root);
    const g = st.game;
    if (g.status !== 'headstart' || (me?.team === 'runner' && peeked) || me?.status !== 'active') { ov.innerHTML = ''; return; }
    if (ov.firstElementChild?.dataset.kind === me.team) return;
    const R = 140, len = 2 * Math.PI * R;
    const hunter = me.team === 'hunter';
    ov.innerHTML = `<section class="screen countdown-screen ${hunter ? 'hunter' : ''}" data-kind="${me.team}" style="z-index:720;padding-bottom:calc(var(--safe-bottom) + 96px)">
      ${hunter ? `<div class="eye-shut">${icon('eye-off')}</div><h1>No peeking.</h1><p class="dim" style="max-width:280px">Runners are hiding. Close your eyes, count, think about your life choices. You'll get their first ping when this hits zero.</p>`
        : `<span class="chip runner">${icon('footprints')} You're a runner</span><h1>Go hide!</h1><p class="dim" style="max-width:280px">Get somewhere sneaky inside the zone before the hunters are let loose.</p>`}
      <div class="ring-wrap"><svg class="ring" viewBox="0 0 300 300"><circle class="ring-bg" cx="150" cy="150" r="${R}" fill="none" stroke-width="10"/>
        <circle class="ring-fg" data-ring data-len="${len}" cx="150" cy="150" r="${R}" fill="none" stroke-width="10" stroke-linecap="round" stroke-dasharray="${len}" stroke-dashoffset="0"/></svg>
        <div class="big-count" data-big>--:--</div></div>
      ${hunter ? '' : `<button class="btn btn-secondary accent compact" data-peek>${icon('map')}<span>Show me the zone</span></button>`}
    </section>`;
    $('[data-peek]', ov)?.addEventListener('click', () => { peeked = true; drawOverlay(); drawSub(); });
    tickHud();
  };

  // ---------- Radio ----------
  const drawRadio = () => {
    const log = $('[data-log]', root);
    const msgs = st.radio.filter((m) => !blocked.has(m.user_id));
    $('[data-radio-title]', root).textContent = team() === 'hunter' ? 'Hunter radio' : 'Runner radio';
    $('[data-radio-chip]', root).className = `chip ${team() || ''}`;
    $('[data-radio-chip]', root).innerHTML = `${icon('lock')} Team only`;
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    log.innerHTML = msgs.length ? msgs.map((m) => {
      const mine = m.user_id === myId;
      const t = new Date(m.created_at - api.now() + Date.now());
      return `<div class="msg ${mine ? 'mine' : ''}" data-msg="${m.id}" data-uid="${esc(m.user_id)}">${mine ? '' : `<span class="who">${esc(m.name)}</span>`}<div class="bubble">${esc(m.body)}</div><span class="ts">${t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></div>`;
    }).join('') : `<div class="empty-state">${icon('radio')}<b>Radio silence</b><p>Only your team can read this channel. Plot away.</p></div>`;
    if (atBottom || tab === 'radio') log.scrollTop = log.scrollHeight;
    // press and hold → report / block
    $$('.msg:not(.mine)', log).forEach((n) => {
      let t;
      const start = () => { n.classList.add('pressing'); t = setTimeout(() => {
        n.classList.remove('pressing'); haptic(20);
        const p = st.players.find((x) => x.user_id === n.dataset.uid) || { user_id: n.dataset.uid, name: 'Player', username: '' };
        const m = st.radio.find((x) => String(x.id) === n.dataset.msg);
        playerSheet(app, p, { code, message: m?.body }).then(() => drawRadio());
      }, 500); };
      const cancel = () => { clearTimeout(t); n.classList.remove('pressing'); };
      n.addEventListener('pointerdown', start);
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) n.addEventListener(ev, cancel);
      n.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    const newest = msgs.length ? msgs[msgs.length - 1].id : 0;
    const unread = msgs.some((m) => m.id > seenRadio && m.user_id !== myId);
    if (tab === 'radio') seenRadio = newest;
    $('[data-unread]', root).classList.toggle('hidden', tab === 'radio' || !unread);
  };
  $('[data-send]', root).onsubmit = async (e) => {
    e.preventDefault();
    const inp = $('[data-send] input', root);
    const body = inp.value.trim();
    if (!body) return;
    inp.value = '';
    try { await api.sendRadio(code, body); } catch (ex) { toast(errText(ex), 'danger'); inp.value = body; }
  };

  // ---------- tabs ----------
  const setTab = (t) => {
    if (t === 'more') { moreMenu(); return; }
    tab = t;
    $$('[data-tab]', root).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    $('[data-radio]', root).classList.toggle('hidden', t !== 'radio');
    if (st) { drawRadio(); drawActions(); }
    if (t === 'map') setTimeout(() => map.invalidateSize(), 50);
  };
  $$('[data-tab]', root).forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));

  // ---------- tagging ----------
  async function iGotTagged() {
    const hunters = st.players.filter((p) => p.team === 'hunter' && p.status !== 'left');
    const v = await sheet({
      title: 'Who got you?', lead: 'Pick the hunter who tagged you. You’ll be out and become a spectator.',
      actions: [...hunters.map((h) => ({ label: h.name, icon: 'crosshair', kind: 'btn-secondary', value: h.user_id })), { label: 'Never mind, still free', kind: 'btn-secondary', value: null }],
    });
    if (!v) return;
    try { await api.confirmTag(code, v); haptic([60, 40, 60]); } catch (e) { toast(errText(e), 'danger'); }
  }
  async function tagSomeone() {
    const runners = st.players.filter((p) => p.team === 'runner' && p.status === 'active');
    if (!runners.length) return;
    const v = await sheet({
      title: 'Who did you tag?', lead: 'They’ll get a prompt to confirm. Honor system, gremlin.',
      actions: [...runners.map((r) => ({ label: r.name, icon: 'footprints', kind: 'btn-secondary', value: r.user_id })), { label: 'Cancel', value: null }],
    });
    if (!v) return;
    try { await api.requestTag(code, v); toast(`Asked ${runners.find((r) => r.user_id === v)?.name} to confirm.`, 'good'); } catch (e) { toast(errText(e), 'danger'); }
  }
  function promptTag(ev) {
    if (tagPrompt || me?.status !== 'active') return;
    tagPrompt = true;
    haptic([100, 60, 100, 60, 100]);
    sheet({
      title: `Did ${ev.data.hunter_name} tag you?`, lead: 'Be honest. The ghosts are watching.', dismissable: false,
      actions: [{ label: 'Yep, I’m out', icon: 'hand', kind: 'btn-hunter', value: 'yes' }, { label: 'Nope, missed me', kind: 'btn-secondary', value: 'no' }],
    }).then(async (v) => {
      tagPrompt = null;
      try {
        if (v === 'yes') await api.confirmTag(code, ev.data.hunter_id);
        else await api.denyTag(code, ev.data.hunter_id);
      } catch (e) { toast(errText(e), 'danger'); }
    });
  }

  // ---------- ⋯ menu ----------
  async function moreMenu() {
    const g = st?.game; if (!g) return;
    const isHost = g.host_id === myId;
    const live = ['headstart', 'hunt'].includes(g.status);
    const actions = [
      { label: 'How to play', icon: 'circle-help', value: 'howto' },
      { label: 'Location help', icon: 'locate-fixed', value: 'help' },
    ];
    if (demo) {
      actions.unshift({ label: 'Rules lab: try to cheat', icon: 'flask-conical', kind: 'btn-secondary accent', value: 'rules' });
      actions.push({ label: `Clock speed: ${demo.speed}× (tap to change)`, icon: 'fast-forward', value: 'speed' });
    }
    if (isHost && live) actions.push({ label: 'End round for everyone', icon: 'square', kind: 'btn-danger', value: 'end' });
    if (live && me?.status !== 'left') actions.push({ label: 'Leave game', icon: 'door-open', kind: 'btn-danger', value: 'leave' });
    actions.push({ label: 'Close', value: null });
    const v = await sheet({ title: `Game ${code}`, lead: `${L.fmtDistance(g.zone_radius * 2)} zone · ping every ${g.ping_min} min${g.shrink ? ' · shrinking' : ''}${!demo ? ` · screen awake: ${wake === 'on' ? 'yes' : 'no'}` : ''}`, actions });
    if (v === 'howto') app.go('howto');
    if (v === 'help') app.go('help', { anchor: 'loc-help' });
    if (v === 'rules') rulesLab(app, api, code, st, me);
    if (v === 'speed') { const s = { 1: 5, 5: 20, 20: 60, 60: 1 }[demo.speed] || 5; demo.setSpeed(s); toast(`Clock: ${s}×`, 'good'); }
    if (v === 'end') {
      if (await confirmSheet('End the round for everyone?', 'Whoever’s still free wins it for the runners.', 'End round', { danger: true })) {
        api.endGame(code).catch((e) => toast(errText(e), 'danger'));
      }
    }
    if (v === 'leave') {
      if (await confirmSheet('Leave this game?', 'You can’t rejoin this round. Your location stops sharing right away.', 'Leave', { danger: true })) {
        try { await api.leave(code); } catch (e) { toast(errText(e), 'danger'); return; }
        stopSharing();
        app.store.set('activeGame', null);
        if (demo) app.endDemo();
        app.go('home', {}, { reset: true });
      }
    }
  }
  app.backGuard = () => { moreMenu(); return false; };

  // ---------- events → banners ----------
  const handleEvents = (events, initial) => {
    for (const ev of events) {
      if (lastEventId != null && ev.id <= lastEventId) continue;
      if (!initial) {
        const k = ev.kind;
        if (k === 'ping') {
          if (team() === 'runner') banner(ev.body, { kind: 'ping', icon: 'radar', vibrate: [200, 100, 200] });
          else banner(ev.body, { kind: 'ping', icon: 'radar', vibrate: [60, 40, 60] });
        } else if (k === 'shrink_warn') banner(ev.body, { kind: 'warn', icon: 'timer', vibrate: [120, 80, 120] });
        else if (k === 'shrink') banner(ev.body, { kind: 'warn', icon: 'circle-alert', vibrate: 80 });
        else if (k === 'tag') banner(ev.body, { kind: 'tag', icon: 'target', vibrate: [80, 50, 80] });
        else if (k === 'hunt') banner(ev.body, { kind: 'good', icon: 'zap', vibrate: [80, 40, 80, 40, 160] });
        else if (k === 'reveal') banner(ev.body, { kind: 'danger', icon: 'scan-eye', vibrate: 60 });
        else if (k === 'revealed') banner(ev.body, { kind: 'danger', icon: 'scan-eye', vibrate: [200, 80, 200] });
        else if (k === 'tag_denied') banner(ev.body, { kind: 'tag', icon: 'circle-x' });
        else if (k === 'left' || k === 'start') banner(ev.body, { kind: 'info', icon: k === 'left' ? 'door-open' : 'play' });
        else if (k === 'end') banner(ev.body, { kind: 'good', icon: 'trophy', vibrate: [100, 50, 100, 50, 300] });
      }
      if (ev.kind === 'tag_request' && ev.target === myId && api.now() - ev.created_at < 60_000 && st.game.status === 'hunt') promptTag(ev);
    }
    if (events.length) lastEventId = Math.max(lastEventId ?? 0, ...events.map((e) => e.id));
  };

  const ripple = () => {
    const r = el('<div class="ping-ripple"></div>');
    root.appendChild(r);
    setTimeout(() => r.remove(), 1500);
  };

  // ---------- state ----------
  const unwatch = api.watch(code, (s, err) => {
    if (err || !s) {
      if (!st) $('[data-subhud]', root).innerHTML = `<span class="chip danger">${icon('wifi-off')} Reconnecting…</span>`;
      return;
    }
    if (!s.game) { if (!ended) { ended = true; toast('That game is gone.', 'danger'); app.store.set('activeGame', null); app.go('home', {}, { reset: true }); } return; }
    const initial = !st;
    st = s;
    me = s.players.find((p) => p.user_id === myId) || null;
    if (!me) { app.store.set('activeGame', null); app.go('home', {}, { reset: true }); return; }
    if (s.game.status === 'lobby') { app.go('lobby', { code }, { replace: true }); return; }
    if (s.game.status === 'ended') {
      if (!ended) { ended = true; handleEvents(s.events, initial); stopSharing(); app.go('results', { code }, { replace: true }); }
      return;
    }
    if (me.status === 'left') { app.store.set('activeGame', null); app.go('home', {}, { reset: true }); return; }
    setRole(me.team === 'hunter' ? 'hunter' : 'runner');
    if (!demo) app.store.set('activeGame', code);
    if (sharingAllowed()) startSharing(); else stopSharing();
    const pn = s.game.ping_count;
    if (lastPingN != null && pn > lastPingN) { ripple(); }
    lastPingN = pn;
    handleEvents(s.events, initial);
    checkZone();
    drawZone(); drawHud(); drawMarkers(); drawOverlay(); drawActions(); drawSub(); drawRadio();
  });

  return () => {
    unwatch(); stopSharing(); clearInterval(heartbeat); clearInterval(hudTimer); map.remove();
  };
}

// Rules lab (demo): try to read what you shouldn't, and watch the policies say no.
function rulesLab(app, api, code, st, me) {
  const s = app.demo.server;
  const byCode = (r) => (r.game_code ?? r.code) === code;
  const total = (t, f) => s.table(t).filter((r) => byCode(r) && f(r)).length;
  const myTeam = me?.team;
  const other = myTeam === 'hunter' ? 'runner' : 'hunter';
  const checks = [
    { label: `Read ${other}s’ live locations`, t: 'locations', f: (r) => r.team === other, expect: false },
    { label: `Read my team’s live locations`, t: 'locations', f: (r) => r.team === myTeam, expect: true },
    { label: `Read the ${other} Radio`, t: 'radio', f: (r) => r.team === other, expect: false },
    { label: 'Read ping snapshots', t: 'pings', f: () => true, expect: myTeam === 'hunter' },
    { label: 'Read out-of-zone reveals', t: 'reveals', f: () => true, expect: myTeam === 'hunter' },
  ];
  const rows = checks.map((c) => {
    const exists = total(c.t, c.f);
    const got = api.probe(c.t, (r) => byCode(r) && c.f(r)).rows.length;
    const allowed = got > 0;
    const pass = c.expect ? true : got === 0;
    return `<div class="rule-row"><div><div style="font-weight:600">${esc(c.label)}</div><div class="small dim">${exists} exist · you can read <b class="mono">${got}</b></div></div>
      <span class="verdict chip ${allowed ? 'zone' : 'hunter'}">${allowed ? icon('check') + ' Allowed' : icon('lock') + ' Blocked'}</span>
      <span class="${pass ? '' : 'err'}" title="${pass ? 'as designed' : 'unexpected'}" style="color:${pass ? 'var(--runner)' : 'var(--danger)'}">${pass ? icon('circle-check') : icon('circle-x')}</span></div>`;
  }).join('');
  sheet({
    title: 'Rules lab',
    lead: `You’re a ${myTeam || 'player'}. Each line tries a raw read against the game data as you. The demo enforces the same row-level security policies as the real database (supabase/schema.sql).`,
    body: `<div class="card">${rows}</div>`,
    actions: [{ label: 'Nice. Back to the game', kind: 'btn-primary' }],
  });
}

// ---------------- Results ----------------
export function results(root, app, params) {
  const api = app.api();
  if (!api) { app.go('home', {}, { reset: true }); return; }
  const code = params.code;
  const myId = api.uid ?? app.profile?.id;
  const demo = app.isDemo ? app.demo : null;
  app.store.set('activeGame', null);
  root.classList.add('results');
  root.innerHTML = `<div class="stack-16"><div class="skel" style="height:120px;margin-top:40px"></div><div class="stats"><div class="skel" style="height:80px"></div><div class="skel" style="height:80px"></div><div class="skel" style="height:80px"></div></div><div class="skel" style="height:240px"></div></div>`;
  let drawn = false, map = null, play = null;
  const draw = (st) => {
    const g = st.game;
    const me = st.players.find((p) => p.user_id === myId);
    const runners = st.players.filter((p) => p.team === 'runner');
    const survivors = runners.filter((p) => p.status === 'active');
    const tags = runners.filter((p) => p.status === 'tagged').sort((a, b) => a.tagged_at - b.tagged_at);
    const won = me && ((g.winner === 'runners' && me.team === 'runner') || (g.winner === 'hunters' && me.team === 'hunter'));
    setRole(g.winner === 'hunters' ? 'hunter' : 'runner');
    const dur = (g.ended_at - g.started_at) / 60000;
    const mmss = (t) => L.fmtClock(t - g.started_at);
    const reason = { time: 'Time ran out.', all_tagged: 'Every runner got tagged.', host: 'The host called it.', no_hunters: 'The hunters all bailed.' }[g.end_reason] || '';
    const personal = !me ? '' : me.team === 'runner'
      ? me.status === 'active' ? 'You made it. Ghost status: legendary.' : me.status === 'tagged' ? `Tagged by ${esc(me.tagged_by_name)} at ${mmss(me.tagged_at)}.` : 'You bailed early.'
      : won ? 'You hunted them all down. Terrifying.' : 'They got away this time.';
    root.innerHTML = `
      <div class="headline stack-8">
        <span class="chip ${g.winner === 'hunters' ? 'hunter' : 'runner'}" style="align-self:center">${icon('trophy')} ${won ? 'You won' : me ? 'GG' : 'Final'}</span>
        <h1 class="${g.winner}">${g.winner === 'hunters' ? 'Hunters<br>win' : 'Runners<br>win'}</h1>
        <p class="dim">${esc(reason)} ${personal}</p>
      </div>
      <div class="stats">
        <div class="card stat"><div class="num" data-n="${Math.round(dur)}">0</div><div class="lbl">minutes</div></div>
        <div class="card stat"><div class="num" data-n="${st.pings.length}">0</div><div class="lbl">pings</div></div>
        <div class="card stat"><div class="num" data-n="${tags.length}">0</div><div class="lbl">tags</div></div>
      </div>
      <p class="section-label">Survived</p>
      <div class="card">${survivors.length ? `<div class="roster">${survivors.map((p) => `<div class="person"><span class="avatar runner">${esc(p.initials)}</span><span class="nm">${esc(p.name)}</span></div>`).join('')}</div>` : '<p class="dim small">Nobody. Brutal.</p>'}</div>
      <p class="section-label">Tag timeline</p>
      <div class="card">${tags.length ? `<div class="timeline">${tags.map((p) => `
        <div class="tl-item"><span class="avatar hunter">${esc(st.players.find((h) => h.user_id === p.tagged_by)?.initials || '??')}</span>
          <div><div><b>${esc(p.tagged_by_name)}</b> tagged <b>${esc(p.name)}</b></div><div class="tl-time mono">${mmss(p.tagged_at)} in</div></div></div>`).join('')}</div>`
        : '<p class="dim small">No tags. Everyone was either very good or very lazy.</p>'}</div>
      <p class="section-label">Ping replay</p>
      ${st.pings.length ? `<div class="card stack-16">
        <div class="replay-map"><div class="map" data-rmap></div></div>
        <div class="row"><button class="icon-btn" data-play aria-label="Play">${icon('play')}</button>
          <input type="range" min="0" max="${st.pings.length - 1}" value="0" step="1" data-scrub style="flex:1">
          <span class="mono small" data-pl>1/${st.pings.length}</span></div>
        <p class="hint" data-pt></p></div>` : '<div class="card"><p class="dim small">No pings went out this round.</p></div>'}
      ${demo ? `<div class="card stack-8"><div class="row">${icon('flask-conical')}<b>Demo: data deletion</b></div>
        <p class="small dim">Real games are wiped 7 days after they end by a scheduled database job. Jump the demo clock ahead and run the same cleanup.</p>
        <button class="btn btn-secondary accent" data-skip>${icon('fast-forward')}<span>Skip 7 days</span></button><div data-skipres></div></div>` : ''}
      <div class="stack" style="margin-top:8px">
        <button class="btn btn-primary" data-home>${icon('ghost')}<span>${demo ? 'Back home' : 'Done'}</span></button>
        ${demo ? '<button class="btn btn-secondary" data-again>Play another demo</button>' : ''}
      </div>`;
    $$('[data-n]', root).forEach((n) => countTo(n, Number(n.dataset.n), 900));
    confetti(g.winner === 'hunters' ? ['#FF3D8B', '#F2F4F8', '#38E1FF'] : ['#C6FF3D', '#F2F4F8', '#38E1FF']);
    haptic(won ? [60, 40, 60, 40, 200] : 40);
    $('[data-home]', root).onclick = () => { if (demo) app.endDemo(); app.go('home', {}, { reset: true }); };
    $('[data-again]', root)?.addEventListener('click', () => { app.endDemo(); app.go('demo', {}, { reset: true }); });
    $('[data-skip]', root)?.addEventListener('click', () => {
      const before = demo.server.counts(code);
      demo.clock.skip(7 * 86400_000 + 60_000);
      const removed = demo.server.cleanup();
      const after = demo.server.counts(code);
      $('[data-skipres]', root).innerHTML = `<div class="rule-row"><span class="small">Before: ${before.players} players, ${before.pings} pings, ${before.radio} radio msgs, ${before.events} events</span></div>
        <div class="rule-row"><span class="small">After: ${after.players} players, ${after.pings} pings, ${after.radio} radio msgs, ${after.events} events</span>
        <span class="verdict chip ${removed ? 'zone' : 'warn'}" data-deleted>${removed ? icon('check') + ' Deleted' : 'Nothing to delete'}</span></div>`;
    });
    // replay
    if (st.pings.length) {
      map = makeMap($('[data-rmap]', root), { center: { lat: g.zone_lat, lng: g.zone_lng }, zoom: 15 });
      const zl = zoneLayers(map);
      zl.setZone({ lat: g.zone_lat, lng: g.zone_lng, radius: g.zone_radius });
      setTimeout(() => { map.invalidateSize(); zl.fit({ lat: g.zone_lat, lng: g.zone_lng, radius: g.zone_radius }, 16); }, 80);
      const ms = markerSet(map);
      const scrub = $('[data-scrub]', root);
      const show = (i) => {
        const p = st.pings[i];
        $('[data-pl]', root).textContent = `${i + 1}/${st.pings.length}`;
        $('[data-pt]', root).textContent = `Ping ${p.n} · ${mmss(p.taken_at)} in · ${p.positions.length} runner${p.positions.length === 1 ? '' : 's'}`;
        ms.sync(p.positions.map((x) => ({ id: x.user_id, lat: x.lat, lng: x.lng, html: `<div class="mk"><div class="mk-dot runner">${esc(x.initials)}</div></div>` })));
      };
      scrub.oninput = () => show(Number(scrub.value));
      show(0);
      $('[data-play]', root).onclick = (e) => {
        if (play) { clearInterval(play); play = null; e.currentTarget.innerHTML = icon('play'); return; }
        e.currentTarget.innerHTML = icon('square');
        play = setInterval(() => { const n = (Number(scrub.value) + 1) % st.pings.length; scrub.value = n; show(n); }, 900);
      };
    }
  };
  const unwatch = api.watch(code, (st, err) => {
    if (err || !st?.game) {
      if (!drawn && !err) root.innerHTML = `<div class="empty-state grow" style="justify-content:center">${icon('ghost')}<b>This game has vanished</b><p>Games are deleted 7 days after they end.</p><button class="btn btn-primary" data-h>Home</button></div>`;
      $('[data-h]', root)?.addEventListener('click', () => app.go('home', {}, { reset: true }));
      return;
    }
    if (drawn) return;
    drawn = true;
    draw(st);
  });
  return () => { unwatch(); clearInterval(play); map?.remove(); };
}
