-- Run in Supabase SQL Editor for existing projects

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  tags jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  visibility text not null default 'private' check (visibility in ('private', 'unlisted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  sort_order int not null default 0,
  type text not null check (type in ('single', 'multiple')),
  text text not null,
  options jsonb not null default '[]'::jsonb,
  correct jsonb not null default '[]'::jsonb
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  score int not null default 0,
  total int not null default 0,
  answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.rooms
  add column if not exists quiz_id uuid references public.quizzes(id) on delete set null;

alter table public.rooms
  add column if not exists quiz_title text not null default '';

alter table public.rooms
  add column if not exists questions_snapshot jsonb not null default '[]'::jsonb;

create index if not exists quizzes_owner_idx on public.quizzes (owner_id, updated_at desc);
create index if not exists quiz_questions_quiz_idx on public.quiz_questions (quiz_id, sort_order);
create index if not exists quiz_attempts_user_idx on public.quiz_attempts (user_id, quiz_id, created_at desc);

alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;

drop policy if exists "Owners can view own quizzes" on public.quizzes;
create policy "Owners can view own quizzes"
  on public.quizzes for select
  using (auth.uid() = owner_id);

drop policy if exists "Owners can insert own quizzes" on public.quizzes;
create policy "Owners can insert own quizzes"
  on public.quizzes for insert
  with check (auth.uid() = owner_id);

drop policy if exists "Owners can update own quizzes" on public.quizzes;
create policy "Owners can update own quizzes"
  on public.quizzes for update
  using (auth.uid() = owner_id);

drop policy if exists "Owners can delete own quizzes" on public.quizzes;
create policy "Owners can delete own quizzes"
  on public.quizzes for delete
  using (auth.uid() = owner_id);

drop policy if exists "Owners can view own quiz questions" on public.quiz_questions;
create policy "Owners can view own quiz questions"
  on public.quiz_questions for select
  using (
    exists (
      select 1 from public.quizzes q
      where q.id = quiz_questions.quiz_id and q.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners can insert own quiz questions" on public.quiz_questions;
create policy "Owners can insert own quiz questions"
  on public.quiz_questions for insert
  with check (
    exists (
      select 1 from public.quizzes q
      where q.id = quiz_questions.quiz_id and q.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners can update own quiz questions" on public.quiz_questions;
create policy "Owners can update own quiz questions"
  on public.quiz_questions for update
  using (
    exists (
      select 1 from public.quizzes q
      where q.id = quiz_questions.quiz_id and q.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners can delete own quiz questions" on public.quiz_questions;
create policy "Owners can delete own quiz questions"
  on public.quiz_questions for delete
  using (
    exists (
      select 1 from public.quizzes q
      where q.id = quiz_questions.quiz_id and q.owner_id = auth.uid()
    )
  );

drop policy if exists "Users can view own attempts" on public.quiz_attempts;
create policy "Users can view own attempts"
  on public.quiz_attempts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own attempts" on public.quiz_attempts;
create policy "Users can insert own attempts"
  on public.quiz_attempts for insert
  with check (auth.uid() = user_id);
