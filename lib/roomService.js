import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { generateRoomCode } from "./roomCode.js";
import {
  buildOptionOrder,
  getCorrectOptions,
  getPublicQuestion,
  getQuestionShuffleKey,
  getSelectedAnswerBreakdown,
  gradeAnswerDetailed,
  mapDisplayIndicesToOriginal,
} from "./gameLogic.js";
import { computePoints } from "./scoring.js";
import { normalizeRoomSettings, parseRoomRecord, settingsToDbColumns } from "./roomSettings.js";
import { getQuizMeta } from "./quizService.js";

const MAX_PLAYERS = 2;
const UNIQUE_VIOLATION = "23505";

async function rpc(name, args) {
  const { data, error } = await getSupabaseAdmin().rpc(name, args);
  if (error) throw error;
  return data;
}

/** RPCs return either a raw room state or `{ error }`. */
function fromRaw(raw, userId) {
  if (!raw) return { error: "Комната не найдена" };
  if (raw.error) return { error: raw.error };
  return { state: buildRoomView(raw, userId) };
}

function clampQuestionCount(requested, maxQuestions) {
  const settings = normalizeRoomSettings({ questionCount: requested });
  return Math.min(settings.questionCount, Math.max(1, maxQuestions));
}

function optionOrderFor(roomId, room, question, settings) {
  if (!settings.shuffleOptions) return question.options.map((_, index) => index);
  return buildOptionOrder(
    question.options.length,
    getQuestionShuffleKey(roomId, room.current_index, question.id)
  );
}

/**
 * Shapes the raw `room_state` RPC result for one viewer.
 * Opponent answers stay hidden until the reveal.
 */
export function buildRoomView(raw, userId) {
  const { room, question, players: rawPlayers } = raw;
  const settings = parseRoomRecord(room);
  const revealing = room.status === "revealing";
  const showRoundPoints = revealing || room.status === "finished";
  const fullQuestion =
    question && (room.status === "playing" || revealing) ? question : null;

  const players = (rawPlayers || []).map((player) => {
    const isMe = player.user_id === userId;
    const visible = isMe || showRoundPoints;
    return {
      user_id: player.user_id,
      username: player.username,
      score: player.score,
      has_answered: player.has_answered,
      last_answer: visible ? player.last_answer : null,
      last_answer_correct: visible ? player.last_answer_correct : null,
      last_points: visible ? player.last_points : 0,
      last_response_ms: visible ? player.last_response_ms : null,
      roundPoints: showRoundPoints ? player.last_points : null,
      answerBreakdown:
        revealing && fullQuestion
          ? getSelectedAnswerBreakdown(fullQuestion, player.last_answer)
          : null,
    };
  });

  const currentQuestion = fullQuestion
    ? getPublicQuestion(
        fullQuestion,
        settings.shuffleOptions
          ? getQuestionShuffleKey(room.id, room.current_index, fullQuestion.id)
          : null
      )
    : null;

  const reveal =
    revealing && fullQuestion
      ? { correctOptions: getCorrectOptions(fullQuestion), questionId: fullQuestion.id }
      : null;

  return {
    room,
    settings,
    players,
    currentQuestion,
    reveal,
    showPlayerAnswers: Boolean(reveal),
    serverTime: Date.now(),
    quiz: {
      id: room.quiz_id,
      title: room.quiz_title,
      questionCount: raw.quiz_question_total ?? 0,
    },
  };
}

function isMember(raw, userId) {
  return (raw?.players || []).some((player) => player.user_id === userId);
}

export async function getRoomState({ roomId, code }, userId) {
  const raw = roomId
    ? await rpc("room_state", { p_room_id: roomId })
    : await rpc("room_state_by_code", { p_code: code, p_user_id: userId });

  if (!raw || !isMember(raw, userId)) return { error: "Вы не участник этой комнаты" };
  return { state: buildRoomView(raw, userId) };
}

export async function createRoom(hostId, settingsInput = {}, quizId) {
  if (!quizId) return { error: "Выберите тест" };

  const loaded = await getQuizMeta(quizId, hostId);
  if (loaded.error) return loaded;
  if (loaded.quiz.status !== "published") {
    return { error: "Опубликуйте тест, чтобы создать состязание" };
  }
  if (!loaded.quiz.questionCount) return { error: "В тесте нет вопросов" };

  const dbSettings = settingsToDbColumns({
    ...settingsInput,
    questionCount: clampQuestionCount(settingsInput.questionCount, loaded.quiz.questionCount),
  });

  // Codes are random; on the rare collision the unique index rejects and we retry.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await getSupabaseAdmin().rpc("room_create", {
      p_code: generateRoomCode(),
      p_host_id: hostId,
      p_quiz_id: loaded.quiz.id,
      p_quiz_title: loaded.quiz.title,
      p_time_limit_sec: dbSettings.time_limit_sec,
      p_question_count: dbSettings.question_count,
      p_reveal_pause_ms: dbSettings.reveal_pause_ms,
      p_settings: dbSettings.settings,
    });
    if (!error) return fromRaw(data, hostId);
    if (error.code !== UNIQUE_VIOLATION) throw error;
  }

  return { error: "Не удалось создать комнату, попробуйте ещё раз" };
}

