// Onboarding, home, sign-in, profile, settings and the reading screens.
import { $, $$, esc, icon, sheet, confirmSheet, toast, errText, isIOS, isStandalone, haptic } from './ui.js';
import { ONBOARDING, TAGLINES, howToPlay, privacy, troubleshooting } from './content.js';
import { getFix } from './geo.js';
import { pushStatus, enablePush } from './push.js';
import { getLive } from './backend-supabase.js';
import { USERNAME_RE } from './logic.js';

const topbar = (title, { back = true, right = '' } = {}) => `
  <div class="topbar">
    ${back ? `<button class="icon-btn" data-back aria-label="Back">${icon('chevron-left')}</button>` : ''}
    <h2>${esc(title)}</h2>${right}
  </div>`;
const wireBack = (root, app) => $$('[data-back]', root).forEach((b) => (b.onclick = () => app.back()));

// ---------------- Onboarding ----------------
export function onboarding(root, app, params) {
  let i = 0;
  const draw = () => {
    const s = ONBOARDING[i];
    const last = i === ONBOARDING.length - 1;
    root.className = 'screen onboard';
    root.innerHTML = `
      <div class="row between" style="min-height:48px">
        <img src="/icons/wordmark.svg" alt="GHOSTLINE" style="height:18px">
        ${last ? '' : '<button class="link-btn" data-skip>Skip</button>'}
      </div>
      <div class="slide" key="${i}">
        <div class="art">${icon(s.icon)}</div>
        <h1>${esc(s.title)}</h1>
        <p class="lead">${esc(s.lead)}</p>
        ${s.tips ? `<div class="tips">${s.tips.map(([ic, t]) => `<div class="tip">${icon(ic)}<span>${esc(t)}</span></div>`).join('')}</div>` : ''}
        ${s.perms ? `<div class="stack">
          <button class="btn btn-secondary accent" data-loc>${icon('locate-fixed')}<span>Allow precise location</span></button>
          <p class="hint" data-loc-hint>On iPhone, choose <b>Allow While Using App</b> and keep <b>Precise</b> on.</p>
          <button class="btn btn-secondary accent" data-push>${icon('bell')}<span>Turn on alerts</span></button>
          <p class="hint" data-push-hint></p>
        </div>` : ''}
      </div>
      <div>
        <div class="dots">${ONBOARDING.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
        <button class="btn btn-primary" data-next>${last ? 'Let’s play' : 'Next'}</button>
      </div>`;
    $('[data-next]', root).onclick = () => { if (last) finish(); else { i++; draw(); } };
    $('[data-skip]', root)?.addEventListener('click', finish);
    if (s.perms) {
      const pushHint = $('[data-push-hint]', root);
      const st = pushStatus();
      if (st === 'needs-install') pushHint.innerHTML = 'Alerts on iPhone need the Home Screen app: Safari → Share → <b>Add to Home Screen</b>. You can turn them on later in Settings.';
      if (st === 'granted') { $('[data-push]', root).innerHTML = `${icon('check')}<span>Alerts are on</span>`; }
      $('[data-loc]', root).onclick = async (e) => {
        const b = e.currentTarget; b.classList.add('loading');
        try { await getFix(); b.innerHTML = `${icon('check')}<span>Location: good to go</span>`; haptic(20); }
        catch (err) { $('[data-loc-hint]', root).innerHTML = `<span class="err">${esc(err.message)}</span> <a href="#" data-help style="text-decoration:underline">Location help</a>`; $('[data-help]', root).onclick = (ev) => { ev.preventDefault(); app.go('help', { anchor: 'loc-help' }); }; }
        b.classList.remove('loading');
      };
      $('[data-push]', root).onclick = async (e) => {
        const b = e.currentTarget;
        const live = await getLive();
        if (!live) { pushHint.textContent = 'Alerts switch on once you’ve signed in. Settings → Alerts.'; return; }
        if (!(await live.user())) { pushHint.textContent = 'Sign in first, then turn alerts on in Settings.'; return; }
        try { await enablePush(live); b.innerHTML = `${icon('check')}<span>Alerts are on</span>`; } catch (err) { pushHint.textContent = err.message; }
      };
    }
  };
  const finish = () => {
    app.store.set('onboarded', true);
    const code = params.joinCode || app.store.get('pendingJoin');
    if (code) { app.store.set('pendingJoin', null); app.go('join', { code }, { reset: true }); } else app.go('home', {}, { reset: true });
  };
  draw();
}

