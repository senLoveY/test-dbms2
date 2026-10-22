-- Personal data housekeeping. Run once in Supabase SQL Editor after 20261011224432_security.sql
-- (safe to re-run).
--
--   1. A nickname is never derived from the email any more.
--   2. Indexes for the retention cleanup the API runs (old duel rooms, generation log).

-- ——— 1. New users ———

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
begin
  base := left(coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    'игрок_' || substr(md5(new.id::text), 1, 6)
  ), 32);
  candidate := base;

  loop
    begin
      insert into public.profiles (id, username)
      values (new.id, candidate)
      on conflict (id) do nothing;
      return new;
    exception when unique_violation then
      candidate := left(base, 27) || '_' || substr(md5(random()::text), 1, 4);
    end;
  end loop;
end;
$$;

-- ——— 2. Retention ———

create index if not exists rooms_created_idx on public.rooms (created_at);
create index if not exists generation_log_created_idx on public.generation_log (created_at);

-- what the API would clean up anyway, done once now
delete from public.rooms where created_at < now() - interval '30 days';
delete from public.generation_log where created_at < now() - interval '1 day';
