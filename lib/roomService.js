import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { generateRoomCode } from "./roomCode.js";
import {
  DEFAULT_TIME_LIMIT_SEC,
  buildQuestionOrder,
  getPublicQuestion,
  getQuestionById,
  gradeAnswer,
  getCorrectOptions,
} from "./gameLogic.js";
import { computePoints } from "./scoring.js";

const MAX_PLAYERS = 2;

export async function createRoom(hostId) {
  const supabase = getSupabaseAdmin();
  let code = generateRoomCode();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: existing } = await supabase
      .from("rooms")
      .select("id")
      .eq("code", code)
      .maybeSingle();

    if (!existing) break;
    code = generateRoomCode();
  }

  const { data: room, error } = await supabase
    .from("rooms")
    .insert({
      code,
      host_id: hostId,
      status: "waiting",
      question_ids: [],
      current_index: 0,
      time_limit_sec: DEFAULT_TIME_LIMIT_SEC,
    })
    .select("*")
    .single();

  if (error) throw error;

  const { error: playerError } = await supabase.from("room_players").insert({
    room_id: room.id,
    user_id: hostId,
    score: 0,
  });

  if (playerError) throw playerError;

  return room;
}

export async function joinRoom(code, userId) {
  const supabase = getSupabaseAdmin();

  const { data: room, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (error) throw error;
  if (!room) return { error: "Room not found" };
  if (room.status !== "waiting") return { error: "Game already started" };

  const { data: players } = await supabase
    .from("room_players")
    .select("user_id")
    .eq("room_id", room.id);

  const alreadyJoined = players?.some((p) => p.user_id === userId);
  if (!alreadyJoined && (players?.length || 0) >= MAX_PLAYERS) {
    return { error: "Room is full" };
  }

  if (!alreadyJoined) {
    const { error: insertError } = await supabase.from("room_players").insert({
      room_id: room.id,
      user_id: userId,
      score: 0,
    });
    if (insertError) throw insertError;
  }

  return { room };
}

export async function getRoomState(roomId) {
  const supabase = getSupabaseAdmin();

  const { data: room, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .single();

  if (error) throw error;

  const { data: players, error: playersError } = await supabase
    .from("room_players")
    .select("user_id, score, has_answered, last_points, last_answer_correct")
    .eq("room_id", roomId);

  if (playersError) throw playersError;

  const userIds = players.map((p) => p.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", userIds);

  const profileMap = Object.fromEntries(
    (profiles || []).map((p) => [p.id, p.username])
  );

  const enrichedPlayers = players.map((p) => ({
    ...p,
    username: profileMap[p.user_id] || "Player",
  }));

  let currentQuestion = null;
  if (room.status === "playing" || room.status === "revealing") {
    const questionId = room.question_ids[room.current_index];
    currentQuestion = getPublicQuestion(questionId);
  }

  let reveal = null;
  if (room.status === "revealing") {
    const questionId = room.question_ids[room.current_index];
    reveal = {
      correctOptions: getCorrectOptions(questionId),
      questionId,
    };
  }

  return {
    room,
    players: enrichedPlayers,
    currentQuestion,
    reveal,
  };
}

export async function startGame(roomId, hostId) {
  const supabase = getSupabaseAdmin();

  const { data: room } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .single();

  if (!room) return { error: "Room not found" };
  if (room.host_id !== hostId) return { error: "Only host can start the game" };
  if (room.status !== "waiting") return { error: "Game already started" };

  const { data: players } = await supabase
    .from("room_players")
    .select("user_id")
    .eq("room_id", roomId);

  if ((players?.length || 0) < 2) {
    return { error: "Need at least 2 players to start" };
  }

  const questionIds = buildQuestionOrder();
  const now = new Date();
  const deadline = new Date(now.getTime() + room.time_limit_sec * 1000);

  const { error } = await supabase
    .from("rooms")
    .update({
      status: "playing",
      question_ids: questionIds,
      current_index: 0,
      question_started_at: now.toISOString(),
      question_deadline_at: deadline.toISOString(),
    })
    .eq("id", roomId);

  if (error) throw error;

  await supabase
    .from("room_players")
    .update({
      has_answered: false,
      last_points: 0,
      last_answer: null,
      last_answer_correct: null,
      last_response_ms: null,
    })
    .eq("room_id", roomId);

  return { ok: true };
}

export async function submitAnswer(roomId, userId, selected) {
  const supabase = getSupabaseAdmin();

  const { data: room } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .single();

  if (!room) return { error: "Room not found" };
  if (room.status !== "playing") return { error: "Question is not active" };

  const { data: player } = await supabase
    .from("room_players")
    .select("*")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .single();

  if (!player) return { error: "You are not in this room" };
  if (player.has_answered) return { error: "Already answered" };

  const questionId = room.question_ids[room.current_index];
  const isCorrect = gradeAnswer(questionId, selected);
  const startedAt = new Date(room.question_started_at).getTime();
  const responseMs = Math.max(0, Date.now() - startedAt);
  const points = computePoints(
    isCorrect,
    room.time_limit_sec * 1000,
    responseMs
  );

  const { error: updateError } = await supabase
    .from("room_players")
    .update({
      has_answered: true,
      last_answer: selected,
      last_answer_correct: isCorrect,
      last_response_ms: responseMs,
      last_points: points,
      score: player.score + points,
    })
    .eq("room_id", roomId)
    .eq("user_id", userId);

  if (updateError) throw updateError;

  return advanceIfReady(roomId);
}

export async function handleTimeout(roomId) {
  const supabase = getSupabaseAdmin();

  const { data: room } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .single();

  if (!room || room.status !== "playing") return { ok: true };

  const deadline = new Date(room.question_deadline_at).getTime();
  if (Date.now() < deadline) return { ok: true };

  const { data: players } = await supabase
    .from("room_players")
    .select("user_id, has_answered")
    .eq("room_id", roomId);

  for (const player of players || []) {
    if (!player.has_answered) {
      await supabase
        .from("room_players")
        .update({
          has_answered: true,
          last_answer: [],
          last_answer_correct: false,
          last_response_ms: room.time_limit_sec * 1000,
          last_points: 0,
        })
        .eq("room_id", roomId)
        .eq("user_id", player.user_id);
    }
  }

  return advanceIfReady(roomId, true);
}

async function advanceIfReady(roomId, forceReveal = false) {
  const supabase = getSupabaseAdmin();

  const { data: room } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .single();

  if (!room || room.status !== "playing") return { ok: true };

  const { data: players } = await supabase
    .from("room_players")
    .select("has_answered")
    .eq("room_id", roomId);

  const allAnswered = (players || []).every((p) => p.has_answered);
  const deadlinePassed =
    forceReveal || Date.now() >= new Date(room.question_deadline_at).getTime();

  if (!allAnswered && !deadlinePassed) {
    return { ok: true, waiting: true };
  }

  if (!allAnswered && deadlinePassed) {
    await handleTimeout(roomId);
    return { ok: true };
  }

  await supabase
    .from("rooms")
    .update({ status: "revealing" })
    .eq("id", roomId);

  return { ok: true, revealing: true };
}

export async function advanceQuestion(roomId, hostId) {
  const supabase = getSupabaseAdmin();

  const { data: room } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .single();

  if (!room) return { error: "Room not found" };
  if (room.host_id !== hostId) return { error: "Only host can advance" };
  if (room.status !== "revealing") return { error: "Not in reveal phase" };

  const nextIndex = room.current_index + 1;

  if (nextIndex >= room.question_ids.length) {
    await supabase
      .from("rooms")
      .update({ status: "finished", current_index: nextIndex })
      .eq("id", roomId);
    return { ok: true, finished: true };
  }

  const now = new Date();
  const deadline = new Date(now.getTime() + room.time_limit_sec * 1000);

  await supabase
    .from("rooms")
    .update({
      status: "playing",
      current_index: nextIndex,
      question_started_at: now.toISOString(),
      question_deadline_at: deadline.toISOString(),
    })
    .eq("id", roomId);

  await supabase
    .from("room_players")
    .update({
      has_answered: false,
      last_points: 0,
      last_answer: null,
      last_answer_correct: null,
      last_response_ms: null,
    })
    .eq("room_id", roomId);

  return { ok: true, finished: false };
}
