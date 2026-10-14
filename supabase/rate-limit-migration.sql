-- Atomic rate limits. Run once in Supabase SQL Editor after security-migration.sql
-- (safe to re-run).
--
-- The old check-then-insert in the API (SELECT count … then INSERT) let two
-- concurrent requests both pass the check before either wrote its row, so a user
-- could exceed the per-hour quiz-generation quota (paid model calls) or the daily
-- challenge limit with a burst of parallel requests. These functions fold the
-- count and the insert into one transaction, serialized per user with an advisory
-- lock, so the limit holds under concurrency.
--
-- Both are SECURITY DEFINER and callable only by service_role (the API).

-- ——— Quiz generation quota (paid DeepSeek calls) ———

create or replace function public.claim_generation_quota(
  p_user_id uuid,
  p_limit int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  -- serialize concurrent claims for the same user; released at transaction end
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select count(*) into v_count
  from public.generation_log
  where user_id = p_user_id
    and created_at >= now() - make_interval(secs => p_window_seconds);

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.generation_log (user_id) values (p_user_id);
  return true;
end;
$$;

-- ——— Challenge creation daily limit ———

create or replace function public.create_challenge_limited(
  p_creator uuid,
  p_quiz_id uuid,
  p_quiz_title text,
  p_questions jsonb,
  p_limit int,
  p_window_seconds int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_id uuid;
begin
  -- distinct advisory-lock namespace (second arg) from the generation quota
  perform pg_advisory_xact_lock(hashtextextended(p_creator::text, 1));

  select count(*) into v_count
  from public.challenges
  where creator_id = p_creator
    and created_at >= now() - make_interval(secs => p_window_seconds);

  if v_count >= p_limit then
    return null;
  end if;

  insert into public.challenges (creator_id, quiz_id, quiz_title, questions)
  values (p_creator, p_quiz_id, p_quiz_title, p_questions)
  returning id into v_id;

  return v_id;
end;
$$;

-- Only the API may call these.
revoke all on function public.claim_generation_quota(uuid, int, int) from public, anon, authenticated;
grant execute on function public.claim_generation_quota(uuid, int, int) to service_role;

revoke all on function public.create_challenge_limited(uuid, uuid, text, jsonb, int, int) from public, anon, authenticated;
grant execute on function public.create_challenge_limited(uuid, uuid, text, jsonb, int, int) to service_role;
