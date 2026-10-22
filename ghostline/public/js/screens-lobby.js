// Demo setup, host setup, join (code boxes) and the lobby.
import { $, $$, esc, icon, sheet, confirmSheet, toast, banner, errText, haptic, rangeFill, setRole } from './ui.js';
import * as L from './logic.js';
import { makeMap, DEFAULT_CENTER, zoomForRadius } from './map.js';
import { getFix } from './geo.js';
import { DemoSession } from './demo.js';

const topbar = (title, right = '') => `<div class="topbar"><button class="icon-btn" data-back aria-label="Back">${icon('chevron-left')}</button><h2>${esc(title)}</h2>${right}</div>`;

async function guessCenter(app, ms = 2500) {
  try { return await Promise.race([getFix({ timeout: ms }), new Promise((_, r) => setTimeout(r, ms))]); }
  catch { return app.store.get('lastCenter') || DEFAULT_CENTER; }
}

// ---------------- Demo setup ----------------
export function demoSetup(root, app, params) {
  app.endDemo();
  let mode = 'host', bots = params.bots || 6, speed = params.speed || 5;
  const draw = () => {
    root.innerHTML = `${topbar('Demo round')}
      <div class="stack-24 grow">
        <div class="stack-8"><h1>You vs. the bots.</h1>
          <p class="dim">A pretend game with fake players who walk, hide, chase and trash-talk. Everything runs on your phone. Tap the map to move yourself around.</p></div>
        <div class="stack-8"><p class="section-label">How do you want in?</p>
          <div class="pick-grid" style="grid-template-columns:1fr 1fr">
            <button class="pick random" aria-pressed="${mode === 'host'}" data-mode="host">${icon('radar')}<b>Host</b><small>Bots join your code</small></button>
            <button class="pick random" aria-pressed="${mode === 'join'}" data-mode="join">${icon('log-in')}<b>Join</b><small>A bot hosts, you type the code</small></button>
          </div></div>
        <div class="card slider"><div class="slider-head"><label for="bots">Bots</label><span class="val mono" data-bv>${bots}</span></div>
          <input type="range" id="bots" min="2" max="11" step="1" value="${bots}"><div class="slider-scale"><span>2</span><span>11</span></div></div>
        <div class="stack-8"><p class="section-label">Clock speed</p>
          <div class="seg" role="group" aria-label="Clock speed">${[1, 5, 20].map((s) => `<button aria-pressed="${speed === s}" data-speed="${s}">${s}×</button>`).join('')}</div>
          <p class="hint">${speed === 1 ? 'Real time. Bring snacks.' : speed === 5 ? 'Five times faster. A 45-minute round takes 9.' : 'Twenty times faster. Blink and you’re tagged.'}</p></div>
        <div class="grow"></div>
        <button class="btn btn-primary" data-go>${icon('play')}<span>Start demo</span></button>
      </div>`;
    $('[data-back]', root).onclick = () => app.back();
    $$('[data-mode]', root).forEach((b) => (b.onclick = () => { mode = b.dataset.mode; draw(); }));
    $$('[data-speed]', root).forEach((b) => (b.onclick = () => { speed = Number(b.dataset.speed); draw(); }));
    const r = $('#bots', root); rangeFill(r);
    r.oninput = () => { bots = Number(r.value); $('[data-bv]', root).textContent = bots; rangeFill(r); };
    $('[data-go]', root).onclick = async (e) => {
      e.currentTarget.classList.add('loading');
      app.demo = new DemoSession({ speed, bots, profile: app.profile });
      if (mode === 'host') { app.go('host'); return; }
      const center = await guessCenter(app);
      const code = await app.demo.joinFlow(center);
      app.go('join', { demoCode: code });
    };
  };
  draw();
}

