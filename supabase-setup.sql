-- ===========================================================================
-- Run this ONCE in your Supabase project.
-- Dashboard -> SQL Editor -> New query -> paste all of this -> Run.
--
-- What it makes: one table holding one row. That row's `data` column is the
-- whole tracker state as JSON. Every device reads and writes that same row,
-- which is why progress follows you from laptop to phone.
-- ===========================================================================

create table if not exists public.tracker_state (
  id          text primary key,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- The row the app talks to. Must match ROW_ID in config.js (default: 'me').
insert into public.tracker_state (id, data)
values ('me', '{}'::jsonb)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Access. There is no login, so the "anon" role IS you. RLS stays ON and the
-- policies below scope anon to this one table and nothing else in the project.
--
-- Practical meaning: anyone who has both your Supabase URL and your anon key
-- could read and change your tracker progress. Those only ship inside your own
-- deployed page, and the blast radius is a case-comp checklist, so this is a
-- reasonable trade for never seeing a login screen. If you later want it
-- locked down, switch to Supabase Auth magic links and scope by auth.uid().
-- ---------------------------------------------------------------------------
alter table public.tracker_state enable row level security;

-- Postgres needs BOTH a grant and a policy. The grant says "this role may touch
-- this table at all"; the policy says "and here are the rows it may touch".
-- Supabase's "Automatically expose new tables" project setting is what normally
-- issues these grants, and it is off by default (correctly — you want to expose
-- tables deliberately). Granting explicitly here means this script works whatever
-- that setting says, and exposes exactly this one table and nothing else.
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.tracker_state to anon, authenticated;

drop policy if exists "tracker read"   on public.tracker_state;
drop policy if exists "tracker insert" on public.tracker_state;
drop policy if exists "tracker update" on public.tracker_state;

create policy "tracker read"
  on public.tracker_state for select
  to anon, authenticated
  using (true);

create policy "tracker insert"
  on public.tracker_state for insert
  to anon, authenticated
  with check (true);

create policy "tracker update"
  on public.tracker_state for update
  to anon, authenticated
  using (true) with check (true);

-- Deliberately NO delete policy: nothing in the app deletes, so nothing should
-- be able to. Removes the worst-case "someone wipes the row" outcome.

-- Sanity check — should return one row.
select id, updated_at, jsonb_pretty(data) as data from public.tracker_state;
