-- Reading time: a long question (text + options) gets extra seconds on its timer.
-- Run once in Supabase SQL Editor after classroom-migration.sql (safe to re-run).
-- The formula mirrors lib/readingTime.js; tests/readingTime.test.js keeps them in sync.

create or replace function public.question_reading_bonus(p_question jsonb)
returns int
language sql
immutable
set search_path = public
as $$
  select least(30, ceil(greatest(0,
    char_length(coalesce(p_question ->> 'text', ''))
    + coalesce((select sum(char_length(o)) from jsonb_array_elements_text(p_question -> 'options') o), 0)
    - 150
  ) / 15.0))::int;
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
    )
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
    )
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

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.question_reading_bonus(jsonb)',
    'public.room_start(uuid, uuid)',
    'public.room_advance(uuid, uuid, int)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