// ---------------- Host setup ----------------
export function hostSetup(root, app) {
  const api = app.api();
  const s = { diameter: L.LIMITS.diameter.def, roundMin: L.LIMITS.roundMin.def, pingMin: L.LIMITS.pingMin.def, headMin: L.LIMITS.headMin.def, shrink: true, ...app.store.get('hostPrefs', {}) };
  root.classList.add('flush');
  root.innerHTML = `
    <div class="host-map">
      <div class="map" data-map></div>
      <div class="zone-overlay"><div class="zone-circle" data-circle></div><div class="zone-handle" aria-hidden="true"></div></div>
      <button class="icon-btn back" data-back aria-label="Back">${icon('chevron-left')}</button>
      <span class="chip zone zone-label">${icon('map')} Drag the map to place the zone</span>
      <button class="icon-btn locate" data-locate aria-label="Center on me">${icon('locate-fixed')}</button>
    </div>
    <div class="host-sheet stack-16">
      ${app.isDemo ? `<span class="chip zone" style="align-self:flex-start">${icon('bot')} Demo · ${app.demo.botCount} bots · ${app.demo.speed}× clock</span>` : ''}
      ${slider('diameter', 'Zone diameter', s.diameter, L.LIMITS.diameter, (v) => L.fmtDistance(v), '400 m', '3 km')}
      ${slider('roundMin', 'Round length', s.roundMin, L.LIMITS.roundMin, (v) => L.fmtDuration(v), '10 min', '3 h')}
      ${slider('pingMin', 'Ping every', s.pingMin, L.LIMITS.pingMin, (v) => `${v} min`, '1 min', '30 min')}
      ${slider('headMin', 'Head start', s.headMin, L.LIMITS.headMin, (v) => (v ? `${v} min` : 'None'), 'None', '15 min')}
      <div class="card"><button class="toggle" role="switch" aria-checked="${s.shrink}" data-shrink>
        <span class="grow"><b>Shrinking zone</b><br><span class="dim small">Shrinks 4 times. 1-minute warning each time.</span></span><span class="track"></span></button></div>
      <p class="hint err" data-err></p>
      <button class="btn btn-primary" data-create>${icon('radar')}<span>Create game</span></button>
      <p class="hint center">Hosting is free. Always.</p>
    </div>`;
  const map = makeMap($('[data-map]', root), { center: app.store.get('lastCenter') || DEFAULT_CENTER, zoom: 15 });
  const circle = $('[data-circle]', root);
  const drawCircle = () => {
    const c = map.getCenter();
    const mpp = (156543.03392 * Math.cos((c.lat * Math.PI) / 180)) / Math.pow(2, map.getZoom());
    const px = s.diameter / mpp;
    circle.style.width = circle.style.height = `${px}px`;
  };
  map.on('move zoom', drawCircle);
  const fit = () => { map.setZoom(zoomForRadius(map, s.diameter / 2), { animate: true }); };
  setTimeout(() => { map.invalidateSize(); fit(); drawCircle(); }, 80);
  const locate = async () => {
    const c = await guessCenter(app, 6000);
    map.setView([c.lat, c.lng], map.getZoom(), { animate: true });
  };
  locate();
  $('[data-locate]', root).onclick = locate;
  $('[data-back]', root).onclick = () => { if (app.isDemo) app.endDemo(); app.back(); };
  for (const k of ['diameter', 'roundMin', 'pingMin', 'headMin']) {
    const input = $(`#s-${k}`, root), out = $(`[data-v="${k}"]`, root), lim = L.LIMITS[k];
    rangeFill(input);
    input.oninput = () => {
      s[k] = Number(input.value); rangeFill(input);
      out.textContent = k === 'diameter' ? L.fmtDistance(s[k]) : k === 'roundMin' ? L.fmtDuration(s[k]) : k === 'pingMin' ? `${s[k]} min` : s[k] ? `${s[k]} min` : 'None';
      if (k === 'diameter') { drawCircle(); }
      if (Number(input.value) === lim.min || Number(input.value) === lim.max) haptic(6);
    };
    if (k === 'diameter') input.onchange = fit;
  }
  $('[data-shrink]', root).onclick = (e) => { s.shrink = !s.shrink; e.currentTarget.setAttribute('aria-checked', s.shrink); };
  $('[data-create]', root).onclick = async (e) => {
    const err = $('[data-err]', root);
    if (s.pingMin >= s.roundMin) { err.textContent = 'Pings need to happen more often than once per round.'; return; }
    const btn = e.currentTarget; btn.classList.add('loading');
    const c = map.getCenter();
    try {
      const code = await api.createGame({ lat: c.lat, lng: c.lng, radius: s.diameter / 2, roundMin: s.roundMin, pingMin: s.pingMin, headMin: s.headMin, shrink: s.shrink });
      app.store.set('hostPrefs', { diameter: s.diameter, roundMin: s.roundMin, pingMin: s.pingMin, headMin: s.headMin, shrink: s.shrink });
      app.store.set('lastCenter', { lat: c.lat, lng: c.lng });
      if (app.isDemo) app.demo.hostFlow(code); else app.store.set('activeGame', code);
      haptic([20, 40, 20]);
      app.go('lobby', { code }, { replace: true });
    } catch (ex) { err.textContent = errText(ex); btn.classList.remove('loading'); }
  };
  return () => map.remove();
}

