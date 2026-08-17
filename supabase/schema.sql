-- Run in Supabase SQL Editor

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  created_at timestamptz not null default now()
);

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

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_id uuid not null references public.profiles(id) on delete cascade,
  quiz_id uuid references public.quizzes(id) on delete set null,
  quiz_title text not null default '',
  status text not null default 'waiting',
  question_ids jsonb not null default '[]'::jsonb,
  questions_snapshot jsonb not null default '[]'::jsonb,
  current_index int not null default 0,
  time_limit_sec int not null default 30,
  question_count int not null default 10,
  reveal_pause_ms int not null default 3500,
  settings jsonb not null default '{
    "shuffleOptions": true,
    "autoSubmitOnTimeout": true,
    "partialCredit": true,
    "minTimeFactor": 0.6,
    "maxPointsPerQuestion": 1000
  }'::jsonb,
  question_started_at timestamptz,
  question_deadline_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.room_players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  score int not null default 0,
  has_answered boolean not null default false,
  last_answer jsonb,
  last_answer_correct boolean,
  last_response_ms int,
  last_points int not null default 0,
  primary key (room_id, user_id)
);

create index if not exists rooms_code_idx on public.rooms (code);
create index if not exists quizzes_owner_idx on public.quizzes (owner_id, updated_at desc);
create index if not exists quiz_questions_quiz_idx on public.quiz_questions (quiz_id, sort_order);
create index if not exists quiz_attempts_user_idx on public.quiz_attempts (user_id, quiz_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Owners can view own quizzes"
  on public.quizzes for select
  using (auth.uid() = owner_id);

create policy "Owners can insert own quizzes"
  on public.quizzes for insert
  with check (auth.uid() = owner_id);

create policy "Owners can update own quizzes"
  on public.quizzes for update
  using (auth.uid() = owner_id);

create policy "Owners can delete own quizzes"
  on public.quizzes for delete
  using (auth.uid() = owner_id);

create policy "Owners can view own quiz questions"
  on public.quiz_questions for select
  using (
    exists (
      select 1 from public.quizzes q
      where q.id = quiz_questions.quiz_id and q.owner_id = auth.uid()
    )
  );

create policy "Owners can insert own quiz questions"
  on public.quiz_questions for insert
  with check (
    exists (
      select 1 from public.quizzes q
      where q.id = quiz_questions.quiz_id and q.owner_id = auth.uid()
    )
  );

create policy "Owners can update own quiz questions"
  on public.quiz_questions for update
  using (
    exists (
      select 1 from public.quizzes q
      where q.id = quiz_questions.quiz_id and q.owner_id = auth.uid()
    )
  );

create policy "Owners can delete own quiz questions"
  on public.quiz_questions for delete
  using (
    exists (
      select 1 from public.quizzes q
      where q.id = quiz_questions.quiz_id and q.owner_id = auth.uid()
    )
  );

create policy "Users can view own attempts"
  on public.quiz_attempts for select
  using (auth.uid() = user_id);

create policy "Users can insert own attempts"
  on public.quiz_attempts for insert
  with check (auth.uid() = user_id);

create policy "Room members can view room"
  on public.rooms for select
  using (
    exists (
      select 1 from public.room_players rp
      where rp.room_id = rooms.id and rp.user_id = auth.uid()
    )
  );

create policy "Room members can view players"
  on public.room_players for select
  using (
    exists (
      select 1 from public.room_players rp
      where rp.room_id = room_players.room_id and rp.user_id = auth.uid()
    )
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Realtime: filters on room_id need FULL replica identity
alter table public.rooms replica identity full;
alter table public.room_players replica identity full;

-- Add tables to Realtime publication (run once; skip if already added in Dashboard)
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_players;
