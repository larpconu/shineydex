// Live backend: Supabase (auth by emailed code, database functions, realtime).
// Settings come from /api/config (Vercel env vars) or, if you host elsewhere, public/config.js.

const CFG_KEY = 'gl.config';
let livePromise = null;

export async function loadConfig() {
  if (window.GHOSTLINE_CONFIG?.supabaseUrl) return window.GHOSTLINE_CONFIG;
  try {
    const r = await fetch('/api/config', { cache: 'no-store' });
    if (r.ok) {
      const cfg = await r.json();
      if (cfg.supabaseUrl && cfg.supabaseKey) {
        try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch { /* private mode */ }
        return cfg;
      }
    }
  } catch { /* offline → fall back to the last good config */ }
  try { return JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch { return null; }
}

function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.supabase?.createClient) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load Supabase. Offline?'));
    document.head.appendChild(s);
  });
}

// Resolves to a LiveApi, or null if the app hasn't been connected to Supabase yet.
export function getLive() {
  if (!livePromise) {
    livePromise = (async () => {
      const cfg = await loadConfig();
      if (!cfg?.supabaseUrl || !cfg?.supabaseKey) return null;
      await loadScript('/vendor/supabase.js');
      const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'gl.auth' },
      });
      return new LiveApi(sb, cfg);
    })().catch((e) => { console.warn(e); livePromise = null; return null; });
  }
  return livePromise;
}

const TIME_KEYS = new Set(['since', 'out_since', 'server_now', 'at', 'warn_at']);
function normalize(v, k = '') {
  if (Array.isArray(v)) return v.map((x) => normalize(x));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [kk, vv] of Object.entries(v)) o[kk] = normalize(vv, kk);
    return o;
  }
  if (typeof v === 'string' && (k.endsWith('_at') || TIME_KEYS.has(k))) return Date.parse(v);
  return v;
}

class LiveApi {
  constructor(sb, cfg) {
    this.mode = 'live';
    this.sb = sb;
    this.cfg = cfg;
    this.offset = 0;
    this.bestRtt = Infinity;
  }
  now() { return Date.now() + this.offset; }
  clockSample(serverNow, t0, t1) {
    const rtt = t1 - t0;
    if (rtt <= this.bestRtt * 1.5 || rtt < 400) {
      this.bestRtt = Math.min(this.bestRtt, rtt);
      this.offset = serverNow - (t0 + rtt / 2);
    }
  }
  async rpc(fn, args = {}) {
    const t0 = Date.now();
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw new Error(error.message || 'Something broke. Try again.');
    if (data && typeof data === 'object' && data.server_now) this.clockSample(Date.parse(data.server_now), t0, Date.now());
    return data;
  }

