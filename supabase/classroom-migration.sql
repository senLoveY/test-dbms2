-- Classroom mode: the host shows questions on a big screen and does not play,
-- participants answer from their phones, guests sign in anonymously.
-- Run once in Supabase SQL Editor after perf-migration.sql (safe to re-run).

-- ——— 1. Columns ———

alter table public.rooms
  add column if not exists mode text not null default 'duel';
alter table public.rooms drop constraint if exists rooms_mode_check;
alter table public.rooms
  add constraint rooms_mode_check check (mode in ('duel', 'classroom'));

-- per-room name: profiles.username is unique, two "Саша" in one class must both fit
alter table public.room_players
  add column if not exists nickname text,
  add column if not exists correct_count int not null default 0;
alter table public.room_players drop constraint if exists room_players_nickname_length;
alter table public.room_players
  add constraint room_players_nickname_length
  check (nickname is null or char_length(nickname) between 2 and 20);

create index if not exists rooms_mode_created_idx on public.rooms (mode, created_at);

-- ——— 2. The host of a classroom room is not a player but must see it ———

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
  ) or exists (
    select 1 from public.rooms
    where id = p_room_id and host_id = auth.uid()
  );
$$;

-- ——— 3. Room RPCs ———

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
          'username', coalesce(p.nickname, pr.username, 'Игрок'),
          'score', p.score,
          'correct_count', p.correct_count,
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
  where r.code = upper(p_code)
    and (
      r.host_id = p_user_id
      or exists (select 1 from public.room_players p where p.room_id = r.id and p.user_id = p_user_id)
    );
$$;

drop function if exists public.room_create(text, uuid, uuid, text, int, int, int, jsonb);
create or replace function public.room_create(
  p_code text,
  p_host_id uuid,
  p_quiz_id uuid,
  p_quiz_title text,
  p_time_limit_sec int,
  p_question_count int,
  p_reveal_pause_ms int,
  p_settings jsonb,
  p_mode text default 'duel'
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
    current_index, time_limit_sec, question_count, reveal_pause_ms, settings, mode
  )
  values (
    p_code, p_host_id, p_quiz_id, p_quiz_title, 'waiting', '[]'::jsonb, '[]'::jsonb,
    0, p_time_limit_sec, p_question_count, p_reveal_pause_ms, p_settings, p_mode
  )
  returning id into v_room_id;

  if p_mode = 'duel' then
    insert into public.room_players (room_id, user_id, score) values (v_room_id, p_host_id, 0);
  end if;

  return public.room_state(v_room_id);
end;
$$;

drop function if exists public.room_join(text, uuid, int);
create or replace function public.room_join(
  p_code text,
  p_user_id uuid,
  p_nickname text default null,
  p_guest boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_count int;
  v_max int;
begin
  select * into v_room from public.rooms where code = upper(p_code) for update;
  if not found then
    return jsonb_build_object('error', 'Комната не найдена');
  end if;

  if v_room.mode = 'classroom' and v_room.host_id = p_user_id then
    return public.room_state(v_room.id);
  end if;

  if p_guest and v_room.mode <> 'classroom' then
    return jsonb_build_object('error', 'Для дуэли нужен аккаунт');
  end if;

  if exists (select 1 from public.room_players where room_id = v_room.id and user_id = p_user_id) then
    if p_nickname is not null then
      update public.room_players set nickname = p_nickname
      where room_id = v_room.id and user_id = p_user_id;
    end if;
    return public.room_state(v_room.id);
  end if;

  if v_room.status = 'finished' then
    return jsonb_build_object('error', 'Игра уже закончилась');
  end if;
  -- a class can let latecomers in; a duel can't
  if v_room.status <> 'waiting' and v_room.mode <> 'classroom' then
    return jsonb_build_object('error', 'Игра уже началась');
  end if;

  v_max := case when v_room.mode = 'classroom' then 60 else 2 end;
  select count(*) into v_count from public.room_players where room_id = v_room.id;
  if v_count >= v_max then
    return jsonb_build_object('error', 'Комната заполнена');
  end if;

  if v_room.mode = 'classroom' and exists (
    select 1 from public.room_players
    where room_id = v_room.id and lower(nickname) = lower(p_nickname)
  ) then
    return jsonb_build_object('error', 'Это имя уже занято в комнате');
  end if;

  -- a latecomer sits out the current question instead of answering after the others
  insert into public.room_players (room_id, user_id, score, nickname, has_answered, last_answer, last_answer_correct, last_points)
  values (
    v_room.id, p_user_id, 0, p_nickname,
    v_room.status <> 'waiting',
    case when v_room.status <> 'waiting' then '[]'::jsonb end,
    case when v_room.status <> 'waiting' then false end,
    0
  );
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
    question_deadline_at = now() + make_interval(secs => v_room.time_limit_sec)
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

  update public.rooms set status = 'revealing' where id = v_room.id;
  return true;
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

  -- one student leaving doesn't stop the class; the host isn't a player there
  if v_room.mode = 'classroom' then
    perform public.room_try_reveal_locked(v_room);
    return jsonb_build_object('ok', true);
  end if;

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

create or replace function public.room_kick(p_room_id uuid, p_host_id uuid, p_user_id uuid)
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
  if v_room.host_id <> p_host_id then return jsonb_build_object('error', 'Удалять участников может только ведущий'); end if;
  if v_room.mode <> 'classroom' then return jsonb_build_object('error', 'Только для режима «Класс»'); end if;

  delete from public.room_players where room_id = p_room_id and user_id = p_user_id;
  perform public.room_try_reveal_locked(v_room);
  return public.room_state(p_room_id);
end;
$$;

-- ——— 4. Guests ———

-- Anonymous accounts only live for a lesson; their room rows go with them (cascade).
create or replace function public.purge_guest_users(p_older_than interval default interval '1 day')
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_count int;
begin
  delete from auth.users
  where is_anonymous and created_at < now() - p_older_than;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ——— 5. Only the API (service_role) may call these ———

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.room_state(uuid)',
    'public.room_state_by_code(text, uuid)',
    'public.room_create(text, uuid, uuid, text, int, int, int, jsonb, text)',
    'public.room_join(text, uuid, text, boolean)',
    'public.room_start(uuid, uuid)',
    'public.room_try_reveal_locked(public.rooms)',
    'public.room_leave(uuid, uuid)',
    'public.room_kick(uuid, uuid, uuid)',
    'public.purge_guest_users(interval)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
