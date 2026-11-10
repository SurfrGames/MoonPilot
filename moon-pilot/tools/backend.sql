-- Moon Pilot backend (Supabase project "moon-pilot", ref mjzmndrphrjgwozifvrk, region ap-south-1).
-- Applied on 2026-11-11 as migration "leaderboard_and_flights". Kept here as the record.
-- The game's publishable key may INSERT into scores and flights and SELECT the two views. Nothing else.

create table public.scores (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  player_id uuid not null,                       -- random per device, never shown
  name text not null check (char_length(name) between 1 and 16 and name !~ '[<>&"'']'),
  mission text not null check (mission in ('descent','deorbit','launch','full') or mission ~ '^daily-[0-9]{5}$'),
  score int not null check (score between 0 and 4000),
  ok boolean not null,
  seconds real not null check (seconds >= 0 and seconds < 100000),
  fuel real not null check (fuel between 0 and 1),
  coach boolean not null default true
);
create index scores_mission_score on public.scores (mission, score desc);
create index scores_player on public.scores (player_id);

create table public.flights (                    -- only from players who ticked "share my flights"
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  player_id uuid not null,
  mission text not null check (mission in ('descent','deorbit','launch','full') or mission ~ '^daily-[0-9]{5}$'),
  ok boolean not null,
  score int not null check (score between 0 and 4000),
  rows jsonb not null check (jsonb_typeof(rows) = 'array' and pg_column_size(rows) < 300000)
  -- each row: [t, x,y,z, vx,vy,vz, dx,dy,dz, throttle, mass]  (SI units, inertial frame)
);
create index flights_created on public.flights (created_at);

alter table public.scores enable row level security;
alter table public.flights enable row level security;
create policy "anyone can add a score" on public.scores for insert to anon, authenticated with check (true);
create policy "anyone can add a flight" on public.flights for insert to anon, authenticated with check (true);
revoke all on public.scores, public.flights from anon, authenticated;
grant insert on public.scores, public.flights to anon, authenticated;

create view public.leaderboard as                -- best score per player per mission, no player ids
  select distinct on (mission, player_id) mission, name, score, seconds, fuel, coach, created_at
  from public.scores where ok
  order by mission, player_id, score desc, created_at;

create view public.overall as                    -- average of a player's best over the four core missions
  select (array_agg(name order by created_at desc))[1] as name, round(avg(score))::int as score, max(created_at) as created_at
  from (
    select distinct on (mission, player_id) mission, player_id, name, score, created_at
    from public.scores where ok and mission in ('descent','deorbit','launch','full')
    order by mission, player_id, score desc, created_at
  ) best
  group by player_id having count(*) = 4;

revoke all on public.leaderboard, public.overall from anon, authenticated;
grant select on public.leaderboard, public.overall to anon, authenticated;
