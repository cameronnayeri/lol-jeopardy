-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).

create table if not exists games (
  code text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists players (
  id bigserial primary key,
  code text not null references games(code) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (code, name)
);

create table if not exists buzzes (
  id bigserial primary key,          -- monotonic insert order = buzz order
  code text not null references games(code) on delete cascade,
  round text not null,               -- host-generated id for each "buzzers open" window
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists buzzes_code_round_idx on buzzes (code, round, id);

-- Party-game permissions: the anon key can read and write everything.
-- Fine for friends; do not reuse this project for anything you care about.
alter table games enable row level security;
alter table players enable row level security;
alter table buzzes enable row level security;

drop policy if exists "anon all games" on games;
drop policy if exists "anon all players" on players;
drop policy if exists "anon all buzzes" on buzzes;

create policy "anon all games" on games for all to anon using (true) with check (true);
create policy "anon all players" on players for all to anon using (true) with check (true);
create policy "anon all buzzes" on buzzes for all to anon using (true) with check (true);

-- Realtime: push row changes to connected clients.
alter publication supabase_realtime add table games;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table buzzes;