export async function joinRoom(code, userId) {
  const raw = await rpc("room_join", {
    p_code: String(code).trim().toUpperCase(),
    p_user_id: userId,
    p_max_players: MAX_PLAYERS,
  });
  return fromRaw(raw, userId);
}

export async function updateRoomSettings(roomId, hostId, settingsInput) {
  const supabase = getSupabaseAdmin();

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, host_id, status, quiz_id")
    .eq("id", roomId)
    .maybeSingle();

  if (roomError) throw roomError;
  if (!room) return { error: "Комната не найдена" };
  if (room.host_id !== hostId) return { error: "Настройки меняет только хост" };
  if (room.status !== "waiting") return { error: "Игра уже началась" };

  let questionTotal = 1;
  if (room.quiz_id) {
    const { count, error } = await supabase
      .from("quiz_questions")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", room.quiz_id);
    if (error) throw error;
    questionTotal = count || 1;
  }

  const dbSettings = settingsToDbColumns({
    ...settingsInput,
    questionCount: clampQuestionCount(settingsInput.questionCount, questionTotal),
  });

  const { data: updated, error } = await supabase
    .from("rooms")
    .update(dbSettings)
    .eq("id", roomId)
    .eq("host_id", hostId)
    .eq("status", "waiting")
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!updated) return { error: "Игра уже началась" };

  return getRoomState({ roomId }, hostId);
}

export async function leaveRoom(roomId, userId) {
  return rpc("room_leave", { p_room_id: roomId, p_user_id: userId });
}

export async function endGameEarly(roomId, hostId) {
  const { data, error } = await getSupabaseAdmin()
    .from("rooms")
    .update({ status: "finished" })
    .eq("id", roomId)
    .eq("host_id", hostId)
    .in("status", ["playing", "revealing"])
    .select("id");

  if (error) throw error;
  if (!data?.length) return { error: "Игра не идёт или вы не хост" };
  return getRoomState({ roomId }, hostId);
}

export async function startGame(roomId, hostId) {
  const raw = await rpc("room_start", { p_room_id: roomId, p_host_id: hostId });
  return fromRaw(raw, hostId);
}

export async function submitAnswer(roomId, userId, selected) {
  const raw = await rpc("room_state", { p_room_id: roomId });
  if (!raw || !isMember(raw, userId)) return { error: "Вы не участник этой комнаты" };

  const { room, question } = raw;
  const me = raw.players.find((player) => player.user_id === userId);
  if (room.status !== "playing" || !question || me.has_answered) {
    return { state: buildRoomView(raw, userId) };
  }

  const settings = parseRoomRecord(room);
  const optionOrder = optionOrderFor(roomId, room, question, settings);
  const validDisplay = [...new Set(selected)].filter(
    (index) => Number.isInteger(index) && index >= 0 && index < optionOrder.length
  );
  const originalSelected = mapDisplayIndicesToOriginal(validDisplay, optionOrder);

  const grade = gradeAnswerDetailed(question, originalSelected, {
    partialCredit: settings.partialCredit,
  });
  const responseMs = Math.max(0, Date.now() - new Date(room.question_started_at).getTime());
  const points = computePoints(grade.scoreRatio, settings.timeLimitSec * 1000, responseMs, {
    minTimeFactor: settings.minTimeFactor,
    maxPoints: settings.maxPointsPerQuestion,
  });

  const next = await rpc("room_submit_answer", {
    p_room_id: roomId,
    p_user_id: userId,
    p_index: room.current_index,
    p_answer: originalSelected,
    p_correct: grade.isFullyCorrect,
    p_points: points,
    p_response_ms: responseMs,
  });
  return fromRaw(next, userId);
}

export async function handleTimeout(roomId, userId) {
  const raw = await rpc("room_timeout", { p_room_id: roomId });
  if (!raw || !isMember(raw, userId)) return { error: "Вы не участник этой комнаты" };
  return { state: buildRoomView(raw, userId) };
}

export async function advanceQuestion(roomId, hostId, index) {
  const raw = await rpc("room_advance", {
    p_room_id: roomId,
    p_host_id: hostId,
    p_index: Number.isInteger(index) ? index : -1,
  });
  return fromRaw(raw, hostId);
}
