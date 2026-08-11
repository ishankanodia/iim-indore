-- ===========================================================================
-- Run this ONCE in your Supabase project.
-- Dashboard -> SQL Editor -> New query -> paste all of this -> Run.
-- Re-running it is safe: everything is create-if-not-exists / or-replace.
--
-- What it makes:
--   tracker_users  one row per person. Serial number, name, bcrypt-hashed PIN,
--                  and a login token. Anon CANNOT read this table at all —
--                  every path in and out is a function below.
--   tracker_state  one row per person, id = 'u<serial>'. That row's `data`
--                  column is that person's whole progress blob as JSON.
--
-- Content (competitions, mess, timetable) stays in git. Only progress and
-- accounts live here.
-- ===========================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- PROGRESS. One row per user, keyed 'u1', 'u2', ... The single-user 'me' row
-- from before this change is left alone; the app lifts it into 'u1' the first
-- time user 1 signs in, so nothing is lost.
-- ---------------------------------------------------------------------------
create table if not exists public.tracker_state (
  id          text primary key,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

insert into public.tracker_state (id, data)
values ('me', '{}'::jsonb)
on conflict (id) do nothing;

alter table public.tracker_state enable row level security;

-- Postgres needs BOTH a grant and a policy. The grant says "this role may touch
-- this table at all"; the policy says "and here are the rows it may touch".
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

-- Deliberately NO delete policy: nothing in the app deletes progress directly.
-- Removing a user deletes their row through a security-definer function below,
-- which bypasses policies, so anon still never gets a delete verb.

-- ---------------------------------------------------------------------------
-- ACCOUNTS.
--
-- Names and PINs are held to a different standard than progress. The anon key
-- ships inside the page, so anything anon can SELECT is effectively public —
-- therefore anon is granted nothing on this table and there are no policies on
-- it. The only way in is the four security-definer functions below, which run
-- as the table owner and hand back exactly what the caller is entitled to.
--
-- PINs are stored as bcrypt hashes (pgcrypto crypt/gen_salt) and are never
-- returned by anything. A forgotten PIN cannot be recovered, only the account
-- removed and made again.
-- ---------------------------------------------------------------------------
create table if not exists public.tracker_users (
  serial     integer     primary key,
  name       text        not null,
  pin_hash   text        not null,
  token      uuid        not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);

alter table public.tracker_users enable row level security;
revoke all on public.tracker_users from anon, authenticated;

-- Sign up. Assigns the next serial number: the first person to sign up is 1,
-- and 1 is the admin. Returns the serial and a login token.
create or replace function public.tracker_signup(p_name text, p_pin text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_name   text;
  v_serial integer;
  v_token  uuid;
  v_try    integer := 0;
begin
  v_name := btrim(coalesce(p_name, ''));
  if length(v_name) < 2 then
    raise exception 'Please enter your name.';
  end if;
  if p_pin !~ '^[0-9]{6}$' then
    raise exception 'PIN must be exactly 6 digits.';
  end if;

  -- max+1 can collide if two people tap Create at the same instant; retry.
  loop
    v_try := v_try + 1;
    begin
      select coalesce(max(serial), 0) + 1 into v_serial from public.tracker_users;
      insert into public.tracker_users (serial, name, pin_hash)
        values (v_serial, v_name, crypt(p_pin, gen_salt('bf')))
        returning token into v_token;
      exit;
    exception when unique_violation then
      if v_try >= 5 then raise; end if;
    end;
  end loop;

  return json_build_object('serial', v_serial, 'name', v_name, 'token', v_token);
end $$;

-- Sign in. Wrong serial and wrong PIN give the same message on purpose, so the
-- form cannot be used to enumerate who exists.
create or replace function public.tracker_login(p_serial integer, p_pin text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r public.tracker_users%rowtype;
begin
  select * into r from public.tracker_users where serial = p_serial;
  if not found or r.pin_hash <> crypt(coalesce(p_pin,''), r.pin_hash) then
    raise exception 'That number and PIN do not match.';
  end if;
  update public.tracker_users set last_seen = now() where serial = r.serial;
  return json_build_object('serial', r.serial, 'name', r.name, 'token', r.token);
end $$;

-- Resume a saved session and stamp last_seen. Also how the app notices that an
-- account it remembers has since been removed.
create or replace function public.tracker_touch(p_serial integer, p_token uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r public.tracker_users%rowtype;
begin
  select * into r from public.tracker_users where serial = p_serial and token = p_token;
  if not found then
    raise exception 'This device is signed in to an account that no longer exists.';
  end if;
  update public.tracker_users set last_seen = now() where serial = r.serial;
  return json_build_object('serial', r.serial, 'name', r.name, 'admin', r.serial = 1);
end $$;

-- The user list, for serial 1 only. Never returns pin_hash or token.
create or replace function public.tracker_users_list(p_serial integer, p_token uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_serial is distinct from 1
     or not exists (select 1 from public.tracker_users where serial = 1 and token = p_token) then
    raise exception 'Only user 1 can see the user list.';
  end if;
  return coalesce((
    select json_agg(json_build_object(
             'serial', u.serial, 'name', u.name,
             'created_at', u.created_at, 'last_seen', u.last_seen,
             'has_progress', exists (select 1 from public.tracker_state s
                                      where s.id = 'u' || u.serial
                                        and s.data ? 'comps'))
           order by u.serial)
    from public.tracker_users u), '[]'::json);
end $$;

-- Remove a user, and their progress with them. Serial 1 cannot be removed —
-- there would be no admin left. Serials are never reused.
create or replace function public.tracker_user_remove(p_serial integer, p_token uuid, p_target integer)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_name text;
begin
  if p_serial is distinct from 1
     or not exists (select 1 from public.tracker_users where serial = 1 and token = p_token) then
    raise exception 'Only user 1 can remove users.';
  end if;
  if p_target = 1 then
    raise exception 'User 1 cannot be removed.';
  end if;
  delete from public.tracker_users where serial = p_target returning name into v_name;
  if v_name is null then
    raise exception 'No user number %.', p_target;
  end if;
  delete from public.tracker_state where id = 'u' || p_target;
  return json_build_object('serial', p_target, 'name', v_name);
end $$;

grant execute on function public.tracker_signup(text, text)                to anon, authenticated;
grant execute on function public.tracker_login(integer, text)              to anon, authenticated;
grant execute on function public.tracker_touch(integer, uuid)              to anon, authenticated;
grant execute on function public.tracker_users_list(integer, uuid)         to anon, authenticated;
grant execute on function public.tracker_user_remove(integer, uuid, integer) to anon, authenticated;

-- PostgREST caches the list of callable functions. Supabase usually reloads it
-- on its own after DDL; this makes sure, and is what to re-run if the app ever
-- says it "could not find the function ... in the schema cache".
notify pgrst, 'reload schema';

-- Sanity check — accounts (no secrets) and the progress rows beside them.
select u.serial, u.name, u.created_at, u.last_seen,
       (select s.updated_at from public.tracker_state s where s.id = 'u' || u.serial) as progress_updated
from public.tracker_users u order by u.serial;
