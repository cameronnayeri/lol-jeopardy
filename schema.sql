-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- Everything is prefixed lj_ so it can share a project with other tables.

create table if not exists lj_games (
  code text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists lj_players (
  id bigserial primary key,
  code text not null references lj_games(code) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (code, name)
);

create table if not exists lj_buzzes (
  id bigserial primary key,          -- monotonic insert order = buzz order
  code text not null references lj_games(code) on delete cascade,
  round text not null,               -- host-generated id for each "buzzers open" window
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists lj_buzzes_code_round_idx on lj_buzzes (code, round, id);

-- Party-game permissions: the anon key can read and write these three tables only.
alter table lj_games enable row level security;
alter table lj_players enable row level security;
alter table lj_buzzes enable row level security;

drop policy if exists "lj anon all games" on lj_games;
drop policy if exists "lj anon all players" on lj_players;
drop policy if exists "lj anon all buzzes" on lj_buzzes;

create policy "lj anon all games" on lj_games for all to anon using (true) with check (true);
create policy "lj anon all players" on lj_players for all to anon using (true) with check (true);
create policy "lj anon all buzzes" on lj_buzzes for all to anon using (true) with check (true);

-- Realtime: push row changes to connected clients.
alter publication supabase_realtime add table lj_games;
alter publication supabase_realtime add table lj_players;
alter publication supabase_realtime add table lj_buzzes;
