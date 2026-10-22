-- Push instead of pull for classroom phones: the room row carries what a phone needs
-- to show (the open question without its answers; after the reveal the right options
-- and the scores), and Realtime already delivers the row, so phones stop calling the
-- API on every question change.
-- Run once in Supabase SQL Editor after class-reports-migration.sql and
-- answer-lock-migration.sql (safe to re-run).

alter table public.rooms
  add column if not exists public_question jsonb,
  add column if not exists public_reveal jsonb;

-- The open question for members to see: no "correct". Options stay in quiz order;
-- clients apply the same seeded shuffle the API uses (lib/gameLogic.js).
create or replace function public.room_public_question(p_snapshot jsonb, p_index int)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case when p_snapshot -> p_index is null then null else
    jsonb_build_object('index', p_index, 'question', (p_snapshot -> p_index) - 'correct')
  end;
$$;

-- After a reveal: the right options (by label) and everyone's standing. Names and scores
-- are what the projector shows anyway; the options people picked stay private.
create or replace function public.room_public_reveal(p_room_id uuid, p_index int)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'index', p_index,
    'correctOptions', coalesce((
      select jsonb_agg(q.question -> 'options' -> (c.value)::int)
      from (select s.questions -> p_index as question from public.room_snapshots s where s.room_id = p_room_id) q,
           jsonb_array_elements_text(q.question -> 'correct') c
    ), '[]'::jsonb),
    'standings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.user_id,
        'name', coalesce(p.nickname, pr.username, 'Игрок'),
        'score', p.score,
        'round', p.last_points,
        'ok', coalesce(p.last_answer_correct, false),
        'skipped', jsonb_array_length(coalesce(p.last_answer, '[]'::jsonb)) = 0
      ))
      from public.room_players p
      left join public.profiles pr on pr.id = p.user_id
      where p.room_id = p_room_id
    ), '[]'::jsonb)
  );
$$;

create or replace function public.room_start(p_room_id uuid, p_host_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_snapshot jsonb;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then return jsonb_build_object('error', 'Комната не найдена'); end if;
  if v_room.host_id <> p_host_id then return jsonb_build_object('error', 'Начать игру может только хост'); end if;
  if v_room.status <> 'waiting' then return public.room_state(p_room_id); end if;
  if v_room.mode = 'classroom' then
    if not exists (select 1 from public.room_players where room_id = p_room_id) then
      return jsonb_build_object('error', 'Пока никто не подключился');
    end if;
  elsif (select count(*) from public.room_players where room_id = p_room_id) < 2 then
    return jsonb_build_object('error', 'Нужно два игрока');
  end if;
  if v_room.quiz_id is null then return jsonb_build_object('error', 'Тест удалён'); end if;

  select coalesce(jsonb_agg(
    jsonb_build_object('id', q.id, 'type', q.type, 'text', q.text, 'options', q.options, 'correct', q.correct)
    order by q.rnd
  ), '[]'::jsonb)
  into v_snapshot
  from (
    select id, type, text, options, correct, random() as rnd
    from public.quiz_questions
    where quiz_id = v_room.quiz_id
    order by rnd
    limit greatest(1, v_room.question_count)
  ) q;

  if jsonb_array_length(v_snapshot) = 0 then
    return jsonb_build_object('error', 'В тесте нет вопросов');
  end if;

  insert into public.room_snapshots (room_id, questions) values (p_room_id, v_snapshot)
  on conflict (room_id) do update set questions = excluded.questions;

  update public.rooms set
    status = 'playing',
    question_ids = (
      select jsonb_agg(e.value -> 'id' order by e.ord)
      from jsonb_array_elements(v_snapshot) with ordinality as e(value, ord)
    ),
    current_index = 0,
    question_count = jsonb_array_length(v_snapshot),
    question_started_at = now(),
    question_deadline_at = now() + make_interval(
      secs => v_room.time_limit_sec + public.question_reading_bonus(v_snapshot -> 0)
    ),
    public_question = public.room_public_question(v_snapshot, 0),
    public_reveal = null
  where id = p_room_id;

  update public.room_players set
    score = 0,
    correct_count = 0,
    has_answered = false,
    last_points = 0,
    last_answer = null,
    last_answer_correct = null,
    last_response_ms = null
  where room_id = p_room_id;

  return public.room_state(p_room_id);
end;
$$;

create or replace function public.room_advance(p_room_id uuid, p_host_id uuid, p_index int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_next int;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then return jsonb_build_object('error', 'Комната не найдена'); end if;
  if v_room.host_id <> p_host_id then return jsonb_build_object('error', 'Переключает вопросы только хост'); end if;
  -- stale or duplicate request: just report current state
  if v_room.status <> 'revealing' or v_room.current_index <> p_index then
    return public.room_state(p_room_id);
  end if;

  v_next := v_room.current_index + 1;

  if v_next >= jsonb_array_length(v_room.question_ids) then
    update public.rooms set status = 'finished', current_index = v_next where id = p_room_id;
    return public.room_state(p_room_id);
  end if;

  update public.rooms set
    status = 'playing',
    current_index = v_next,
    question_started_at = now(),
    question_deadline_at = now() + make_interval(
      secs => v_room.time_limit_sec + public.question_reading_bonus(
        (select s.questions -> v_next from public.room_snapshots s where s.room_id = p_room_id)
      )
    ),
    public_question = public.room_public_question(
      (select s.questions from public.room_snapshots s where s.room_id = p_room_id), v_next
    ),
    public_reveal = null
  where id = p_room_id;

  update public.room_players set
    has_answered = false,
    last_points = 0,
    last_answer = null,
    last_answer_correct = null,
    last_response_ms = null
  where room_id = p_room_id;

  return public.room_state(p_room_id);
end;
$$;

create or replace function public.room_try_reveal_locked(v_room public.rooms)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if v_room.status <> 'playing' then return false; end if;

  if exists (select 1 from public.room_players where room_id = v_room.id and not has_answered) then
    if now() < v_room.question_deadline_at then return false; end if;

    update public.room_players set
      has_answered = true,
      last_answer = '[]'::jsonb,
      last_answer_correct = false,
      last_response_ms = v_room.time_limit_sec * 1000,
      last_points = 0
    where room_id = v_room.id and not has_answered;
  end if;

  update public.room_players set
    score = score + last_points,
    correct_count = correct_count + case when last_answer_correct then 1 else 0 end
  where room_id = v_room.id and (last_points > 0 or last_answer_correct);

  update public.rooms set
    status = 'revealing',
    public_reveal = public.room_public_reveal(v_room.id, v_room.current_index)
  where id = v_room.id;

  if v_room.mode = 'classroom' then
    perform public.class_report_record(v_room.id);
  end if;
  return true;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.room_public_question(jsonb, int)',
    'public.room_public_reveal(uuid, int)',
    'public.room_start(uuid, uuid)',
    'public.room_advance(uuid, uuid, int)',
    'public.room_try_reveal_locked(public.rooms)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
