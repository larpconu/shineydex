// End-to-end tests for supabase/schema.sql against a real Postgres.
// Run: npm run test:db   (needs a local Postgres; see tests/README.md)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const ADMIN = { host: process.env.PGHOST || '127.0.0.1', user: process.env.PGUSER || 'postgres', password: process.env.PGPASSWORD || 'pg' };
const DB = 'ghostline_test';
let db;

const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

before(async () => {
  const admin = new pg.Client({ ...ADMIN, database: 'postgres' });
  await admin.connect();
  await admin.query(`drop database if exists ${DB}`);
  await admin.query(`create database ${DB}`);
  await admin.end();
  db = new pg.Client({ ...ADMIN, database: DB });
  await db.connect();
  db.on('notice', () => {});
  await db.query(read('tests/supabase-stub.sql'));
  await db.query(read('supabase/schema.sql'));
  await db.query(read('supabase/schema.sql')); // must be safe to re-run
});

after(async () => { await db?.end(); });

// Run SQL as a signed-in player (role "authenticated", RLS applies).
async function as(uid, sql, params = []) {
  await db.query('begin');
  try {
    await db.query('set local role authenticated');
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    const r = await db.query(sql, params);
    await db.query('commit');
    return r.rows;
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}
const rpc = async (uid, fn, args = []) => {
  const ph = args.map((_, i) => `$${i + 1}`).join(',');
  const rows = await as(uid, `select public.${fn}(${ph}) as r`, args);
  return rows[0].r;
};
const sys = async (sql, params = []) => (await db.query(sql, params)).rows;

// Pretend `secs` seconds passed for one game.
async function rewind(code, secs) {
  const iv = `${secs} seconds`;
  await sys(`update public.games set created_at = created_at - $2::interval, started_at = started_at - $2::interval,
      hunt_at = hunt_at - $2::interval, ends_at = ends_at - $2::interval, next_ping_at = next_ping_at - $2::interval,
      next_event_at = next_event_at - $2::interval, ended_at = ended_at - $2::interval,
      shrinks = (select coalesce(jsonb_agg(jsonb_set(jsonb_set(e, '{warn_at}', to_jsonb((e->>'warn_at')::timestamptz - $2::interval)),
                 '{at}', to_jsonb((e->>'at')::timestamptz - $2::interval)) order by i), '[]'::jsonb)
                 from jsonb_array_elements(shrinks) with ordinality as t(e, i))
    where code = $1`, [code, iv]);
  await sys(`update public.locations set out_since = out_since - $2::interval where game_code = $1`, [code, iv]);
}
const tick = () => sys('select private.tick()');

async function makeUser(name, username) {
  const id = randomUUID();
  await sys('insert into auth.users (id, email) values ($1, $2)', [id, `${username}@example.com`]);
  await as(id, 'insert into public.profiles (id, name, username) values ($1, $2, $3)', [id, name, username]);
  return id;
}

const U = {};
let code;
const CENTER = { lat: 37.7596, lng: -122.4269 };
const offset = (m) => ({ lat: CENTER.lat + m / 111320, lng: CENTER.lng });

test('profiles: usernames are unique and private', async () => {
  for (const [k, n] of Object.entries({ host: 'Ava Host', b: 'Ben', c: 'Cleo', d: 'Dev', e: 'Eli', f: 'Fox', g: 'Gus', h: 'Hal', x: 'Xan' })) {
    U[k] = await makeUser(n, k + '_user');
  }
  await assert.rejects(makeUser('Copycat', 'b_user'), /duplicate key/);
  assert.equal(await rpc(U.b, 'username_available', ['b_user']), true, 'your own name counts as available to you');
  assert.equal(await rpc(U.c, 'username_available', ['b_user']), false);
  const rows = await as(U.b, 'select * from public.profiles');
  assert.equal(rows.length, 1, 'you can only see your own profile');
  await assert.rejects(as(U.b, `update public.profiles set username = 'Bad Name!' where id = $1`, [U.b]), /check constraint/);
});

test('host creates a private game with a clean 6-character code', async () => {
  code = await rpc(U.host, 'create_game', [CENTER.lat, CENTER.lng, 500, 30, 5, 2, true]);
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.doesNotMatch(code, /[O0I1]/);
  assert.equal((await as(U.b, 'select * from public.games')).length, 0, 'non-members cannot list or read games');
  const peek = await rpc(U.b, 'peek_game', [code.toLowerCase()]);
  assert.equal(peek.host_name, 'Ava Host');
  assert.equal(await rpc(U.b, 'peek_game', ['ZZZZZZ']), null);
  await assert.rejects(as(U.b, `insert into public.games (code, host_id, host_name, zone_lat, zone_lng, zone_radius, round_min, ping_min, head_min)
    values ('ABCDEF', $1, 'x', 0, 0, 500, 30, 5, 2)`, [U.b]), /permission denied/);
});

test('join, block and kick', async () => {
  for (const k of ['b', 'c', 'd', 'e', 'f']) await rpc(U[k], 'join_game', [code]);
  assert.equal((await as(U.b, 'select * from public.game_players where game_code = $1', [code])).length, 6);
  // host blocks Gus → Gus can't join
  await as(U.host, 'insert into public.blocks (blocker, blocked, blocked_name) values ($1, $2, $3)', [U.host, U.g, 'Gus']);
  await assert.rejects(rpc(U.g, 'join_game', [code]), /can't join/);
  // Hal joins, gets kicked, can't come back
  await rpc(U.h, 'join_game', [code]);
  await assert.rejects(rpc(U.b, 'kick_player', [code, U.h]), /Only the host/);
  await rpc(U.host, 'kick_player', [code, U.h]);
  assert.equal((await as(U.h, 'select * from public.games')).length, 0);
  await assert.rejects(rpc(U.h, 'join_game', [code]), /removed you/);
});

test('team balance is enforced server-side', async () => {
  // 6 players → 1..3 hunters
  assert.deepEqual(await rpc(U.b, 'gl_hunter_range', [6]), [1, 3]);
  assert.deepEqual(await rpc(U.b, 'gl_hunter_range', [3]), [1, 1]);
  assert.deepEqual(await rpc(U.b, 'gl_hunter_range', [25]), [3, 12]);
  for (const k of ['host', 'b', 'c', 'd', 'e', 'f']) await rpc(U[k], 'set_pick', [code, 'hunter']);
  for (const k of ['host', 'b', 'c', 'd', 'e', 'f']) await rpc(U[k], 'set_ready', [code, true]);
  await assert.rejects(rpc(U.host, 'start_game', [code]), /need 1 to 3 hunters/);
  for (const k of ['host', 'b', 'c', 'd', 'e', 'f']) await rpc(U[k], 'set_pick', [code, 'runner']);
  for (const k of ['host', 'b', 'c', 'd', 'e', 'f']) await rpc(U[k], 'set_ready', [code, true]);
  await assert.rejects(rpc(U.host, 'start_game', [code]), /need 1 to 3 hunters/);
  // host hunter, b+c random, d+e runner, f random
  await rpc(U.host, 'set_pick', [code, 'hunter']);
  for (const k of ['b', 'c', 'f']) await rpc(U[k], 'set_pick', [code, 'random']);
  await assert.rejects(rpc(U.host, 'start_game', [code]), /Still waiting on/);
  for (const k of ['host', 'b', 'c', 'f']) await rpc(U[k], 'set_ready', [code, true]);
  await assert.rejects(rpc(U.b, 'start_game', [code]), /Only the host/);
  await rpc(U.host, 'start_game', [code]);
  const players = await sys('select user_id, pick, team from public.game_players where game_code = $1', [code]);
  const hunters = players.filter((p) => p.team === 'hunter');
  assert.equal(hunters.length, 2, 'random players fill to a 1:2 split');
  assert.ok(players.every((p) => p.pick === 'random' || p.pick === p.team));
  const g = (await sys('select * from public.games where code = $1', [code]))[0];
  assert.equal(g.status, 'headstart');
  assert.equal(g.shrinks.length, 4);
  // remember teams
  U.hunters = hunters.map((p) => p.user_id);
  U.runners = players.filter((p) => p.team === 'runner').map((p) => p.user_id);
  U.hunter2 = U.hunters.find((u) => u !== U.host);
});

test('VISIBILITY: hunters cannot read live runner locations; runners never see hunters', async () => {
  let i = 0;
  for (const u of [...U.hunters, ...U.runners]) await rpc(u, 'send_location', [code, ...Object.values(offset(10 * i++)), 5]);
  const hunterView = await as(U.host, 'select user_id, team from public.locations where game_code = $1', [code]);
  assert.ok(hunterView.length === U.hunters.length && hunterView.every((r) => r.team === 'hunter'), 'hunter sees only hunters');
  assert.equal((await as(U.host, `select * from public.locations where team = 'runner'`)).length, 0, 'explicitly asking for runners returns nothing');
  const runnerView = await as(U.runners[0], 'select user_id, team from public.locations where game_code = $1', [code]);
  assert.ok(runnerView.length === U.runners.length && runnerView.every((r) => r.team === 'runner'), 'runner sees only runners');
  const state = await rpc(U.runners[0], 'game_state', [code]);
  assert.ok(state.locations.every((l) => l.team === 'runner'));
  // nobody can write locations directly, or lie about their team
  await assert.rejects(as(U.host, `insert into public.locations (game_code, user_id, team, initials, lat, lng) values ($1, $2, 'runner', 'XX', 0, 0)`, [code, U.host]), /permission denied/);
  await assert.rejects(as(U.host, `update public.locations set team = 'hunter'`), /permission denied/);
  // outsiders see nothing
  assert.equal((await as(U.x, 'select * from public.locations')).length, 0);
});

test('radio is team-only', async () => {
  await rpc(U.host, 'send_radio', [code, 'hunters assemble']);
  await rpc(U.runners[0], 'send_radio', [code, 'runners: hide by the fountain']);
  const h = await as(U.hunter2, 'select body, team from public.radio');
  const r = await as(U.runners[1], 'select body, team from public.radio');
  assert.deepEqual(h.map((m) => m.body), ['hunters assemble']);
  assert.deepEqual(r.map((m) => m.body), ['runners: hide by the fountain']);
  await assert.rejects(as(U.host, `insert into public.radio (game_code, user_id, name, team, body) values ($1, $2, 'x', 'runner', 'spy')`, [code, U.host]), /permission denied/);
});

test('head start ends and pings arrive on schedule (hunters only)', async () => {
  await tick();
  assert.equal((await sys('select status from public.games where code = $1', [code]))[0].status, 'headstart');
  await rewind(code, 121);
  await tick();
  const g = (await sys('select * from public.games where code = $1', [code]))[0];
  assert.equal(g.status, 'hunt');
  assert.equal(g.ping_count, 1, 'first ping when the hunt starts');
  const hp = await as(U.host, 'select * from public.pings');
  assert.equal(hp.length, 1);
  assert.equal(hp[0].positions.length, U.runners.length, 'ping holds every free runner');
  assert.equal((await as(U.runners[0], 'select * from public.pings')).length, 0, 'runners cannot read pings during the round');
  // runners get a push for each ping
  await rpc(U.runners[0], 'save_push_subscription', ['https://push.example/r0', 'p256', 'auth']);
  await sys(`select public.ghostline_configure_push('https://app.example/api/push', 's3cret')`);
  await rewind(code, 290);
  await tick();
  assert.equal((await sys('select ping_count from public.games where code = $1', [code]))[0].ping_count, 1, 'not yet');
  await rewind(code, 15);
  await tick();
  assert.equal((await sys('select ping_count from public.games where code = $1', [code]))[0].ping_count, 2, 'second ping after 5 min');
  const calls = await sys(`select * from net.calls where body->>'tag' = 'ping'`);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers['x-ghostline-secret'], 's3cret');
  assert.match(calls[0].body.body, /Ping! Your location was just sent/);
  assert.deepEqual(calls[0].body.subscriptions.map((s) => s.endpoint), ['https://push.example/r0']);
  const ev = await as(U.runners[0], `select body from public.events where kind = 'ping'`);
  assert.ok(ev.every((e) => /Ping!/.test(e.body)), 'runners only see the runner version of the ping banner');
});

test('out of zone for 30+ seconds → hunters see that runner live', async () => {
  const r = U.runners[0];
  const far = offset(900);
  const res = await rpc(r, 'send_location', [code, far.lat, far.lng, 5]);
  assert.ok(res.out_since, 'server starts the 30s countdown');
  assert.equal((await as(U.host, 'select * from public.reveals')).length, 0, 'not yet revealed');
  await rewind(code, 31);
  await tick();
  const rev = await as(U.host, 'select * from public.reveals');
  assert.equal(rev.length, 1);
  assert.equal(rev[0].user_id, r);
  assert.equal((await as(U.runners[1], 'select * from public.reveals')).length, 0, 'runners cannot read reveals');
  assert.equal((await as(U.host, `select * from public.locations where team = 'runner'`)).length, 0, 'still no access to the locations table');
  assert.ok((await as(r, `select * from public.events where kind = 'revealed'`)).length === 1, 'runner was warned');
  await rpc(r, 'send_location', [code, CENTER.lat, CENTER.lng, 5]);
  assert.equal((await as(U.host, 'select * from public.reveals')).length, 0, 'back inside → hidden again');
});

test('shrinking zone: warning a minute before, then the shrink', async () => {
  const g0 = (await sys('select * from public.games where code = $1', [code]))[0];
  const warnIn = (new Date(g0.shrinks[0].warn_at) - Date.now()) / 1000;
  await rewind(code, Math.ceil(warnIn) + 1);
  await tick();
  let g = (await sys('select * from public.games where code = $1', [code]))[0];
  assert.equal(g.shrink_warned, 1);
  assert.equal(g.shrink_done, 0);
  assert.equal((await sys(`select * from net.calls where body->>'tag' = 'shrink_warn'`))[0].body.body, 'Zone shrinks in 1 min.');
  await rewind(code, 60);
  await tick();
  g = (await sys('select * from public.games where code = $1', [code]))[0];
  assert.equal(g.shrink_done, 1);
  assert.ok(Math.abs(g.cur_radius - 375) < 0.01, 'radius shrank to 75%');
});

test('tagging: hunter asks, runner confirms; round ends when all runners are tagged', async () => {
  const [r0, r1, ...rest] = U.runners;
  await rpc(U.host, 'request_tag', [code, r0]);
  const prompt = await as(r0, `select * from public.events where kind = 'tag_request'`);
  assert.equal(prompt.length, 1);
  assert.equal(prompt[0].data.hunter_id, U.host);
  assert.equal((await as(r1, `select * from public.events where kind = 'tag_request'`)).length, 0, 'only the target sees the prompt');
  await assert.rejects(rpc(U.runners[1], 'request_tag', [code, r0]), /Only hunters/);
  await rpc(r0, 'confirm_tag', [code, U.host]);
  const p = (await sys('select * from public.game_players where game_code = $1 and user_id = $2', [code, r0]))[0];
  assert.equal(p.status, 'tagged');
  assert.equal(p.tagged_by_name, 'Ava Host');
  assert.equal((await sys('select * from public.locations where game_code = $1 and user_id = $2', [code, r0])).length, 0, 'location sharing stops');
  assert.equal((await rpc(r0, 'send_location', [code, CENTER.lat, CENTER.lng, 5])).ok, false);
  assert.equal((await as(r0, 'select * from public.locations')).length, U.runners.length - 1, 'spectator still watches teammates');
  await assert.rejects(rpc(r0, 'confirm_tag', [code, U.host]), /not a free runner/);
  for (const r of [r1, ...rest]) await rpc(r, 'confirm_tag', [code, U.hunter2]);
  const g = (await sys('select * from public.games where code = $1', [code]))[0];
  assert.equal(g.status, 'ended');
  assert.equal(g.end_reason, 'all_tagged');
  assert.equal(g.winner, 'hunters');
  assert.equal((await sys('select * from public.locations where game_code = $1', [code])).length, 0);
  assert.ok((await as(r1, 'select * from public.pings')).length >= 2, 'everyone can see the ping replay after the round');
  assert.equal((await sys(`select * from net.calls where body->>'tag' = 'end'`))[0].body.body, 'Time! Round over. Every runner got tagged.');
});

test('host end, player leave (no rejoin), time limit', async () => {
  const c2 = await rpc(U.b, 'create_game', [CENTER.lat, CENTER.lng, 300, 10, 1, 0, false]);
  for (const k of ['c', 'd', 'e']) await rpc(U[k], 'join_game', [c2]);
  await rpc(U.b, 'set_pick', [c2, 'hunter']);
  for (const k of ['b', 'c', 'd', 'e']) await rpc(U[k], 'set_ready', [c2, true]);
  await rpc(U.b, 'start_game', [c2]);
  assert.equal((await sys('select status from public.games where code = $1', [c2]))[0].status, 'hunt', 'no head start → straight to the hunt');
  await rpc(U.c, 'leave_game', [c2]);
  await assert.rejects(rpc(U.c, 'join_game', [c2]), /No take-backs/);
  await assert.rejects(rpc(U.d, 'end_game', [c2]), /Only the host/);
  await rpc(U.b, 'end_game', [c2]);
  let g = (await sys('select * from public.games where code = $1', [c2]))[0];
  assert.equal(g.end_reason, 'host');
  assert.equal(g.winner, 'runners');

  const c3 = await rpc(U.b, 'create_game', [CENTER.lat, CENTER.lng, 300, 10, 1, 1, false]);
  for (const k of ['c', 'd']) await rpc(U[k], 'join_game', [c3]);
  for (const k of ['b', 'c', 'd']) await rpc(U[k], 'set_ready', [c3, true]);
  await rpc(U.b, 'start_game', [c3]);
  await rewind(c3, 60 + 600 + 1);
  await tick();
  g = (await sys('select * from public.games where code = $1', [c3]))[0];
  assert.equal(g.status, 'ended');
  assert.equal(g.end_reason, 'time');
  assert.equal(g.winner, 'runners');
});

test('push_gone needs the shared secret', async () => {
  await assert.rejects(sys(`set role anon; select public.push_gone('wrong', array['https://push.example/r0']); reset role;`), /nope/);
  await sys('reset role');
  await sys(`set role anon; select public.push_gone('s3cret', array['https://push.example/r0']); reset role;`);
  assert.equal((await sys('select * from public.push_subscriptions')).length, 0);
  await assert.rejects(sys(`set role anon; select * from public.games; reset role;`), /permission denied/);
  await sys('reset role');
});

test('delete account removes name, username, email and history immediately', async () => {
  const u = U.e;
  await rpc(u, 'delete_account');
  assert.equal((await sys('select * from auth.users where id = $1', [u])).length, 0);
  assert.equal((await sys('select * from public.profiles where id = $1', [u])).length, 0);
  assert.equal((await sys('select * from public.game_players where user_id = $1', [u])).length, 0);
  assert.equal((await sys('select * from public.radio where user_id = $1', [u])).length, 0);
  const pingsMentioning = await sys(`select * from public.pings where positions::text like '%' || $1 || '%' and positions::text like '%"initials": "EL"%'`, [u]);
  assert.equal(pingsMentioning.length, 0);
});

test('all game data is deleted 7 days after the game', async () => {
  const before = (await sys('select count(*)::int n from public.games'))[0].n;
  assert.ok(before >= 3);
  await sys('select private.cleanup()');
  assert.equal((await sys('select count(*)::int n from public.games'))[0].n, before, 'fresh games survive');
  await rewind(code, 7 * 86400 + 60);
  const deleted = (await sys('select private.cleanup() as n'))[0].n;
  assert.equal(deleted, 1);
  for (const t of ['game_players', 'locations', 'reveals', 'pings', 'radio', 'events']) {
    assert.equal((await sys(`select count(*)::int n from public.${t} where game_code = $1`, [code]))[0].n, 0, `${t} wiped`);
  }
});
