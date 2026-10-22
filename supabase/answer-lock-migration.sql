-- Answers with a short lock: a class answering at once used to take the room row lock
-- one by one and build the whole room state while holding it. Now an answer writes the
-- player's own row and builds its reply first, and holds the room lock only for the
-- "has everyone answered?" check (and, once per question, the reveal).
-- Run once in Supabase SQL Editor (safe to re-run).

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
  v_state jsonb;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if not found then return jsonb_build_object('error', 'Комната не найдена'); end if;
  if v_room.status <> 'playing' or v_room.current_index <> p_index then
    return public.room_state(p_room_id);
  end if;

  -- Only the player's own row. A reveal by the deadline marks unanswered rows itself, so
  -- "not has_answered" lets exactly one of the two writes through; the room check guards
  -- against an answer that arrives after the question has already changed.
  update public.room_players p set
    has_answered = true,
    last_answer = p_answer,
    last_answer_correct = p_correct,
    last_points = p_points,
    last_response_ms = p_response_ms
  where p.room_id = p_room_id and p.user_id = p_user_id and not p.has_answered
    and exists (
      select 1 from public.rooms r
      where r.id = p_room_id and r.status = 'playing' and r.current_index = p_index
    );

  -- the reply is built before the lock, so the lock covers only the check below
  v_state := public.room_state(p_room_id);

  -- Every answer takes the lock *after* writing its row, so whoever gets it last sees
  -- all other answers committed: the check can't miss the moment everyone has answered
  -- (without the lock, simultaneous last answers each saw the others as unanswered).
  -- room_try_reveal_locked re-checks the status, so the set is revealed once.
  select * into v_room from public.rooms where id = p_room_id for update;
  if not exists (select 1 from public.room_players where room_id = p_room_id and not has_answered) then
    if public.room_try_reveal_locked(v_room) then
      return public.room_state(p_room_id);
    end if;
  end if;

  return v_state;
end;
$$;

revoke all on function public.room_submit_answer(uuid, uuid, int, jsonb, boolean, int, int) from public, anon, authenticated;
grant execute on function public.room_submit_answer(uuid, uuid, int, jsonb, boolean, int, int) to service_role;