function slider(key, label, val, lim, fmt, lo, hi) {
  return `<div class="slider">
    <div class="slider-head"><label for="s-${key}">${label}</label><span class="val mono" data-v="${key}">${fmt(val)}</span></div>
    <input type="range" id="s-${key}" min="${lim.min}" max="${lim.max}" step="${lim.step}" value="${val}">
    <div class="slider-scale"><span>${lo}</span><span>${hi}</span></div></div>`;
}

// ---------------- Join (six boxes) ----------------
export function join(root, app, params) {
  const api = app.api();
  const pre = (params.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  root.innerHTML = `${topbar('Join a game')}
    <div class="stack-24 grow">
      <div class="stack-8"><h1>Got a code?</h1><p class="dim">Six characters. No O, 0, I or 1, so no squinting.</p></div>
      ${params.demoCode ? `<div class="card row">${icon('bot')}<div class="grow small"><b>Juno Vale (bot)</b> <span class="dim">texted you:</span><br><span class="mono" style="font-size:20px;letter-spacing:.12em;color:var(--accent)" data-demo-code>${esc(params.demoCode)}</span></div></div>` : ''}
      <div class="code-boxes" data-boxes>${Array.from({ length: 6 }, (_, i) => `<input inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="1" aria-label="Character ${i + 1}" value="${esc(pre[i] || '')}" class="${pre[i] ? 'filled' : ''}">`).join('')}</div>
      <p class="hint" data-msg>&nbsp;</p>
      <div class="grow"></div>
      <button class="btn btn-primary" data-join disabled>${icon('log-in')}<span>Join</span></button>
    </div>`;
  $('[data-back]', root).onclick = () => { if (app.isDemo) app.endDemo(); app.back(); };
  const boxes = $$('.code-boxes input', root), wrap = $('[data-boxes]', root), msg = $('[data-msg]', root), go = $('[data-join]', root);
  const value = () => boxes.map((b) => b.value).join('');
  const shake = (text) => {
    wrap.classList.remove('shake'); void wrap.offsetWidth; wrap.classList.add('shake');
    haptic([30, 50, 30]);
    if (text) { msg.className = 'hint err'; msg.textContent = text; }
    setTimeout(() => wrap.classList.remove('shake'), 450);
  };
  const update = () => {
    go.disabled = !L.CODE_RE.test(value());
    if (L.CODE_RE.test(value())) submit();
  };
  const fillFrom = (i, text) => {
    const chars = [...String(text).toUpperCase()].map(L.cleanCodeChar).filter(Boolean);
    for (const ch of chars) { if (i > 5) break; boxes[i].value = ch; boxes[i].classList.remove('filled'); void boxes[i].offsetWidth; boxes[i].classList.add('filled'); i++; }
    boxes[Math.min(i, 5)].focus();
    update();
  };
  boxes.forEach((b, i) => {
    b.addEventListener('focus', () => b.select());
    b.addEventListener('input', () => {
      const raw = b.value; b.value = '';
      if (!raw) { b.classList.remove('filled'); update(); return; }
      const ok = [...raw.toUpperCase()].some((c) => L.cleanCodeChar(c));
      if (!ok) { shake(/[O0I1]/i.test(raw) ? 'No O, 0, I or 1 in codes. Try the letter next to it?' : 'Letters and numbers only.'); return; }
      msg.className = 'hint'; msg.innerHTML = '&nbsp;';
      fillFrom(i, raw);
    });
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !b.value && i > 0) { boxes[i - 1].value = ''; boxes[i - 1].classList.remove('filled'); boxes[i - 1].focus(); e.preventDefault(); update(); }
      if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus();
      if (e.key === 'ArrowRight' && i < 5) boxes[i + 1].focus();
    });
    b.addEventListener('paste', (e) => { e.preventDefault(); fillFrom(0, e.clipboardData.getData('text')); });
  });
  let busy = false;
  const submit = async () => {
    if (busy) return;
    const code = value();
    busy = true; go.classList.add('loading');
    msg.className = 'hint'; msg.textContent = 'Looking for that game…';
    try {
      const peek = await api.peekGame(code);
      if (!peek) { shake('No game with that code. Typo?'); return; }
      if (peek.status !== 'lobby') { shake('That game already started. Next round!'); return; }
      await api.joinGame(code);
      if (!app.isDemo) app.store.set('activeGame', code);
      haptic([20, 40, 20]);
      app.go('lobby', { code }, { replace: true });
    } catch (e) { shake(errText(e)); }
    finally { busy = false; go.classList.remove('loading'); }
  };
  go.onclick = submit;
  if (pre.length === 6) setTimeout(update, 200);
  else setTimeout(() => boxes[Math.min(pre.length, 5)].focus(), 350);
}