// ---------------- Home ----------------
export function home(root, app) {
  root.classList.add('home');
  const blips = Array.from({ length: 5 }, (_, k) => `<i class="blip" style="left:${18 + Math.random() * 64}%;top:${14 + Math.random() * 44}%;animation-delay:${(k * 1.2 + Math.random()).toFixed(2)}s"></i>`).join('');
  const showInstall = !isStandalone();
  root.innerHTML = `
    <div class="radar-bg" aria-hidden="true"><div class="rings"></div><div class="sweep"></div>${blips}</div>
    <button class="icon-btn gear" data-settings aria-label="Settings">${icon('settings')}</button>
    <div class="hero">
      <img class="mark" src="/icons/mark.svg" alt="">
      <img class="wordmark" src="/icons/wordmark.svg" alt="GHOSTLINE">
      <p class="tagline">${esc(TAGLINES[Math.floor(Math.random() * TAGLINES.length)])}</p>
    </div>
    <div class="actions">
      ${showInstall ? `<div class="card install-card">${icon('download')}<div class="small"><b>Install it for real.</b> <span class="dim">${isIOS()
        ? 'In Safari tap Share → <b>Add to Home Screen</b>. You need the installed app for alerts and full screen.'
        : 'Open your browser menu → <b>Install app</b> for full screen and alerts.'}</span></div></div>` : ''}
      <button class="btn btn-primary tall" data-host>${icon('radar')}<span>Host a game<span class="sub">Drop a zone, share a code</span></span></button>
      <button class="btn btn-secondary tall" data-join>${icon('log-in')}<span>Join a game<span class="sub">Got a code? Get in</span></span></button>
      <button class="btn btn-secondary tall" data-demo>${icon('bot')}<span>Try a demo round<span class="sub">Solo vs. bots, no account needed</span></span></button>
      <button class="link-btn" data-howto style="align-self:center">${icon('circle-help')} How to play</button>
    </div>`;
  $('[data-settings]', root).onclick = () => app.go('settings');
  $('[data-howto]', root).onclick = () => app.go('howto');
  $('[data-demo]', root).onclick = () => app.go('demo');
  $('[data-host]', root).onclick = async () => { app.endDemo(); if (await app.requireAccount({ name: 'host' })) app.go('host'); };
  $('[data-join]', root).onclick = async () => { app.endDemo(); if (await app.requireAccount({ name: 'join' })) app.go('join'); };
}

// ---------------- Sign in (emailed one-time code) ----------------
export function signin(root, app, params) {
  let email = app.store.get('lastEmail', '');
  const stepEmail = () => {
    root.innerHTML = `${topbar('Sign in')}
      <div class="stack-24 grow">
        <div class="stack-8"><h1>Who goes there?</h1><p class="dim">We’ll email you a one-time code. No passwords, and other players never see your email.</p></div>
        <form class="stack-16" data-form>
          <div class="field"><label for="em">Email</label>
            <input class="input" id="em" type="email" inputmode="email" autocomplete="email" autocapitalize="off" placeholder="you@example.com" value="${esc(email)}" required></div>
          <p class="hint err" data-err></p>
          <button class="btn btn-primary" type="submit">${icon('mail')}<span>Email me a code</span></button>
        </form>
        <p class="hint">New here? Same thing. We’ll make your account when you sign in.</p>
      </div>`;
    wireBack(root, app);
    const input = $('#em', root);
    setTimeout(() => input.focus(), 300);
    $('[data-form]', root).onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', root);
      email = input.value.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) { $('[data-err]', root).textContent = 'That doesn’t look like an email.'; return; }
      btn.classList.add('loading');
      try { await app.live.sendCode(email); app.store.set('lastEmail', email); stepCode(); }
      catch (err) { $('[data-err]', root).textContent = errText(err); }
      btn.classList.remove('loading');
    };
  };
  const stepCode = () => {
    root.innerHTML = `${topbar('Check your email')}
      <div class="stack-24 grow">
        <div class="stack-8"><h1>Code, please.</h1><p class="dim">We sent a code to <b style="color:var(--text)">${esc(email)}</b>. It works once and expires soon.</p></div>
        <form class="stack-16" data-form>
          <input class="input mono" id="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="10" placeholder="••••••" aria-label="Code">
          <p class="hint err" data-err></p>
          <button class="btn btn-primary" type="submit">Let me in</button>
        </form>
        <div class="row between"><button class="link-btn" data-resend>${icon('refresh-cw')} Send a new code</button><button class="link-btn" data-change>Wrong email?</button></div>
      </div>`;
    $('[data-back]', root).onclick = stepEmail;
    $('[data-change]', root).onclick = stepEmail;
    const input = $('#otp', root);
    setTimeout(() => input.focus(), 300);
    $('[data-resend]', root).onclick = async () => { try { await app.live.sendCode(email); toast('Fresh code sent.', 'good'); } catch (err) { toast(errText(err), 'danger'); } };
    const submit = async () => {
      const code = input.value.replace(/\D/g, '');
      if (code.length < 6) { $('[data-err]', root).textContent = 'Codes are at least 6 digits.'; return; }
      const btn = $('button[type=submit]', root); btn.classList.add('loading');
      try {
        await app.live.verifyCode(email, code);
        app.profile = await app.live.profile();
        haptic(20);
        const next = params.next || { name: 'home' };
        if (!app.profile) app.go('profile', { next }, { replace: true });
        else app.go(next.name, next.params || {}, { replace: true });
      } catch (err) { $('[data-err]', root).textContent = errText(err); btn.classList.remove('loading'); }
    };
    $('[data-form]', root).onsubmit = (e) => { e.preventDefault(); submit(); };
    input.oninput = () => { if (input.value.replace(/\D/g, '').length >= 6 && input.value.length >= (input.maxLength > 6 ? 6 : 6)) { /* let them finish */ } };
  };
  stepEmail();
}

