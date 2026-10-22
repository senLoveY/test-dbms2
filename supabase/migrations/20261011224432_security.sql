-- Security hardening. Run once in Supabase SQL Editor after 20261008215348_perf.sql (safe to re-run).
--
-- The browser talks to the database directly only to read its own profile and to receive
-- realtime events; every write goes through the API, which uses service_role and bypasses RLS.
-- So direct access for anon/authenticated is cut down to exactly that.
--
--   1. No direct writes to quizzes, questions or attempts: they skipped the API's limits and
--      validation, and a malformed question in a shared quiz could break other players' games.
--   2. Profiles: users can read only their own row and can't edit it directly
--      (usernames of other players reach the client through the API).
--   3. Duels: opponents' answers are hidden. Members can still see every room_players row,
--      but only the columns the lobby needs; realtime payloads honour column privileges too.
--   4. A log for rate-limiting quiz generation (paid model calls).

-- ——— 1. Content tables: read own, write only through the API ———

drop policy if exists "Owners can insert own quizzes" on public.quizzes;
drop policy if exists "Owners can update own quizzes" on public.quizzes;
drop policy if exists "Owners can delete own quizzes" on public.quizzes;

drop policy if exists "Owners can insert own quiz questions" on public.quiz_questions;
drop policy if exists "Owners can update own quiz questions" on public.quiz_questions;
drop policy if exists "Owners can delete own quiz questions" on public.quiz_questions;

drop policy if exists "Users can insert own attempts" on public.quiz_attempts;

revoke insert, update, delete on public.quizzes, public.quiz_questions, public.quiz_attempts
  from anon, authenticated;

-- ——— 2. Profiles ———

drop policy if exists "Profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
revoke insert, update, delete on public.profiles from anon, authenticated;

-- usernames come from sign-up metadata; keep them sane at the database level
alter table public.profiles drop constraint if exists profiles_username_length;
alter table public.profiles
  add constraint profiles_username_length check (char_length(username) between 1 and 32) not valid;

-- ——— 3. Duels: hide answers from the other player ———

revoke select on public.room_players from anon, authenticated;
grant select (room_id, user_id, score, has_answered) on public.room_players to authenticated;

revoke insert, update, delete on public.rooms, public.room_players from anon, authenticated;

-- ——— 4. Generation rate limit ———

create table if not exists public.generation_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists generation_log_user_idx on public.generation_log (user_id, created_at desc);

alter table public.generation_log enable row level security;
-- no policies: only the API (service_role) reads and writes it
revoke all on public.generation_log from anon, authenticated;