// ---------------- Report / block / kick sheet (lobby, game, radio) ----------------
export async function playerSheet(app, player, { code, isHost = false, inLobby = false, message = null } = {}) {
  const api = app.api();
  const me = api.uid ?? app.profile?.id;
  const actions = [];
  if (player.user_id === me) return;
  if (isHost && inLobby) actions.push({ label: 'Remove from lobby', icon: 'user-x', kind: 'btn-secondary', value: 'kick' });
  actions.push({ label: 'Report', icon: 'flag', kind: 'btn-secondary', value: 'report' });
  actions.push({ label: 'Block', icon: 'ban', kind: 'btn-danger', value: 'block' });
  const v = await sheet({
    title: player.name,
    lead: `@${player.username}${message ? ` · “${message.length > 60 ? message.slice(0, 60) + '…' : message}”` : ''}`,
    actions,
  });
  if (v === 'kick') {
    if (!(await confirmSheet(`Remove ${player.name}?`, 'They’ll be booted and can’t rejoin this game.', 'Remove', { danger: true }))) return;
    try { await api.kick(code, player.user_id); toast(`${player.name} is out of the lobby.`, 'good'); } catch (e) { toast(errText(e), 'danger'); }
  }
  if (v === 'report') {
    const reason = await sheet({
      title: `Report ${player.name}`, lead: 'What’s going on? This goes to whoever runs your GHOSTLINE.',
      actions: ['Cheating', 'Harassment or bullying', 'Offensive name or message', 'Something else'].map((r) => ({ label: r, value: r })),
    });
    if (!reason) return;
    try { await api.report({ reported: player.user_id, gameCode: code, reason, message }); toast('Reported. Thanks for keeping it fun.', 'good'); }
    catch (e) { toast(errText(e), 'danger'); }
  }
  if (v === 'block') {
    if (!(await confirmSheet(`Block ${player.name}?`, 'You won’t see their Radio messages, and they can’t join games you host. Unblock anytime in Settings.', 'Block', { danger: true }))) return;
    try {
      await api.block(player);
      app.blocked?.add(player.user_id);
      toast(`${player.name} is blocked.`, 'good');
      if (isHost && inLobby) await api.kick(code, player.user_id).catch(() => {});
    } catch (e) { toast(errText(e), 'danger'); }
  }
}

