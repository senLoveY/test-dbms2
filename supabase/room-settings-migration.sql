-- Run in Supabase SQL Editor for existing projects

alter table public.rooms
  add column if not exists question_count int not null default 20;

alter table public.rooms
  add column if not exists reveal_pause_ms int not null default 3500;

alter table public.rooms
  add column if not exists settings jsonb not null default '{
    "shuffleOptions": true,
    "autoSubmitOnTimeout": true,
    "partialCredit": true,
    "minTimeFactor": 0.6,
    "maxPointsPerQuestion": 1000
  }'::jsonb;
