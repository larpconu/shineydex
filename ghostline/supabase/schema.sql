-- ============================================================================
-- GHOSTLINE — Supabase database
--
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It is safe to run again (for example after an update).
--
-- How the rules are enforced:
--   * Every table has row-level security (RLS) switched on.
--   * Players can only READ rows the visibility rules allow (policies below).
--   * Players can never WRITE game tables directly. All changes go through the
--     functions in this file, which check who you are and what you're allowed
--     to do before touching anything.
--   * The game clock (pings, shrinks, round end) runs inside the database
--     every 5 seconds with pg_cron, so nobody's phone has to be the referee.
-- ============================================================================

create schema if not exists private;
revoke all on schema private from public;

do $$ begin
  begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron not available: %', sqlerrm; end;
  begin create extension if not exists pg_net with schema extensions; exception when others then raise notice 'pg_net not available: %', sqlerrm; end;
end $$;

-- Settings that only the database can read (push URL + shared secret).
create table if not exists private.settings (
  key text primary key,
  value text not null
);

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 24),
  username text not null check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_username_key on public.profiles (username);

create table if not exists public.blocks (
  blocker uuid not null references auth.users(id) on delete cascade,
  blocked uuid not null,
  blocked_name text not null default '',
  blocked_username text not null default '',
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  reporter uuid not null,
  reported uuid not null,
  game_code text,
  reason text not null check (char_length(reason) between 1 and 60),
  message text check (char_length(message) <= 300),
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

create table if not exists public.games (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host_id uuid not null,
  host_name text not null,
  status text not null default 'lobby' check (status in ('lobby','headstart','hunt','ended')),
  zone_lat double precision not null check (zone_lat between -85 and 85),
  zone_lng double precision not null check (zone_lng between -180 and 180),
  zone_radius double precision not null check (zone_radius between 200 and 1500),
  round_min int not null check (round_min between 10 and 180),
  ping_min int not null check (ping_min between 1 and 30),
  head_min int not null check (head_min between 0 and 15),
  shrink boolean not null default false,
  cur_lat double precision,
  cur_lng double precision,
  cur_radius double precision,
  shrinks jsonb not null default '[]'::jsonb,
  shrink_warned int not null default 0,
  shrink_done int not null default 0,
  kicked uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  hunt_at timestamptz,
  ends_at timestamptz,
  next_ping_at timestamptz,
  ping_count int not null default 0,
  next_event_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  winner text
);
create index if not exists games_active on public.games (status, next_event_at);

create table if not exists public.game_players (
  game_code text not null references public.games(code) on delete cascade,
  user_id uuid not null,
  name text not null,
  username text not null,
  initials text not null,
  pick text not null default 'random' check (pick in ('hunter','runner','random')),
  team text check (team in ('hunter','runner')),
  ready boolean not null default false,
  status text not null default 'active' check (status in ('active','tagged','left')),
  joined_at timestamptz not null default now(),
  tagged_at timestamptz,
  tagged_by uuid,
  tagged_by_name text,
  left_at timestamptz,
  primary key (game_code, user_id)
);
create index if not exists game_players_user on public.game_players (user_id);

-- Live positions. Readable only by teammates (see policies).
create table if not exists public.locations (
  game_code text not null references public.games(code) on delete cascade,
  user_id uuid not null,
  team text not null check (team in ('hunter','runner')),
  initials text not null,
  lat double precision not null,
  lng double precision not null,
  acc double precision,
  out_since timestamptz,
  updated_at timestamptz not null default now(),
  primary key (game_code, user_id)
);

-- Runners who have been outside the zone for 30+ seconds. Hunters can read these.
create table if not exists public.reveals (
  game_code text not null references public.games(code) on delete cascade,
  user_id uuid not null,
  initials text not null,
  lat double precision not null,
  lng double precision not null,
  since timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (game_code, user_id)
);

-- Ping snapshots of runner positions.
create table if not exists public.pings (
  id bigint generated always as identity primary key,
  game_code text not null references public.games(code) on delete cascade,
  n int not null,
  taken_at timestamptz not null default now(),
  positions jsonb not null default '[]'::jsonb
);
create index if not exists pings_game on public.pings (game_code, n);

-- Team chat.
create table if not exists public.radio (
  id bigint generated always as identity primary key,
  game_code text not null references public.games(code) on delete cascade,
  user_id uuid not null,
  name text not null,
  team text not null check (team in ('hunter','runner')),
  body text not null check (char_length(btrim(body)) between 1 and 280),
  created_at timestamptz not null default now()
);
create index if not exists radio_game on public.radio (game_code, team, id);

-- Announcements (in-app banners). audience = all / hunter / runner, target = one player.
create table if not exists public.events (
  id bigint generated always as identity primary key,
  game_code text not null references public.games(code) on delete cascade,
  kind text not null,
  audience text not null default 'all' check (audience in ('all','hunter','runner')),
  target uuid,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_game on public.events (game_code, id);

-- ----------------------------------------------------------------------------
-- Small helpers
-- ----------------------------------------------------------------------------

create or replace function public.gl_distance(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

create or replace function public.gl_initials(p_name text)
returns text language sql immutable as $$
  select upper(case
    when array_length(regexp_split_to_array(btrim(p_name), '\s+'), 1) >= 2
      then left((regexp_split_to_array(btrim(p_name), '\s+'))[1], 1) || left((regexp_split_to_array(btrim(p_name), '\s+'))[2], 1)
    else left(btrim(p_name), 2) end)
$$;

-- Who am I in this game? (security definer so policies can call it without recursion)
create or replace function public.gl_team(p_code text)
returns text language sql stable security definer set search_path = public as $$
  select team from public.game_players where game_code = p_code and user_id = auth.uid()
$$;

create or replace function public.gl_status(p_code text)
returns text language sql stable security definer set search_path = public as $$
  select status from public.game_players where game_code = p_code and user_id = auth.uid()
$$;

create or replace function public.gl_game_status(p_code text)
returns text language sql stable security definer set search_path = public as $$
  select status from public.games where code = p_code
$$;

-- ----------------------------------------------------------------------------
-- Row-level security: who can READ what
-- ----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.locations enable row level security;
alter table public.reveals enable row level security;
alter table public.pings enable row level security;
alter table public.radio enable row level security;
alter table public.events enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('profiles','blocks','reports','push_subscriptions','games','game_players','locations','reveals','pings','radio','events')
  loop execute format('drop policy %I on public.%I', r.policyname, r.tablename); end loop;
end $$;

-- Your own profile only. Other players see the name copied into game_players.
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Your own block list only.
create policy blocks_select on public.blocks for select to authenticated using (blocker = auth.uid());
create policy blocks_insert on public.blocks for insert to authenticated with check (blocker = auth.uid() and blocked <> auth.uid());
create policy blocks_delete on public.blocks for delete to authenticated using (blocker = auth.uid());

-- Reports: you can file one, nobody can read them through the app.
create policy reports_insert on public.reports for insert to authenticated with check (reporter = auth.uid());

-- Push subscriptions: your own only (writes go through save_push_subscription).
create policy push_select on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- Games are private: you can only read a game you're in. Joining happens by code via join_game().
create policy games_select on public.games for select to authenticated using (public.gl_status(code) is not null);
create policy players_select on public.game_players for select to authenticated using (public.gl_status(game_code) is not null);

-- LIVE LOCATIONS: teammates only. Hunters can never read a runner's row and runners can never read a hunter's.
create policy locations_select on public.locations for select to authenticated using (
  public.gl_status(game_code) in ('active','tagged')
  and team = public.gl_team(game_code)
);

-- Out-of-zone reveals: hunters only.
create policy reveals_select on public.reveals for select to authenticated using (
  public.gl_status(game_code) in ('active','tagged')
  and public.gl_team(game_code) = 'hunter'
);

-- Ping snapshots: hunters during the round; everyone once it's over (for the replay).
create policy pings_select on public.pings for select to authenticated using (
  public.gl_status(game_code) is not null
  and (public.gl_team(game_code) = 'hunter' or public.gl_game_status(game_code) = 'ended')
);

-- Radio: your own team's channel only.
create policy radio_select on public.radio for select to authenticated using (
  public.gl_status(game_code) in ('active','tagged')
  and team = public.gl_team(game_code)
);

-- Banners: everyone / your team / just you.
create policy events_select on public.events for select to authenticated using (
  public.gl_status(game_code) is not null
  and (audience = 'all' or audience = public.gl_team(game_code))
  and (target is null or target = auth.uid())
);

revoke all on public.profiles, public.blocks, public.reports, public.push_subscriptions, public.games,
  public.game_players, public.locations, public.reveals, public.pings, public.radio, public.events from anon;
revoke insert, update, delete on public.games, public.game_players, public.locations, public.reveals,
  public.pings, public.radio, public.events, public.push_subscriptions from authenticated;
grant select on public.games, public.game_players, public.locations, public.reveals, public.pings,
  public.radio, public.events, public.push_subscriptions to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant insert on public.reports to authenticated;
grant delete on public.push_subscriptions to authenticated;

-- ----------------------------------------------------------------------------
-- Push notifications (sent by the Vercel function /api/push)
-- ----------------------------------------------------------------------------

create or replace function private.send_push(p_code text, p_audience text, p_target uuid, p_active_only boolean, p_title text, p_body text, p_tag text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_url text := (select value from private.settings where key = 'push_url');
  v_secret text := (select value from private.settings where key = 'push_secret');
  v_subs jsonb;
begin
  if v_url is null or v_secret is null then return; end if;
  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
    into v_subs
    from public.push_subscriptions s
    join public.game_players p on p.user_id = s.user_id and p.game_code = p_code
   where p.status <> 'left'
     and (not p_active_only or p.status = 'active')
     and (p_audience = 'all' or p.team = p_audience)
     and (p_target is null or p.user_id = p_target);
  if v_subs is null then return; end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 8000)'
      using v_url,
            jsonb_build_object('subscriptions', v_subs, 'title', p_title, 'body', p_body, 'tag', p_tag, 'code', p_code),
            jsonb_build_object('Content-Type', 'application/json', 'x-ghostline-secret', v_secret);
  exception when others then
    raise warning 'ghostline push failed: %', sqlerrm;
  end;
end $$;

-- Post a banner, optionally with a push.
create or replace function private.announce(p_code text, p_kind text, p_audience text, p_target uuid, p_body text,
  p_push boolean default false, p_data jsonb default '{}'::jsonb, p_active_only boolean default false, p_title text default 'GHOSTLINE')
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.events (game_code, kind, audience, target, body, data)
  values (p_code, p_kind, p_audience, p_target, p_body, p_data);
  if p_push then
    perform private.send_push(p_code, p_audience, p_target, p_active_only, p_title, p_body, p_kind);
  end if;
end $$;

-- Called by /api/push with the shared secret to forget subscriptions the push service says are dead.
create or replace function public.push_gone(p_secret text, p_endpoints text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null or p_secret <> (select value from private.settings where key = 'push_secret') then
    raise exception 'nope';
  end if;
  delete from public.push_subscriptions where endpoint = any(p_endpoints);
end $$;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end $$;

-- One-time setup helper: the /setup page generates this call for you.
create or replace function public.ghostline_configure_push(p_url text, p_secret text)
returns text language plpgsql security definer set search_path = public as $$
begin
  insert into private.settings values ('push_url', p_url) on conflict (key) do update set value = excluded.value;
  insert into private.settings values ('push_secret', p_secret) on conflict (key) do update set value = excluded.value;
  return 'Push is wired up. Nice.';
end $$;

-- ----------------------------------------------------------------------------
-- Accounts
-- ----------------------------------------------------------------------------

create or replace function public.username_available(p_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where username = lower(p_username) and id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'))
$$;

-- Keeps Supabase's free tier awake (called daily by the Vercel cron job).
create or replace function public.keepalive()
returns timestamptz language sql stable as $$ select now() $$;

create or replace function public.server_now()
returns timestamptz language sql stable as $$ select now() $$;

-- ----------------------------------------------------------------------------
-- Game logic
-- ----------------------------------------------------------------------------

create or replace function private.new_code()
returns text language plpgsql as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.games where code = c);
  end loop;
  return c;
end $$;

create or replace function public.create_game(p_lat float8, p_lng float8, p_radius float8, p_round_min int,
  p_ping_min int, p_head_min int, p_shrink boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  v_code text;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Set up your profile first.'; end if;
  v_code := private.new_code();
  insert into public.games (code, host_id, host_name, zone_lat, zone_lng, zone_radius, round_min, ping_min, head_min, shrink,
                            cur_lat, cur_lng, cur_radius)
  values (v_code, me.id, me.name, p_lat, p_lng, p_radius, p_round_min, p_ping_min, p_head_min, p_shrink,
          p_lat, p_lng, p_radius);
  insert into public.game_players (game_code, user_id, name, username, initials)
  values (v_code, me.id, me.name, me.username, public.gl_initials(me.name));
  return v_code;
end $$;

-- What a code points at, before you join (no zone, no player list).
create or replace function public.peek_game(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', g.code, 'host_name', g.host_name, 'status', g.status,
    'players', (select count(*) from public.game_players p where p.game_code = g.code and p.status <> 'left'))
    from public.games g where g.code = upper(p_code)
$$;

create or replace function public.join_game(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  g public.games;
  existing public.game_players;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Set up your profile first.'; end if;
  select * into g from public.games where code = upper(p_code) for update;
  if g.code is null then raise exception 'No game with that code. Typo?'; end if;
  select * into existing from public.game_players where game_code = g.code and user_id = me.id;
  if existing.user_id is not null then
    if existing.status = 'left' then raise exception 'You left this one. No take-backs.'; end if;
    return g.code;
  end if;
  if g.status <> 'lobby' then raise exception 'That game already started.'; end if;
  if me.id = any(g.kicked) then raise exception 'The host removed you from this game.'; end if;
  if exists (select 1 from public.blocks where blocker = g.host_id and blocked = me.id) then
    raise exception 'You can''t join this game.';
  end if;
  if (select count(*) from public.game_players where game_code = g.code) >= 30 then
    raise exception 'Lobby''s full (30 max).';
  end if;
  insert into public.game_players (game_code, user_id, name, username, initials)
  values (g.code, me.id, me.name, me.username, public.gl_initials(me.name));
  return g.code;
end $$;

create or replace function public.set_pick(p_code text, p_pick text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_pick not in ('hunter','runner','random') then raise exception 'Bad pick.'; end if;
  if public.gl_game_status(p_code) <> 'lobby' then raise exception 'Too late to switch.'; end if;
  update public.game_players set pick = p_pick, ready = false where game_code = p_code and user_id = auth.uid();
end $$;

create or replace function public.set_ready(p_code text, p_ready boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.gl_game_status(p_code) <> 'lobby' then raise exception 'Game already started.'; end if;
  update public.game_players set ready = p_ready where game_code = p_code and user_id = auth.uid();
end $$;

create or replace function public.kick_player(p_code text, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g public.games;
begin
  select * into g from public.games where code = p_code for update;
  if g.host_id is distinct from auth.uid() then raise exception 'Only the host can do that.'; end if;
  if g.status <> 'lobby' then raise exception 'You can only remove players in the lobby.'; end if;
  if p_user = g.host_id then raise exception 'You can''t kick yourself.'; end if;
  delete from public.game_players where game_code = p_code and user_id = p_user;
  update public.games set kicked = array_append(kicked, p_user) where code = p_code and not (p_user = any(kicked));
end $$;

-- Team balance: at least 1 hunter per 10 players, never more hunters than runners.
create or replace function public.gl_hunter_range(n int)
returns int[] language sql immutable as $$
  select array[greatest(1, ceil(n / 10.0)::int), floor(n / 2.0)::int]
$$;

create or replace function private.next_event_at(g public.games)
returns timestamptz language sql stable as $$
  select least(
    case when g.status = 'headstart' then g.hunt_at end,
    case when g.next_ping_at < g.ends_at then g.next_ping_at end,
    (g.shrinks -> g.shrink_warned ->> 'warn_at')::timestamptz,
    (g.shrinks -> g.shrink_done ->> 'at')::timestamptz,
    g.ends_at)
$$;

create or replace function public.start_game(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  n int; fixed_h int; fixed_r int; randoms int; lo int; hi int; target int; rng int[];
  not_ready text;
  v_now timestamptz := now();
  v_hunt_at timestamptz; v_ends_at timestamptz;
  v_shrinks jsonb := '[]'::jsonb;
  r float8; nr float8; clat float8; clng float8; ang float8; dist float8; v_at timestamptz;
begin
  select * into g from public.games where code = p_code for update;
  if g.host_id is distinct from auth.uid() then raise exception 'Only the host can start.'; end if;
  if g.status <> 'lobby' then raise exception 'Already started.'; end if;

  select count(*), count(*) filter (where pick = 'hunter'), count(*) filter (where pick = 'runner'),
         count(*) filter (where pick = 'random')
    into n, fixed_h, fixed_r, randoms
    from public.game_players where game_code = p_code;
  if n < 3 then raise exception 'You need at least 3 players.'; end if;
  rng := public.gl_hunter_range(n);
  lo := greatest(rng[1], fixed_h);
  hi := least(rng[2], fixed_h + randoms);
  if lo > hi then
    raise exception 'Teams don''t work: % players need % to % hunters.', n, rng[1], rng[2];
  end if;
  select string_agg(name, ', ') into not_ready from public.game_players where game_code = p_code and not ready;
  if not_ready is not null then raise exception 'Still waiting on: %', not_ready; end if;

  -- Random players fill whichever side is short of a ~1:2 hunter:runner split.
  target := least(greatest(round(n / 3.0)::int, lo), hi);
  update public.game_players set team = pick where game_code = p_code and pick <> 'random';
  update public.game_players p set team = case when s.rn <= target - fixed_h then 'hunter' else 'runner' end
    from (select user_id, row_number() over (order by random()) rn
            from public.game_players where game_code = p_code and pick = 'random') s
   where p.game_code = p_code and p.user_id = s.user_id;

  v_hunt_at := v_now + make_interval(mins => g.head_min);
  v_ends_at := v_hunt_at + make_interval(mins => g.round_min);

  if g.shrink then
    r := g.zone_radius; clat := g.zone_lat; clng := g.zone_lng;
    for k in 1..4 loop
      v_at := v_hunt_at + make_interval(secs => g.round_min * 60.0 * k / 5);
      nr := r * 0.75;
      ang := random() * 2 * pi();
      dist := random() * (r - nr) * 0.6;
      clat := clat + (dist * cos(ang)) / 111320.0;
      clng := clng + (dist * sin(ang)) / (111320.0 * cos(radians(clat)));
      v_shrinks := v_shrinks || jsonb_build_object('warn_at', v_at - interval '60 seconds', 'at', v_at,
                                               'lat', clat, 'lng', clng, 'radius', nr);
      r := nr;
    end loop;
  end if;

  update public.games set
    status = case when g.head_min > 0 then 'headstart' else 'hunt' end,
    started_at = v_now,
    hunt_at = v_hunt_at,
    ends_at = v_ends_at,
    next_ping_at = v_hunt_at + case when g.head_min = 0 then make_interval(mins => g.ping_min) else interval '0' end,
    shrinks = v_shrinks,
    shrink_warned = 0, shrink_done = 0,
    cur_lat = g.zone_lat, cur_lng = g.zone_lng, cur_radius = g.zone_radius
  where code = p_code
  returning * into g;
  update public.games set next_event_at = private.next_event_at(g) where code = p_code;

  perform private.announce(p_code, 'start', 'runner', null,
    case when g.head_min > 0 then 'Go go go! Hide inside the zone.' else 'No head start. Run!' end);
  perform private.announce(p_code, 'start', 'hunter', null,
    case when g.head_min > 0 then 'Eyes shut. Runners are scattering.' else 'Hunt''s on. Go get ''em.' end);
end $$;

-- Out-of-zone check for one runner. Outside for 30s+ → hunters see them live.
create or replace function private.eval_outside(p_code text, p_user uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  p public.game_players;
  l public.locations;
  had_reveal boolean;
begin
  select * into g from public.games where code = p_code;
  select * into p from public.game_players where game_code = p_code and user_id = p_user;
  select * into l from public.locations where game_code = p_code and user_id = p_user;
  if l.user_id is null then return null; end if;
  if g.status <> 'hunt' or p.team <> 'runner' or p.status <> 'active' then
    delete from public.reveals where game_code = p_code and user_id = p_user;
    if l.out_since is not null then update public.locations set out_since = null where game_code = p_code and user_id = p_user; end if;
    return null;
  end if;
  if public.gl_distance(l.lat, l.lng, g.cur_lat, g.cur_lng) > g.cur_radius then
    if l.out_since is null then
      update public.locations set out_since = now() where game_code = p_code and user_id = p_user returning * into l;
    end if;
    if now() - l.out_since >= interval '30 seconds' then
      had_reveal := exists (select 1 from public.reveals where game_code = p_code and user_id = p_user);
      insert into public.reveals (game_code, user_id, initials, lat, lng, since, updated_at)
      values (p_code, p_user, l.initials, l.lat, l.lng, l.out_since + interval '30 seconds', l.updated_at)
      on conflict (game_code, user_id) do update set lat = excluded.lat, lng = excluded.lng, updated_at = excluded.updated_at;
      if not had_reveal then
        perform private.announce(p_code, 'reveal', 'hunter', null, p.name || ' is out of bounds. Live on your map!');
        perform private.announce(p_code, 'revealed', 'runner', p_user, 'You''re out of bounds. Hunters can see you live!');
      end if;
    end if;
    return l.out_since;
  else
    if l.out_since is not null then
      update public.locations set out_since = null where game_code = p_code and user_id = p_user;
    end if;
    delete from public.reveals where game_code = p_code and user_id = p_user;
    return null;
  end if;
end $$;

create or replace function private.finish(p_code text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_winner text;
  msg text;
begin
  v_winner := case when exists (select 1 from public.game_players where game_code = p_code
                                and team = 'runner' and status = 'active') then 'runners' else 'hunters' end;
  update public.games set status = 'ended', ended_at = now(), end_reason = p_reason, winner = v_winner, next_event_at = null
   where code = p_code and status in ('headstart','hunt');
  if not found then return; end if;
  delete from public.locations where game_code = p_code;
  delete from public.reveals where game_code = p_code;
  msg := case p_reason
    when 'time' then 'Time! Round over.'
    when 'all_tagged' then 'Time! Round over. Every runner got tagged.'
    when 'host' then 'Time! Round over. The host called it.'
    when 'no_hunters' then 'Time! Round over. The hunters all bailed.'
    else 'Time! Round over.' end;
  perform private.announce(p_code, 'end', 'all', null, msg, true, jsonb_build_object('winner', v_winner, 'reason', p_reason));
end $$;

-- Ends the round if nobody's left to chase (or to chase with).
create or replace function private.check_over(p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.gl_game_status(p_code) not in ('headstart','hunt') then return; end if;
  if not exists (select 1 from public.game_players where game_code = p_code and team = 'runner' and status = 'active') then
    perform private.finish(p_code, 'all_tagged');
  elsif not exists (select 1 from public.game_players where game_code = p_code and team = 'hunter' and status = 'active') then
    perform private.finish(p_code, 'no_hunters');
  end if;
end $$;

create or replace function private.do_ping(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_n int;
  v_positions jsonb;
begin
  update public.games set ping_count = ping_count + 1 where code = p_code returning ping_count into v_n;
  select coalesce(jsonb_agg(jsonb_build_object('user_id', l.user_id, 'initials', l.initials, 'lat', l.lat, 'lng', l.lng,
                                               'fix_at', l.updated_at)), '[]'::jsonb)
    into v_positions
    from public.locations l
    join public.game_players p on p.game_code = l.game_code and p.user_id = l.user_id
   where l.game_code = p_code and p.team = 'runner' and p.status = 'active';
  insert into public.pings (game_code, n, positions) values (p_code, v_n, v_positions);
  perform private.announce(p_code, 'ping', 'runner', null, 'Ping! Your location was just sent. Move!', true, '{}'::jsonb, true);
  perform private.announce(p_code, 'ping', 'hunter', null,
    'Fresh ping: ' || jsonb_array_length(v_positions) || ' runner' || case when jsonb_array_length(v_positions) = 1 then '' else 's' end || ' spotted.');
end $$;

-- Moves one game's clock forward. Called by tick().
create or replace function private.advance(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  s jsonb;
  interval_ping interval;
begin
  select * into g from public.games where code = p_code for update;
  if g.status not in ('headstart','hunt') then return; end if;

  if g.status = 'headstart' and now() >= g.hunt_at then
    update public.games set status = 'hunt' where code = p_code returning * into g;
    perform private.announce(p_code, 'hunt', 'all', null, 'Head start''s over. The hunt is on!', true);
  end if;

  if g.status = 'hunt' then
    if now() >= g.ends_at then
      perform private.finish(p_code, 'time');
      return;
    end if;

    interval_ping := make_interval(mins => g.ping_min);
    if g.next_ping_at <= now() and g.next_ping_at < g.ends_at then
      perform private.do_ping(p_code);
      update public.games
         set next_ping_at = next_ping_at + interval_ping * (floor(extract(epoch from now() - next_ping_at) / extract(epoch from interval_ping)) + 1)
       where code = p_code returning * into g;
    end if;

    while g.shrink_warned < jsonb_array_length(g.shrinks)
          and (g.shrinks -> g.shrink_warned ->> 'warn_at')::timestamptz <= now() loop
      update public.games set shrink_warned = shrink_warned + 1 where code = p_code returning * into g;
      perform private.announce(p_code, 'shrink_warn', 'all', null, 'Zone shrinks in 1 min.', true,
        jsonb_build_object('index', g.shrink_warned - 1));
    end loop;

    while g.shrink_done < jsonb_array_length(g.shrinks)
          and (g.shrinks -> g.shrink_done ->> 'at')::timestamptz <= now() loop
      s := g.shrinks -> g.shrink_done;
      update public.games set shrink_done = shrink_done + 1,
        cur_lat = (s ->> 'lat')::float8, cur_lng = (s ->> 'lng')::float8, cur_radius = (s ->> 'radius')::float8
       where code = p_code returning * into g;
      perform private.announce(p_code, 'shrink', 'all', null, 'The zone just shrank. Stay inside!');
    end loop;
  end if;

  update public.games set next_event_at = private.next_event_at(g) where code = p_code;
end $$;

-- The game clock. pg_cron runs this every 5 seconds.
create or replace function private.tick()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select code from public.games where status in ('headstart','hunt') and next_event_at <= now() loop
    perform private.advance(r.code);
  end loop;
  -- Re-check stationary runners so the 30-second out-of-zone reveal fires even if they stop moving.
  for r in select l.game_code, l.user_id from public.locations l
             join public.games g on g.code = l.game_code
            where g.status = 'hunt' and l.team = 'runner' loop
    perform private.eval_outside(r.game_code, r.user_id);
  end loop;
end $$;

-- Wipes every game (players, locations, pings, radio, banners) 7 days after it ends.
create or replace function private.cleanup()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.games where coalesce(ended_at, created_at) < now() - interval '7 days';
  get diagnostics n = row_count;
  delete from public.reports where created_at < now() - interval '7 days';
  return n;
end $$;

-- ----------------------------------------------------------------------------
-- Player actions during a round
-- ----------------------------------------------------------------------------

create or replace function public.send_location(p_code text, p_lat float8, p_lng float8, p_acc float8 default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  p public.game_players;
  v_out timestamptz;
begin
  select * into g from public.games where code = p_code;
  select * into p from public.game_players where game_code = p_code and user_id = auth.uid();
  if p.user_id is null or p.team is null or p.status <> 'active' or g.status not in ('headstart','hunt') then
    return jsonb_build_object('ok', false, 'server_now', now());
  end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Bad coordinates.'; end if;
  insert into public.locations (game_code, user_id, team, initials, lat, lng, acc, updated_at)
  values (p_code, p.user_id, p.team, p.initials, p_lat, p_lng, p_acc, now())
  on conflict (game_code, user_id) do update set lat = excluded.lat, lng = excluded.lng, acc = excluded.acc, updated_at = now();
  v_out := private.eval_outside(p_code, p.user_id);
  return jsonb_build_object('ok', true, 'server_now', now(), 'out_since', v_out);
end $$;

create or replace function public.send_radio(p_code text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare p public.game_players;
begin
  select * into p from public.game_players where game_code = p_code and user_id = auth.uid();
  if p.user_id is null or p.team is null or p.status = 'left' then raise exception 'Radio''s off for you.'; end if;
  if char_length(btrim(p_body)) = 0 then return; end if;
  insert into public.radio (game_code, user_id, name, team, body) values (p_code, p.user_id, p.name, p.team, left(btrim(p_body), 280));
end $$;

-- Hunter says "got you!" → runner gets a confirm prompt.
create or replace function public.request_tag(p_code text, p_runner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.game_players; r public.game_players;
begin
  select * into me from public.game_players where game_code = p_code and user_id = auth.uid();
  select * into r from public.game_players where game_code = p_code and user_id = p_runner;
  if public.gl_game_status(p_code) <> 'hunt' then raise exception 'No tagging right now.'; end if;
  if me.team is distinct from 'hunter' or me.status <> 'active' then raise exception 'Only hunters can tag.'; end if;
  if r.team is distinct from 'runner' or r.status <> 'active' then raise exception 'They''re already out.'; end if;
  if exists (select 1 from public.events where game_code = p_code and kind = 'tag_request' and target = p_runner
             and data ->> 'hunter_id' = me.user_id::text and created_at > now() - interval '10 seconds') then
    return;
  end if;
  perform private.announce(p_code, 'tag_request', 'runner', p_runner, me.name || ' says they tagged you. True?', true,
    jsonb_build_object('hunter_id', me.user_id, 'hunter_name', me.name), false, 'Tagged?');
end $$;

-- Runner confirms they were tagged (either from the prompt or the "I got tagged" button).
create or replace function public.confirm_tag(p_code text, p_hunter uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.game_players; h public.game_players;
begin
  select * into me from public.game_players where game_code = p_code and user_id = auth.uid() for update;
  select * into h from public.game_players where game_code = p_code and user_id = p_hunter;
  if public.gl_game_status(p_code) <> 'hunt' then raise exception 'No tagging right now.'; end if;
  if me.team is distinct from 'runner' or me.status <> 'active' then raise exception 'You''re not a free runner.'; end if;
  if h.team is distinct from 'hunter' then raise exception 'Pick the hunter who got you.'; end if;
  update public.game_players set status = 'tagged', tagged_at = now(), tagged_by = h.user_id, tagged_by_name = h.name
   where game_code = p_code and user_id = me.user_id;
  delete from public.locations where game_code = p_code and user_id = me.user_id;
  delete from public.reveals where game_code = p_code and user_id = me.user_id;
  perform private.announce(p_code, 'tag', 'all', null, 'Tagged: ' || h.name || ' got ' || me.name || '.', true,
    jsonb_build_object('runner_id', me.user_id, 'hunter_id', h.user_id));
  perform private.check_over(p_code);
end $$;

create or replace function public.deny_tag(p_code text, p_hunter uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.game_players;
begin
  select * into me from public.game_players where game_code = p_code and user_id = auth.uid();
  if me.user_id is null then return; end if;
  perform private.announce(p_code, 'tag_denied', 'hunter', p_hunter, me.name || ' says you missed. Ouch.');
end $$;

create or replace function public.leave_game(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare g public.games; me public.game_players;
begin
  select * into g from public.games where code = p_code for update;
  select * into me from public.game_players where game_code = p_code and user_id = auth.uid();
  if me.user_id is null then return; end if;
  if g.status = 'lobby' then
    if g.host_id = me.user_id then
      delete from public.games where code = p_code;  -- host bailed: lobby closes
    else
      delete from public.game_players where game_code = p_code and user_id = me.user_id;
    end if;
    return;
  end if;
  if me.status = 'left' or g.status = 'ended' then return; end if;
  update public.game_players set status = 'left', left_at = now() where game_code = p_code and user_id = me.user_id;
  delete from public.locations where game_code = p_code and user_id = me.user_id;
  delete from public.reveals where game_code = p_code and user_id = me.user_id;
  perform private.announce(p_code, 'left', 'all', null, me.name || ' bailed.');
  perform private.check_over(p_code);
end $$;

create or replace function public.end_game(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare g public.games;
begin
  select * into g from public.games where code = p_code for update;
  if g.host_id is distinct from auth.uid() then raise exception 'Only the host can end the round.'; end if;
  perform private.finish(p_code, 'host');
end $$;

-- Delete my account right now: name, username, email (auth user), history, chat, blocks, push.
create or replace function public.delete_account()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r record;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  for r in select p.game_code from public.game_players p join public.games g on g.code = p.game_code
            where p.user_id = uid and g.status in ('lobby','headstart','hunt') loop
    perform public.leave_game(r.game_code);
  end loop;
  delete from public.games where host_id = uid and status = 'lobby';
  update public.games set host_name = 'Deleted player' where host_id = uid;
  update public.game_players set tagged_by_name = 'Deleted player' where tagged_by = uid;
  update public.pings set positions = (select coalesce(jsonb_agg(case when e ->> 'user_id' = uid::text
      then e - 'initials' || '{"initials":"??"}'::jsonb else e end), '[]'::jsonb) from jsonb_array_elements(positions) e)
   where positions @> jsonb_build_array(jsonb_build_object('user_id', uid));
  delete from public.game_players where user_id = uid;
  delete from public.radio where user_id = uid;
  delete from public.locations where user_id = uid;
  delete from public.reveals where user_id = uid;
  delete from public.reports where reporter = uid;
  delete from public.blocks where blocked = uid;
  delete from auth.users where id = uid;  -- cascades: profile, own block list, push subscriptions
end $$;

-- Everything my phone is allowed to see about a game, in one call. Runs with MY permissions
-- (security invoker), so the row-level security policies above decide what's included.
create or replace function public.game_state(p_code text)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'server_now', now(),
    'game', (select to_jsonb(g) - 'kicked' from public.games g where g.code = p_code),
    'players', coalesce((select jsonb_agg(to_jsonb(p) order by p.joined_at) from public.game_players p where p.game_code = p_code), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(to_jsonb(l)) from public.locations l where l.game_code = p_code), '[]'::jsonb),
    'reveals', coalesce((select jsonb_agg(to_jsonb(v)) from public.reveals v where v.game_code = p_code), '[]'::jsonb),
    'pings', coalesce((select jsonb_agg(to_jsonb(x) order by x.n) from public.pings x where x.game_code = p_code), '[]'::jsonb),
    'radio', coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from
                (select * from public.radio where game_code = p_code order by id desc limit 150) m), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from
                (select * from public.events where game_code = p_code order by id desc limit 60) e), '[]'::jsonb)
  )
$$;

-- ----------------------------------------------------------------------------
-- Who may call which function
-- ----------------------------------------------------------------------------

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public','private')
              and (n.nspname = 'private' or p.proname like 'gl\_%' or p.proname in (
                'push_gone','save_push_subscription','ghostline_configure_push','username_available','keepalive','server_now',
                'create_game','peek_game','join_game','set_pick','set_ready','kick_player','start_game','send_location',
                'send_radio','request_tag','confirm_tag','deny_tag','leave_game','end_game','delete_account','game_state'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.nspname = 'public' then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
grant execute on function public.keepalive() to anon;
grant execute on function public.push_gone(text, text[]) to anon;
revoke execute on function public.ghostline_configure_push(text, text) from authenticated;

-- ----------------------------------------------------------------------------
-- Realtime (so phones hear about changes instantly) and scheduled jobs
-- ----------------------------------------------------------------------------

do $$ declare t text; begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['games','game_players','locations','reveals','pings','radio','events'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('ghostline-tick','ghostline-cleanup','ghostline-trim-cron-log');
    begin
      perform cron.schedule('ghostline-tick', '5 seconds', 'select private.tick()');
    exception when others then
      perform cron.schedule('ghostline-tick', '* * * * *', 'select private.tick()');  -- older pg_cron: once a minute
    end;
    perform cron.schedule('ghostline-cleanup', '17 3 * * *', 'select private.cleanup()');
    perform cron.schedule('ghostline-trim-cron-log', '23 * * * *',
      $q$delete from cron.job_run_details where end_time < now() - interval '1 day'$q$);
  end if;
end $$;
