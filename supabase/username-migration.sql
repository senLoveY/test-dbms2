-- Run in Supabase SQL Editor
-- On a username collision add a short suffix instead of failing the sign-up.

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
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    split_part(new.email, '@', 1)
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