  // ---------- auth ----------
  async user() { return (await this.sb.auth.getSession()).data.session?.user ?? null; }
  async sendCode(email) {
    const { error } = await this.sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) throw new Error(/rate/i.test(error.message) ? 'Too many codes sent. Wait a bit and try again.' : error.message);
  }
  async verifyCode(email, token) {
    const { data, error } = await this.sb.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw new Error(/expired|invalid/i.test(error.message) ? 'That code didn’t work. Check it or send a new one.' : error.message);
    return data.user;
  }
  async signOut() { await this.sb.auth.signOut(); }
  async profile() {
    const u = await this.user();
    if (!u) return null;
    const { data, error } = await this.sb.from('profiles').select('id,name,username').eq('id', u.id).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }
  async saveProfile(name, username) {
    const u = await this.user();
    const { error } = await this.sb.from('profiles').upsert({ id: u.id, name: name.trim(), username });
    if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'That username is taken.' : error.message);
    return { id: u.id, name: name.trim(), username };
  }
  usernameAvailable(u) { return this.rpc('username_available', { p_username: u }); }
  async deleteAccount() { await this.rpc('delete_account'); await this.sb.auth.signOut(); }

  // ---------- safety ----------
  async listBlocks() {
    const { data, error } = await this.sb.from('blocks').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  }
  async block(user) {
    const me = await this.user();
    const { error } = await this.sb.from('blocks').upsert({ blocker: me.id, blocked: user.user_id, blocked_name: user.name, blocked_username: user.username });
    if (error) throw new Error(error.message);
  }
  async unblock(userId) {
    const { error } = await this.sb.from('blocks').delete().eq('blocked', userId);
    if (error) throw new Error(error.message);
  }
  async report({ reported, gameCode, reason, message }) {
    const me = await this.user();
    const { error } = await this.sb.from('reports').insert({ reporter: me.id, reported, game_code: gameCode, reason, message: message?.slice(0, 300) ?? null });
    if (error) throw new Error(error.message);
  }
  async savePushSubscription(sub) {
    const j = sub.toJSON();
    await this.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
  }

  // ---------- game ----------
  createGame(o) {
    return this.rpc('create_game', { p_lat: o.lat, p_lng: o.lng, p_radius: o.radius, p_round_min: o.roundMin, p_ping_min: o.pingMin, p_head_min: o.headMin, p_shrink: o.shrink });
  }
  peekGame(code) { return this.rpc('peek_game', { p_code: code }); }
  joinGame(code) { return this.rpc('join_game', { p_code: code }); }
  setPick(code, pick) { return this.rpc('set_pick', { p_code: code, p_pick: pick }); }
  setReady(code, ready) { return this.rpc('set_ready', { p_code: code, p_ready: ready }); }
  kick(code, user) { return this.rpc('kick_player', { p_code: code, p_user: user }); }
  startGame(code) { return this.rpc('start_game', { p_code: code }); }
  leave(code) { return this.rpc('leave_game', { p_code: code }); }
  endGame(code) { return this.rpc('end_game', { p_code: code }); }
  async sendLocation(code, lat, lng, acc) {
    const r = await this.rpc('send_location', { p_code: code, p_lat: lat, p_lng: lng, p_acc: acc ?? null });
    return normalize(r);
  }
  sendRadio(code, body) { return this.rpc('send_radio', { p_code: code, p_body: body }); }
  requestTag(code, runner) { return this.rpc('request_tag', { p_code: code, p_runner: runner }); }
  confirmTag(code, hunter) { return this.rpc('confirm_tag', { p_code: code, p_hunter: hunter }); }
  denyTag(code, hunter) { return this.rpc('deny_tag', { p_code: code, p_hunter: hunter }); }

  // Live game state: realtime nudges + a slow poll as a safety net. Each refresh runs
  // game_state() with *your* permissions, so the database decides what you get to see.
  watch(code, cb) {
    let stopped = false, timer = null, inflight = false, again = false;
    const refresh = async () => {
      if (stopped) return;
      if (inflight) { again = true; return; }
      inflight = true;
      try {
        const t0 = Date.now();
        const { data, error } = await this.sb.rpc('game_state', { p_code: code });
        if (error) throw error;
        this.clockSample(Date.parse(data.server_now), t0, Date.now());
        if (!stopped) cb(normalize(data));
      } catch (e) {
        if (!stopped) cb(null, e);
      } finally {
        inflight = false;
        if (again) { again = false; refresh(); }
      }
    };
    let debounce;
    const nudge = () => { clearTimeout(debounce); debounce = setTimeout(refresh, 150); };
    const ch = this.sb.channel(`game:${code}:${Math.random().toString(36).slice(2, 7)}`);
    for (const t of ['games', 'game_players', 'locations', 'reveals', 'pings', 'radio', 'events']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `${t === 'games' ? 'code' : 'game_code'}=eq.${code}` }, nudge);
    }
    ch.subscribe();
    const poll = () => { if (document.visibilityState === 'visible') refresh(); timer = setTimeout(poll, 4000); };
    const onVis = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVis);
    refresh();
    timer = setTimeout(poll, 4000);
    return () => {
      stopped = true; clearTimeout(timer); clearTimeout(debounce);
      document.removeEventListener('visibilitychange', onVis);
      this.sb.removeChannel(ch);
    };
  }
}
