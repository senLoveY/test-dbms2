-- Lesson reports for classroom mode: per-question answer counts and final standings,
-- kept for the host after the room itself is purged (a day later).
-- Run once in Supabase SQL Editor after 20261022201004_classroom.sql (safe to re-run).

create table if not exists public.class_reports (
  id uuid primary key default gen_random_uuid(),
  room_id uuid unique references public.rooms(id) on delete set null,
  host_id uuid not null references public.profiles(id) on delete cascade,
  quiz_id uuid references public.quizzes(id) on delete set null,
  quiz_title text not null default '',
  question_total int not null default 0,
  -- one entry per revealed question: text, options, correct, counts per option, answered, correctCount
  questions jsonb not null default '[]'::jsonb,
  -- standings after the last revealed question: name, score, correct
  players jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists class_reports_host_idx on public.class_reports (host_id, created_at desc);

alter table public.class_reports enable row level security;
-- no policies: only the API (service_role) reads it
revoke all on public.class_reports from anon, authenticated;

-- Called at each reveal, while every player's answer to this question is still in room_players.
create or replace function public.class_report_record(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_question jsonb;
  v_entry jsonb;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if not found or v_room.mode <> 'classroom' then return; end if;

  select s.questions -> v_room.current_index into v_question
  from public.room_snapshots s where s.room_id = p_room_id;
  if v_question is null then return; end if;

  v_entry := jsonb_build_object(
    'index', v_room.current_index,
    -- with these the report shows options in the order the class saw them (lib/classReport.js)
    'id', v_question -> 'id',
    'shuffled', coalesce((v_room.settings ->> 'shuffleOptions')::boolean, true),
    'type', v_question -> 'type',
    'text', v_question -> 'text',
    'options', v_question -> 'options',
    'correct', v_question -> 'correct',
    'counts', (
      select coalesce(jsonb_agg((
        select count(*) from public.room_players p
        where p.room_id = p_room_id and p.last_answer @> to_jsonb(o.ord - 1)
      ) order by o.ord), '[]'::jsonb)
      from jsonb_array_elements(v_question -> 'options') with ordinality as o(value, ord)
    ),
    'players', (select count(*) from public.room_players where room_id = p_room_id),
    'answered', (
      select count(*) from public.room_players
      where room_id = p_room_id and jsonb_array_length(coalesce(last_answer, '[]'::jsonb)) > 0
    ),
    'correctCount', (
      select count(*) from public.room_players where room_id = p_room_id and last_answer_correct
    )
  );

  insert into public.class_reports (room_id, host_id, quiz_id, quiz_title)
  values (p_room_id, v_room.host_id, v_room.quiz_id, v_room.quiz_title)
  on conflict (room_id) do nothing;

  update public.class_reports set
    question_total = jsonb_array_length(v_room.question_ids),
    -- a repeated reveal of the same question replaces its entry instead of adding one
    questions = coalesce((
      select jsonb_agg(e.value)
      from jsonb_array_elements(questions) as e(value)
      where (e.value ->> 'index')::int <> v_room.current_index
    ), '[]'::jsonb) || jsonb_build_array(v_entry),
    players = coalesce((
      select jsonb_agg(
        jsonb_build_object('name', coalesce(p.nickname, pr.username, 'Игрок'), 'score', p.score, 'correct', p.correct_count)
        order by p.score desc, coalesce(p.nickname, pr.username)
      )
      from public.room_players p
      left join public.profiles pr on pr.id = p.user_id
      where p.room_id = p_room_id
    ), '[]'::jsonb),
    updated_at = now()
  where room_id = p_room_id;
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
    'public.class_report_record(uuid)',
    'public.room_try_reveal_locked(public.rooms)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