// ---------------- Profile setup / edit ----------------
function profileForm(root, app, { initial, onSaved, title, heading, sub, button }) {
  root.innerHTML = `${topbar(title)}
    <form class="stack-24 grow" data-form>
      <div class="stack-8"><h1>${heading}</h1><p class="dim">${sub}</p></div>
      <div class="field"><label for="nm">Display name</label>
        <input class="input" id="nm" maxlength="24" autocomplete="nickname" placeholder="Ghost Malone" value="${esc(initial?.name || '')}"></div>
      <div class="field"><label for="un">Username</label>
        <div class="input-wrap"><span class="prefix">@</span>
          <input class="input" id="un" maxlength="20" autocapitalize="off" autocomplete="username" spellcheck="false" placeholder="ghostmalone" value="${esc(initial?.username || '')}">
          <span class="status" data-st></span></div>
        <p class="hint" data-uh>3–20 characters: a–z, 0–9 and _. Must be unique.</p></div>
      <p class="hint err" data-err></p>
      <div class="grow"></div>
      <button class="btn btn-primary" type="submit">${button}</button>
    </form>`;
  wireBack(root, app);
  const nm = $('#nm', root), un = $('#un', root), st = $('[data-st]', root), uh = $('[data-uh]', root);
  let ok = !!initial?.username, timer;
  un.oninput = () => {
    un.value = un.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    ok = false; st.innerHTML = ''; clearTimeout(timer);
    if (!USERNAME_RE.test(un.value)) { uh.className = 'hint'; uh.textContent = '3–20 characters: a–z, 0–9 and _.'; return; }
    timer = setTimeout(async () => {
      try {
        ok = await app.live.usernameAvailable(un.value);
        st.innerHTML = ok ? `<span style="color:var(--runner)">${icon('circle-check')}</span>` : `<span style="color:var(--danger)">${icon('circle-x')}</span>`;
        uh.className = ok ? 'hint ok' : 'hint err';
        uh.textContent = ok ? 'All yours.' : 'Taken. Try another.';
      } catch { /* offline */ }
    }, 350);
  };
  if (!initial) setTimeout(() => nm.focus(), 300);
  $('[data-form]', root).onsubmit = async (e) => {
    e.preventDefault();
    const err = $('[data-err]', root);
    if (!nm.value.trim()) { err.textContent = 'You need a name. Even ghosts have names.'; return; }
    if (!USERNAME_RE.test(un.value)) { err.textContent = 'Username needs 3–20 characters: a–z, 0–9 and _.'; return; }
    const btn = $('button[type=submit]', root); btn.classList.add('loading');
    try { app.profile = await app.live.saveProfile(nm.value, un.value); haptic(20); onSaved(); }
    catch (ex) { err.textContent = errText(ex); btn.classList.remove('loading'); }
  };
}

