-- Performance + consistency migration. Run once in Supabase SQL Editor (safe to re-run).
--
-- What it does:
--   1. Moves room question snapshots (with correct answers) out of `rooms` into a
--      private table: realtime payloads get small and clients can no longer read answers.
--   2. Fixes the self-referencing RLS policy on room_players (infinite recursion
--      silently broke realtime, so the app was living on polling).
--   3. Adds RPC functions so every game action is one atomic round trip and
--      round scores can't be applied twice when both players answer at once.
--   4. Adds an atomic quiz save (meta + questions in one transaction).
--
-- All functions are SECURITY DEFINER and executable only by service_role (the API).

-- ——— 1. Private question snapshots ———

create table if not exists public.room_snapshots (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  questions jsonb not null default '[]'::jsonb
);

alter table public.room_snapshots enable row level security;
-- no policies: only service_role (bypasses RLS) can read it

insert into public.room_snapshots (room_id, questions)
select id, questions_snapshot
from public.rooms
where jsonb_array_length(questions_snapshot) > 0
on conflict (room_id) do nothing;

update public.rooms
set questions_snapshot = '[]'::jsonb
where jsonb_array_length(questions_snapshot) > 0;

-- ——— 2. Membership helper + non-recursive policies ———

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_players
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

drop policy if exists "Room members can view room" on public.rooms;
create policy "Room members can view room"
  on public.rooms for select
  using (public.is_room_member(id));

drop policy if exists "Room members can view players" on public.room_players;
create policy "Room members can view players"
  on public.room_players for select
  using (public.is_room_member(room_id));

create index if not exists room_players_user_idx on public.room_players (user_id);

-- ——— 3. Room RPCs ———

-- Full room view for the API: room row, the current question (with answers),
-- players with usernames and the quiz question total. One round trip.
create or replace function public.room_state(p_room_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'room', to_jsonb(r) - 'questions_snapshot',
    'question',
      case when r.status in ('playing', 'revealing')
        then (select s.questions -> r.current_index from public.room_snapshots s where s.room_id = r.id)
      end,
    'players', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', p.user_id,
          'username', coalesce(pr.username, 'Игрок'),
          'score', p.score,
          'has_answered', p.has_answered,
          'last_answer', p.last_answer,
          'last_answer_correct', p.last_answer_correct,
          'last_response_ms', p.last_response_ms,
          'last_points', p.last_points
        )
        order by (p.user_id = r.host_id) desc, p.user_id
      )
      from public.room_players p
      left join public.profiles pr on pr.id = p.user_id
      where p.room_id = r.id
    ), '[]'::jsonb),
    'quiz_question_total',
      case when r.quiz_id is not null
        then (select count(*) from public.quiz_questions q where q.quiz_id = r.quiz_id)
        else jsonb_array_length(r.question_ids)
      end
  )
  from public.rooms r
  where r.id = p_room_id;
$$;

