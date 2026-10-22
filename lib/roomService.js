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
import { getQuizAccess } from "./quizService.js";
import { daysAgo, RETENTION } from "./privacy.js";
import { readingBonusSec } from "./readingTime.js";
import { buildClassroomView, normalizeNickname, normalizeRoomMode } from "./classroom.js";

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

  const common = {
    room,
    settings,
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

  if (room.mode === "classroom") {
    return buildClassroomView(
      { room, settings, question: fullQuestion, players: rawPlayers || [] },
      userId,
      common
    );
  }

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

  return { ...common, viewer: { isHost: room.host_id === userId, mode: "duel" }, players };
}

/** In a classroom the host isn't a player but still sees the room. */
function isMember(raw, userId) {
  if (raw?.room?.host_id === userId) return true;
  return (raw?.players || []).some((player) => player.user_id === userId);
}

export async function getRoomState({ roomId, code }, userId) {
  const raw = roomId
    ? await rpc("room_state", { p_room_id: roomId })
    : await rpc("room_state_by_code", { p_code: code, p_user_id: userId });

  if (!raw || !isMember(raw, userId)) return { error: "Вы не участник этой комнаты" };
  return { state: buildRoomView(raw, userId) };
}

/** Finished or abandoned duels hold other players' answers; they aren't needed after a while. */
async function purgeStaleRooms() {
  const supabase = getSupabaseAdmin();
  const [rooms, classes, guests] = await Promise.all([
    supabase.from("rooms").delete().lt("created_at", daysAgo(RETENTION.roomDays)),
    // a class room holds the names of everyone who joined: keep it for a day only
    supabase
      .from("rooms")
      .delete()
      .eq("mode", "classroom")
      .lt("created_at", daysAgo(RETENTION.classroomDays)),
    supabase.rpc("purge_guest_users", { p_older_than: `${RETENTION.guestHours} hours` }),
  ]);
  for (const { error } of [rooms, classes, guests]) {
    if (error) console.warn("Could not purge old rooms or guests:", error.message);
  }
}

export async function createRoom(hostId, settingsInput = {}, quizId, modeInput) {
  if (!quizId) return { error: "Выберите тест" };
  const mode = normalizeRoomMode(modeInput);

  const loaded = await getQuizAccess(quizId, hostId);
  if (loaded.error) return { error: loaded.error === "Quiz not found" ? "Тест не найден" : "Этот тест вам недоступен" };
  if (loaded.quiz.status !== "published") {
    return { error: "Опубликуйте тест, чтобы создать состязание" };
  }
  if (!loaded.quiz.questionCount) return { error: "В тесте нет вопросов" };

  const dbSettings = settingsToDbColumns({
    ...settingsInput,
    questionCount: clampQuestionCount(settingsInput.questionCount, loaded.quiz.questionCount),
  });

  await purgeStaleRooms();

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
      p_mode: mode,
    });
    if (!error) return fromRaw(data, hostId);
    if (error.code !== UNIQUE_VIOLATION) throw error;
  }

  return { error: "Не удалось создать комнату, попробуйте ещё раз" };
}

/** Guests (anonymous sign-in) can only join a classroom room, and need a name for it. */
export async function joinRoom(code, userId, { nickname, guest = false } = {}) {
  let name = null;
  if (nickname != null || guest) {
    const checked = normalizeNickname(nickname);
    if (checked.error) return checked;
    name = checked.nickname;
  }

  const raw = await rpc("room_join", {
    p_code: String(code).trim().toUpperCase(),
    p_user_id: userId,
    p_nickname: name,
    p_guest: guest,
  });
  return fromRaw(raw, userId);
}

export async function kickPlayer(roomId, hostId, userId) {
  if (!userId) return { error: "Кого удалить?" };
  const raw = await rpc("room_kick", { p_room_id: roomId, p_host_id: hostId, p_user_id: userId });
  return fromRaw(raw, hostId);
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

/**
 * Rematch after a finished game: same quiz, same rules, fresh room.
 * The new code is written into the old room's settings json, so the opponent
 * gets it through realtime and can follow with one tap. If both press the
 * button at once, the second caller joins the first one's room.
 */
export async function requestRematch(roomId, userId) {
  const raw = await rpc("room_state", { p_room_id: roomId });
  if (!raw || !isMember(raw, userId)) return { error: "Вы не участник этой комнаты" };

  const { room } = raw;
  if (room.mode === "classroom") return { error: "Реванш есть только в дуэли" };
  if (room.status !== "finished") return { error: "Игра ещё не закончилась" };
  if (room.settings?.rematchCode) return joinRoom(room.settings.rematchCode, userId);
  if (!room.quiz_id) return { error: "Тест удалён" };

  const created = await createRoom(userId, parseRoomRecord(room), room.quiz_id);
  if (created.error) return created;
  const code = created.state.room.code;

  const { data: claimed, error } = await getSupabaseAdmin()
    .from("rooms")
    .update({ settings: { ...(room.settings || {}), rematchCode: code } })
    .eq("id", roomId)
    .is("settings->>rematchCode", null)
    .select("id");
  if (error) throw error;
  if (claimed?.length) return created;

  // Lost the race: drop our empty room and follow the other player's one.
  await leaveRoom(created.state.room.id, userId);
  const latest = await rpc("room_state", { p_room_id: roomId });
  const winner = latest?.room?.settings?.rematchCode;
  return winner ? joinRoom(winner, userId) : { error: "Не удалось создать реванш" };
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
    // a class lobby can be closed before it starts, so latecomers can't wander in
    .in("status", ["waiting", "playing", "revealing"])
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
  if (!me) return { error: "Ведущий не отвечает на вопросы" };
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
  // the deadline includes reading time for long questions; reading it doesn't cost speed points
  const thinkingMs = Math.max(0, responseMs - readingBonusSec(question) * 1000);
  const points = computePoints(grade.scoreRatio, settings.timeLimitSec * 1000, thinkingMs, {
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