export function profileSetup(root, app, params) {
  profileForm(root, app, {
    title: 'Your profile', heading: 'Pick your alias.', sub: 'This is what other players see. You can change it later.', button: 'Save and continue',
    onSaved: () => { const next = params.next || { name: 'home' }; app.go(next.name, next.params || {}, { replace: true }); },
  });
}

// ---------------- Settings ----------------
export function settings(root, app) {
  const draw = async () => {
    const live = app.live || await getLive();
    app.live = live;
    const user = live ? await live.user().catch(() => null) : null;
    if (user && !app.profile) app.profile = await live.profile().catch(() => null);
    const p = app.profile;
    const ps = pushStatus();
    const pushLabel = { granted: 'On', denied: 'Blocked in system settings', default: 'Off', 'needs-install': 'Needs the Home Screen app', unsupported: 'Not supported here' }[ps];
    root.innerHTML = `${topbar('Settings')}
      <div class="stack-16">
        ${!live ? `<div class="card stack-8"><b>Demo-only mode</b><p class="dim small">This copy isn’t connected to a database yet. Accounts and real games switch on after setup (see DEPLOY.md).</p></div>`
        : !user ? `<div class="card stack-16"><div class="stack-8"><b>Not signed in</b><p class="dim small">Sign in to host, join, and keep your account on a new phone.</p></div><button class="btn btn-primary" data-signin>Sign in</button></div>`
        : `<div class="card row">
            <div class="avatar runner">${esc((p?.name || '?').slice(0, 2).toUpperCase())}</div>
            <div class="grow" style="min-width:0"><div style="font-weight:600">${esc(p?.name || 'No profile yet')}</div><div class="dim small">@${esc(p?.username || '')} · ${esc(user.email || '')}</div></div>
            <button class="icon-btn" data-edit aria-label="Edit profile">${icon('pencil')}</button>
          </div>
          <p class="hint" style="margin:-6px 4px 0">Name changes kick in from your next game.</p>`}
        ${user ? `
        <p class="section-label">Alerts</p>
        <div class="card pad-0 list">
          <div class="list-item">${icon('bell')}<div class="grow"><div class="title">Push alerts</div><div class="meta">${esc(pushLabel)}</div></div>
            ${ps === 'default' || ps === 'granted' ? `<button class="btn btn-secondary compact accent" data-push>${ps === 'granted' ? 'Re-check' : 'Turn on'}</button>` : ''}</div>
        </div>
        <p class="section-label">Safety</p>
        <div class="card pad-0 list">
          <button class="list-item" data-blocked>${icon('ban')}<div class="grow"><div class="title">Blocked players</div><div class="meta">They can’t join games you host</div></div>${icon('chevron-right')}</button>
        </div>` : ''}
        <p class="section-label">Help</p>
        <div class="card pad-0 list">
          <button class="list-item" data-howto>${icon('circle-help')}<div class="grow title">How to play</div>${icon('chevron-right')}</button>
          <button class="list-item" data-help>${icon('life-buoy')}<div class="grow title">Troubleshooting</div>${icon('chevron-right')}</button>
          <button class="list-item" data-privacy>${icon('shield')}<div class="grow title">Privacy</div>${icon('chevron-right')}</button>
          <button class="list-item" data-onboard>${icon('smartphone')}<div class="grow title">Replay the intro</div>${icon('chevron-right')}</button>
        </div>
        ${user ? `
        <p class="section-label">Account</p>
        <div class="card pad-0 list">
          <button class="list-item" data-signout>${icon('log-out')}<div class="grow title">Sign out</div></button>
          <button class="list-item danger" data-delete>${icon('trash-2')}<div class="grow title">Delete account</div></button>
        </div>` : ''}
        <p class="hint center" style="margin-top:8px">GHOSTLINE · made for friends, not for profit</p>
      </div>`;
    wireBack(root, app);
    $('[data-signin]', root)?.addEventListener('click', () => app.go('signin', { next: { name: 'settings' } }));
    $('[data-edit]', root)?.addEventListener('click', () => app.go('profileEdit'));
    $('[data-blocked]', root)?.addEventListener('click', () => app.go('blocked'));
    $('[data-howto]', root).onclick = () => app.go('howto');
    $('[data-help]', root).onclick = () => app.go('help');
    $('[data-privacy]', root).onclick = () => app.go('privacy');
    $('[data-onboard]', root).onclick = () => app.go('onboarding');
    $('[data-push]', root)?.addEventListener('click', async () => {
      try { await enablePush(live); toast('Alerts are on. Silent mode, remember?', 'good'); } catch (e) { toast(e.message, 'danger'); }
      draw();
    });
    $('[data-signout]', root)?.addEventListener('click', async () => {
      if (!(await confirmSheet('Sign out?', 'You can sign back in anytime with your email.', 'Sign out'))) return;
      await live.signOut(); app.profile = null; app.store.set('activeGame', null); draw();
    });
    $('[data-delete]', root)?.addEventListener('click', async () => {
      const ok = await sheet({
        title: 'Delete your account?',
        lead: 'This immediately erases your name, username, email and game history, and removes you from any game in progress. There’s no undo.',
        body: '<div class="field"><label for="del">Type DELETE to confirm</label><input class="input" id="del" autocapitalize="characters" autocomplete="off"></div>',
        actions: [
          { label: 'Delete forever', kind: 'btn-danger solid', value: true, handler: (sh) => { if ($('#del', sh).value.trim().toUpperCase() !== 'DELETE') { $('#del', sh).style.borderColor = 'var(--danger)'; haptic([30, 40, 30]); return false; } } },
          { label: 'Keep my account', value: false },
        ],
      });
      if (ok !== true) return;
      try { await live.deleteAccount(); app.profile = null; app.store.set('activeGame', null); toast('Account deleted. Boo-bye.', 'good'); app.go('home', {}, { reset: true }); }
      catch (e) { toast(errText(e), 'danger'); }
    });
  };
  root.innerHTML = `${topbar('Settings')}<div class="stack-16"><div class="card row"><div class="skel avatar-s"></div><div class="grow stack-8"><div class="skel line" style="width:60%"></div><div class="skel line" style="width:40%"></div></div></div><div class="skel" style="height:120px"></div></div>`;
  wireBack(root, app);
  draw();
}

