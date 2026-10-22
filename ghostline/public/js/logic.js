// Game rules shared by the UI and the demo server. The real server is supabase/schema.sql;
// keep the two in step (tests/logic.test.mjs checks the important bits).

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0, no I/1
export const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 30;
export const OUT_REVEAL_MS = 30_000;
export const SHRINK_STEPS = 4;
export const SHRINK_FACTOR = 0.75;
export const SHRINK_WARN_MS = 60_000;

export const LIMITS = {
  diameter: { min: 400, max: 3000, step: 50, def: 1000 },
  roundMin: { min: 10, max: 180, step: 5, def: 45 },
  pingMin: { min: 1, max: 30, step: 1, def: 5 },
  headMin: { min: 0, max: 15, step: 1, def: 3 },
};

export function makeCode(rand = Math.random) {
  let c = '';
  for (let i = 0; i < 6; i++) c += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return c;
}

export function cleanCodeChar(ch) {
  const c = String(ch || '').toUpperCase();
  return CODE_ALPHABET.includes(c) ? c : '';
}

// At least 1 hunter per 10 players; never more hunters than runners.
export function hunterRange(n) {
  return { min: Math.max(1, Math.ceil(n / 10)), max: Math.floor(n / 2) };
}

export function teamCheck(players) {
  const n = players.length;
  const fixedH = players.filter((p) => p.pick === 'hunter').length;
  const fixedR = players.filter((p) => p.pick === 'runner').length;
  const randoms = n - fixedH - fixedR;
  const { min, max } = hunterRange(n);
  const lo = Math.max(min, fixedH);
  const hi = Math.min(max, fixedH + randoms);
  const notReady = players.filter((p) => !p.ready);
  const res = { n, fixedH, fixedR, randoms, min, max, lo, hi, notReady, teamsOk: false, ok: false, reason: '' };
  if (n < MIN_PLAYERS) { res.reason = `Need ${MIN_PLAYERS - n} more player${MIN_PLAYERS - n === 1 ? '' : 's'}.`; return res; }
  if (lo > hi) {
    res.reason = fixedH > max ? `Too many hunters. Max ${max} for ${n} players.`
      : `Not enough hunters. Need at least ${min}.`;
    return res;
  }
  res.teamsOk = true;
  res.target = Math.min(Math.max(Math.round(n / 3), lo), hi);
  if (notReady.length) { res.reason = `Waiting on ${notReady.length} to tap Ready.`; return res; }
  res.ok = true;
  res.reason = 'Everyone’s ready. Send it.';
  return res;
}

// Random players fill whichever side is short of a ~1:2 hunter:runner split.
export function assignTeams(players, rand = Math.random) {
  const chk = teamCheck(players);
  if (!chk.teamsOk) throw new Error(chk.reason);
  const teams = new Map();
  const randoms = [];
  for (const p of players) {
    if (p.pick === 'random') randoms.push(p);
    else teams.set(p.user_id, p.pick);
  }
  for (let i = randoms.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [randoms[i], randoms[j]] = [randoms[j], randoms[i]];
  }
  randoms.forEach((p, i) => teams.set(p.user_id, i < chk.target - chk.fixedH ? 'hunter' : 'runner'));
  return teams;
}

export function distance(aLat, aLng, bLat, bLng) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function offsetPoint(lat, lng, northM, eastM) {
  return { lat: lat + northM / 111320, lng: lng + eastM / (111320 * Math.cos(lat * Math.PI / 180)) };
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] || '??').slice(0, 2).toUpperCase();
}

export function buildShrinks(zone, huntAt, roundMin, rand = Math.random) {
  const out = [];
  let { lat, lng, radius: r } = zone;
  for (let k = 1; k <= SHRINK_STEPS; k++) {
    const at = huntAt + (roundMin * 60_000 * k) / (SHRINK_STEPS + 1);
    const nr = r * SHRINK_FACTOR;
    const ang = rand() * 2 * Math.PI;
    const d = rand() * (r - nr) * 0.6;
    lat += (d * Math.cos(ang)) / 111320;
    lng += (d * Math.sin(ang)) / (111320 * Math.cos(lat * Math.PI / 180));
    out.push({ warn_at: at - SHRINK_WARN_MS, at, lat, lng, radius: nr });
    r = nr;
  }
  return out;
}

export function nextEventAt(g) {
  const c = [];
  if (g.status === 'headstart') c.push(g.hunt_at);
  if (g.next_ping_at < g.ends_at) c.push(g.next_ping_at);
  if (g.shrinks[g.shrink_warned]) c.push(g.shrinks[g.shrink_warned].warn_at);
  if (g.shrinks[g.shrink_done]) c.push(g.shrinks[g.shrink_done].at);
  c.push(g.ends_at);
  return Math.min(...c.filter((x) => x != null));
}

export function currentZone(g) {
  return { lat: g.cur_lat ?? g.zone_lat, lng: g.cur_lng ?? g.zone_lng, radius: g.cur_radius ?? g.zone_radius };
}

export function upcomingShrink(g) {
  return g.shrinks?.[g.shrink_done] || null;
}

// "0:28", "12:05", "1:02:09"
export function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function fmtAgo(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function fmtDuration(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function fmtDistance(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km` : `${Math.round(m)} m`;
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