create or replace function public.room_state_by_code(p_code text, p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.room_state(r.id)
  from public.rooms r
  join public.room_players p on p.room_id = r.id and p.user_id = p_user_id
  where r.code = upper(p_code);
$$;

create or replace function public.room_create(
  p_code text,
  p_host_id uuid,
  p_quiz_id uuid,
  p_quiz_title text,
  p_time_limit_sec int,
  p_question_count int,
  p_reveal_pause_ms int,
  p_settings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
begin
  insert into public.rooms (
    code, host_id, quiz_id, quiz_title, status, question_ids, questions_snapshot,
    current_index, time_limit_sec, question_count, reveal_pause_ms, settings
  )
  values (
    p_code, p_host_id, p_quiz_id, p_quiz_title, 'waiting', '[]'::jsonb, '[]'::jsonb,
    0, p_time_limit_sec, p_question_count, p_reveal_pause_ms, p_settings
  )
  returning id into v_room_id;

  insert into public.room_players (room_id, user_id, score) values (v_room_id, p_host_id, 0);

  return public.room_state(v_room_id);
end;
$$;

create or replace function public.room_join(p_code text, p_user_id uuid, p_max_players int default 2)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_count int;
begin
  select * into v_room from public.rooms where code = upper(p_code) for update;
  if not found then
    return jsonb_build_object('error', 'Комната не найдена');
  end if;

  if exists (select 1 from public.room_players where room_id = v_room.id and user_id = p_user_id) then
    return public.room_state(v_room.id);
  end if;

  if v_room.status <> 'waiting' then
    return jsonb_build_object('error', 'Игра уже началась');
  end if;

  select count(*) into v_count from public.room_players where room_id = v_room.id;
  if v_count >= p_max_players then
    return jsonb_build_object('error', 'Комната заполнена');
  end if;

  insert into public.room_players (room_id, user_id, score) values (v_room.id, p_user_id, 0);
  return public.room_state(v_room.id);
end;
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
  if (select count(*) from public.room_players where room_id = p_room_id) < 2 then
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
    question_deadline_at = now() + make_interval(secs => v_room.time_limit_sec)
  where id = p_room_id;

  update public.room_players set
    score = 0,
    has_answered = false,
    last_points = 0,
    last_answer = null,
    last_answer_correct = null,
    last_response_ms = null
  where room_id = p_room_id;

  return public.room_state(p_room_id);
end;
$$;

-- Moves the room to "revealing" if everyone answered or the deadline passed.
-- Caller must already hold the room row lock.
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

  update public.room_players set score = score + last_points
  where room_id = v_room.id and last_points > 0;

  update public.rooms set status = 'revealing' where id = v_room.id;
  return true;
end;
$$;

create or replace function public.room_submit_answer(
  p_room_id uuid,
  p_user_id uuid,
  p_index int,
  p_answer jsonb,
  p_correct boolean,
  p_points int,
  p_response_ms int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then return jsonb_build_object('error', 'Комната не найдена'); end if;
  if v_room.status <> 'playing' or v_room.current_index <> p_index then
    return public.room_state(p_room_id);
  end if;

  update public.room_players set
    has_answered = true,
    last_answer = p_answer,
    last_answer_correct = p_correct,
    last_points = p_points,
    last_response_ms = p_response_ms
  where room_id = p_room_id and user_id = p_user_id and not has_answered;

  perform public.room_try_reveal_locked(v_room);
  return public.room_state(p_room_id);
end;
$$;

create or replace function public.room_timeout(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if found then
    perform public.room_try_reveal_locked(v_room);
  end if;
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
    question_deadline_at = now() + make_interval(secs => v_room.time_limit_sec)
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

create or replace function public.room_leave(p_room_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_next_host uuid;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then return jsonb_build_object('ok', true); end if;

  delete from public.room_players where room_id = p_room_id and user_id = p_user_id;
  if not found then return jsonb_build_object('ok', true); end if;

  if v_room.status in ('playing', 'revealing') then
    update public.rooms set status = 'finished' where id = p_room_id;
    return jsonb_build_object('ok', true, 'gameEnded', true);
  end if;

  if v_room.status = 'waiting' then
    select user_id into v_next_host from public.room_players where room_id = p_room_id limit 1;
    if v_next_host is null then
      delete from public.rooms where id = p_room_id;
      return jsonb_build_object('ok', true, 'roomDeleted', true);
    end if;
    if v_room.host_id = p_user_id then
      update public.rooms set host_id = v_next_host where id = p_room_id;
    end if;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- ——— 4. Quizzes ———

-- Atomic save: meta + full question list. Returns null if quiz isn't owned by p_owner_id.
create or replace function public.quiz_save(
  p_quiz_id uuid,
  p_owner_id uuid,
  p_title text,
  p_description text,
  p_tags jsonb,
  p_status text,
  p_visibility text,
  p_questions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz public.quizzes%rowtype;
begin
  update public.quizzes set
    title = p_title,
    description = p_description,
    tags = p_tags,
    status = p_status,
    visibility = p_visibility,
    updated_at = now()
  where id = p_quiz_id and owner_id = p_owner_id
  returning * into v_quiz;

  if not found then return null; end if;

  delete from public.quiz_questions where quiz_id = p_quiz_id;

  insert into public.quiz_questions (quiz_id, sort_order, type, text, options, correct)
  select p_quiz_id, (q.ord - 1)::int, q.value ->> 'type', q.value ->> 'text', q.value -> 'options', q.value -> 'correct'
  from jsonb_array_elements(p_questions) with ordinality as q(value, ord);

  return jsonb_build_object(
    'quiz', to_jsonb(v_quiz),
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', id, 'type', type, 'text', text, 'options', options, 'correct', correct)
        order by sort_order
      )
      from public.quiz_questions where quiz_id = p_quiz_id
    ), '[]'::jsonb)
  );
end;
$$;

-- ——— Permissions: API (service_role) only ———

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.room_state(uuid)',
    'public.room_state_by_code(text, uuid)',
    'public.room_create(text, uuid, uuid, text, int, int, int, jsonb)',
    'public.room_join(text, uuid, int)',
    'public.room_start(uuid, uuid)',
    'public.room_try_reveal_locked(public.rooms)',
    'public.room_submit_answer(uuid, uuid, int, jsonb, boolean, int, int)',
    'public.room_timeout(uuid)',
    'public.room_advance(uuid, uuid, int)',
    'public.room_leave(uuid, uuid)',
    'public.quiz_save(uuid, uuid, text, text, jsonb, text, text, jsonb)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