export function profileEdit(root, app) {
  profileForm(root, app, {
    initial: app.profile, title: 'Edit profile', heading: 'New look?', sub: 'Changes show up from your next game. Games already running keep your old name.', button: 'Save',
    onSaved: () => { toast('Saved. Fresh alias unlocked.', 'good'); app.back(); },
  });
}

export function blockedScreen(root, app) {
  const draw = async () => {
    root.innerHTML = `${topbar('Blocked players')}<div class="stack" data-list><div class="skel" style="height:56px"></div><div class="skel" style="height:56px"></div></div>`;
    wireBack(root, app);
    let list = [];
    try { list = await app.live.listBlocks(); } catch (e) {
      $('[data-list]', root).innerHTML = `<div class="card err-card">${icon('circle-alert')}<div><b>Couldn’t load your list.</b><p class="dim small">${esc(errText(e))}</p></div></div>`; return;
    }
    $('[data-list]', root).innerHTML = list.length ? `<div class="card pad-0 list">${list.map((b) => `
      <div class="list-item"><div class="avatar">${esc((b.blocked_name || '?').slice(0, 2).toUpperCase())}</div>
        <div class="grow"><div class="title">${esc(b.blocked_name || 'Player')}</div><div class="meta">@${esc(b.blocked_username || '')}</div></div>
        <button class="btn btn-secondary compact" data-unblock="${esc(b.blocked)}">Unblock</button></div>`).join('')}</div>
      <p class="hint">Blocked players can’t join games you host, and their Radio messages are hidden from you.</p>`
      : `<div class="empty-state">${icon('ban')}<b>Nobody blocked</b><p>Your block list is empty. Wholesome.</p></div>`;
    $$('[data-unblock]', root).forEach((b) => (b.onclick = async () => {
      b.classList.add('loading');
      try { await app.live.unblock(b.dataset.unblock); toast('Unblocked.', 'good'); draw(); } catch (e) { toast(errText(e), 'danger'); b.classList.remove('loading'); }
    }));
  };
  draw();
}

export function privacyScreen(root, app) { root.innerHTML = `${topbar('Privacy')}${privacy()}`; wireBack(root, app); }
export function howtoScreen(root, app) { root.innerHTML = `${topbar('How to play')}${howToPlay()}`; wireBack(root, app); }
export function helpScreen(root, app, params) {
  root.innerHTML = `${topbar('Troubleshooting')}${troubleshooting()}`;
  wireBack(root, app);
  if (params.anchor) setTimeout(() => $('#' + params.anchor, root)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
}