// ---------------- Lobby ----------------
export function lobby(root, app, params) {
  const api = app.api();
  const code = params.code;
  const myId = api.uid ?? app.profile?.id;
  let st = null, leaving = false, gotBooted = false;
  app.blocked = app.blocked || new Set();
  api.listBlocks?.().then((l) => l.forEach((b) => app.blocked.add(b.blocked))).catch(() => {});

  root.innerHTML = `${topbar('Lobby', `<button class="icon-btn" data-help aria-label="How to play">${icon('circle-help')}</button>`)}
    <div class="stack-16" data-body>
      <div class="card code-card"><div class="skel line" style="width:50%;margin:0 auto"></div><div class="skel" style="height:44px;margin:14px 0"></div></div>
      <div class="pick-grid"><div class="skel" style="height:104px"></div><div class="skel" style="height:104px"></div><div class="skel" style="height:104px"></div></div>
      <div class="skel" style="height:140px"></div>
    </div>`;
  $('[data-help]', root).onclick = () => app.go('howto');
  const leave = async () => {
    const isHost = st?.game?.host_id === myId;
    if (!(await confirmSheet(isHost ? 'Close the lobby?' : 'Leave the lobby?', isHost ? 'Everyone gets sent home. The code stops working.' : 'You can rejoin with the code while it’s still in the lobby.', isHost ? 'Close lobby' : 'Leave', { danger: true }))) return false;
    leaving = true;
    await api.leave(code).catch(() => {});
    app.store.set('activeGame', null);
    if (app.isDemo) app.endDemo();
    app.go('home', {}, { reset: true });
    return false;
  };
  $('[data-back]', root).onclick = leave;
  app.backGuard = () => { leave(); return false; };

  const render = (s) => {
    st = s;
    const g = s.game;
    if (leaving) return;
    if (!g || !s.players.some((p) => p.user_id === myId)) {
      if (gotBooted) return;
      gotBooted = true;
      app.store.set('activeGame', null);
      sheet({ title: g ? 'You got booted.' : 'Lobby closed.', lead: g ? 'The host removed you from this game. Rude, but legal.' : 'The host closed this lobby. Maybe start your own?', actions: [{ label: 'Back home', kind: 'btn-primary' }], dismissable: false })
        .then(() => { if (app.isDemo) app.endDemo(); app.go('home', {}, { reset: true }); });
      return;
    }
    if (g.status !== 'lobby') { app.go('game', { code }, { replace: true }); return; }
    const me = s.players.find((p) => p.user_id === myId);
    const isHost = g.host_id === myId;
    setRole(me.pick === 'hunter' ? 'hunter' : 'runner');
    const chk = L.teamCheck(s.players);
    const groups = { hunter: [], runner: [], random: [] };
    for (const p of s.players) groups[p.pick].push(p);
    const person = (p) => `<button class="person ${p.user_id === myId ? 'me' : ''}" data-player="${esc(p.user_id)}" aria-label="${esc(p.name)}${p.ready ? ', ready' : ''}">
        <span class="avatar ${p.pick}">${esc(p.initials)}${p.ready ? `<span class="badge">${icon('check')}</span>` : ''}</span>
        <span class="nm">${p.user_id === g.host_id ? '★ ' : ''}${esc(p.user_id === myId ? 'You' : p.name)}</span></button>`;
    const col = (key, title, ic, color) => `<div class="team-col">
        <div class="team-head"><h3 style="color:${color}">${icon(ic)} ${title}</h3><span class="count dim mono">${groups[key].length}</span></div>
        <div class="roster">${groups[key].length ? groups[key].map(person).join('') : '<span class="empty">Nobody yet.</span>'}</div></div>`;
    const range = L.hunterRange(chk.n);
    const rangeTxt = chk.n < L.MIN_PLAYERS ? `Need ${L.MIN_PLAYERS}+ players to start` : `${chk.n} players → ${range.min === range.max ? range.min : `${range.min}–${range.max}`} hunter${range.max === 1 ? '' : 's'} allowed`;
    const body = $('[data-body]', root);
    body.innerHTML = `
      <div class="card code-card">
        <div class="dim small">Game code</div>
        <div class="code mono" data-code>${esc(code)}</div>
        <div class="row" style="justify-content:center">
          <button class="btn btn-secondary compact accent" data-share>${icon('share')}<span>Share</span></button>
          <button class="btn btn-secondary compact" data-copy>${icon('copy')}<span>Copy</span></button>
        </div>
        <p class="hint" style="margin-top:12px">${esc(L.fmtDistance(g.zone_radius * 2))} zone · ${esc(L.fmtDuration(g.round_min))} · ping every ${g.ping_min} min · ${g.head_min ? `${g.head_min} min head start` : 'no head start'}${g.shrink ? ' · shrinking' : ''}</p>
      </div>
      <div class="stack-8"><p class="section-label">Pick your side</p>
        <div class="pick-grid">
          <button class="pick hunter" aria-pressed="${me.pick === 'hunter'}" data-pick="hunter">${icon('crosshair')}<b>Hunter</b><small>You’re it</small></button>
          <button class="pick runner" aria-pressed="${me.pick === 'runner'}" data-pick="runner">${icon('footprints')}<b>Runner</b><small>Hide &amp; run</small></button>
          <button class="pick random" aria-pressed="${me.pick === 'random'}" data-pick="random">${icon('shuffle')}<b>Random</b><small>Fill the gap</small></button>
        </div></div>
      <div class="card stack-8">
        <div class="row between"><b>Team balance</b><span class="chip ${chk.teamsOk ? 'zone' : 'warn'}">${chk.teamsOk ? icon('check') : icon('circle-alert')} ${chk.teamsOk ? 'Teams work' : 'Not yet'}</span></div>
        <p class="small dim" data-range>${esc(rangeTxt)}. ${chk.randoms ? `${chk.randoms} on Random fill whichever side is short.` : ''}</p>
        ${chk.n >= L.MIN_PLAYERS ? `<div class="balance"><span class="small mono" style="color:var(--hunter)">${chk.fixedH}${chk.randoms ? `–${chk.fixedH + chk.randoms}` : ''}</span>
          <div class="meter"><span class="ok" style="left:${(range.min / chk.n) * 100}%;width:${((range.max - range.min + 1) / chk.n) * 100}%"></span><span class="cur" style="left:${((chk.fixedH + .5) / chk.n) * 100}%"></span></div>
          <span class="small dim">hunters</span></div>` : ''}
        <p class="hint">Rules: at least 1 hunter per 10 players, never more hunters than runners.</p>
      </div>
      <div class="card stack-16">${col('hunter', 'Hunters', 'crosshair', 'var(--hunter)')}${col('runner', 'Runners', 'footprints', 'var(--runner)')}${col('random', 'Random', 'shuffle', 'var(--zone)')}</div>
      ${app.isDemo ? `<div class="card stack-8"><div class="row">${icon('flask-conical')}<b>Demo controls</b></div>
        <p class="small dim">Make the bots pick sides to test the balance rules.</p>
        <div class="seg">${['mix', 'hunter', 'runner', 'random'].map((m) => `<button aria-pressed="${app.demo.pickMode === m}" data-botpick="${m}">${m === 'mix' ? 'Mix' : m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div></div>` : ''}
      <div class="sticky-foot">
        <p class="hint center" data-reason>${esc(isHost ? chk.reason : chk.teamsOk && !chk.notReady.length ? 'Waiting for the host to start.' : chk.reason)}</p>
        <div class="row">
          <button class="btn ${me.ready ? 'btn-secondary accent' : 'btn-primary'}" data-ready>${me.ready ? `${icon('check')}<span>Ready</span>` : '<span>Tap when ready</span>'}</button>
          ${isHost ? `<button class="btn btn-zone" data-start ${chk.ok ? '' : 'disabled'}>${icon('play')}<span>Start</span></button>` : ''}
        </div>
      </div>`;
    $('[data-share]', root).onclick = async () => {
      const url = `${location.origin}/?join=${code}`;
      const text = `Join my GHOSTLINE game. Code: ${code}`;
      try {
        if (navigator.share && !app.isDemo) await navigator.share({ title: 'GHOSTLINE', text, url });
        else if (navigator.share) await navigator.share({ title: 'GHOSTLINE demo', text: `Demo code: ${code}` });
        else { await navigator.clipboard.writeText(`${text} ${url}`); toast('Invite copied. Paste it in your group chat.', 'good'); }
      } catch { /* cancelled */ }
    };
    $('[data-copy]', root).onclick = async () => { try { await navigator.clipboard.writeText(code); toast('Code copied.', 'good'); } catch { toast(code); } };
    $$('[data-pick]', root).forEach((b) => (b.onclick = () => { haptic(10); api.setPick(code, b.dataset.pick).catch((e) => toast(errText(e), 'danger')); }));
    $('[data-ready]', root).onclick = () => api.setReady(code, !me.ready).catch((e) => toast(errText(e), 'danger'));
    $('[data-start]', root)?.addEventListener('click', async (e) => {
      e.currentTarget.classList.add('loading');
      try { await api.startGame(code); haptic([30, 50, 30, 50, 60]); } catch (ex) { toast(errText(ex), 'danger'); e.currentTarget?.classList.remove('loading'); }
    });
    $$('[data-player]', root).forEach((b) => (b.onclick = () => {
      const p = s.players.find((x) => x.user_id === b.dataset.player);
      if (p && p.user_id !== myId) playerSheet(app, p, { code, isHost, inLobby: true });
    }));
    $$('[data-botpick]', root).forEach((b) => (b.onclick = () => { app.demo.setPickMode(b.dataset.botpick); render(st); }));
  };

  let prevPlayers = new Set();
  const unwatch = api.watch(code, (s, err) => {
    if (err) { if (!st) $('[data-body]', root).innerHTML = `<div class="card err-card">${icon('wifi-off')}<div><b>Can’t reach the game.</b><p class="dim small">${esc(errText(err))} Retrying…</p></div></div>`; return; }
    if (s.game?.host_id === myId && st) {
      const now = new Set(s.players.map((p) => p.user_id));
      for (const p of s.players) if (!prevPlayers.has(p.user_id) && p.user_id !== myId) banner(`${p.name} joined.`, { kind: 'good', icon: 'users', ms: 2200 });
      prevPlayers = now;
    } else if (s.players) prevPlayers = new Set(s.players.map((p) => p.user_id));
    render(s);
  });
  return () => unwatch();
}
