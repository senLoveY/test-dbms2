-- Run in Supabase SQL Editor

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'waiting',
  question_ids jsonb not null default '[]'::jsonb,
  current_index int not null default 0,
  time_limit_sec int not null default 30,
  question_count int not null default 20,
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

alter table public.profiles enable row level security;
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
