-- Async challenges ("вызов по ссылке"). Run once in Supabase SQL Editor (safe to re-run).
-- Both tables are API-only: RLS on, no policies, no grants for anon/authenticated.

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  quiz_id uuid references public.quizzes(id) on delete set null,
  quiz_title text not null default '',
  -- frozen questions with correct answers; never sent to players before they finish
  questions jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_results (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  correct int not null default 0,
  total int not null default 0,
  duration_ms int,
  answers jsonb not null default '[]'::jsonb,
  primary key (challenge_id, user_id)
);

create index if not exists challenges_creator_idx on public.challenges (creator_id, created_at desc);
create index if not exists challenge_results_user_idx on public.challenge_results (user_id);

alter table public.challenges enable row level security;
alter table public.challenge_results enable row level security;
revoke all on public.challenges, public.challenge_results from anon, authenticated;
