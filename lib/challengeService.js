import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { getQuiz } from "./quizService.js";
import {
  CHALLENGE_LIMITS,
  buildChallengeSnapshot,
  challengeDeadlineMs,
  challengeQuestionCount,
  gradeChallenge,
  rankResults,
  toPublicQuestions,
} from "./challenge.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CHALLENGES_PER_DAY = 30;

export async function createChallenge(userId, { quizId, count } = {}) {
  if (!quizId) return { error: "Выберите тест" };
  const loaded = await getQuiz(quizId, userId);
  if (loaded.error) return { error: "Тест недоступен" };
  const questions = loaded.quiz.questions || [];
  if (!questions.length) return { error: "В тесте нет вопросов" };

  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recent, error: countError } = await supabase
    .from("challenges")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", userId)
    .gte("created_at", since);
  if (countError) throw countError;
  if ((recent || 0) >= MAX_CHALLENGES_PER_DAY) {
    return { error: `Можно создать не больше ${MAX_CHALLENGES_PER_DAY} вызовов в сутки` };
  }

  const snapshot = buildChallengeSnapshot(questions, challengeQuestionCount(count, questions.length));
  const { data, error } = await supabase
    .from("challenges")
    .insert({ creator_id: userId, quiz_id: quizId, quiz_title: loaded.quiz.title, questions: snapshot })
    .select("id")
    .single();
  if (error) throw error;
  return { challenge: { id: data.id } };
}

async function loadChallenge(id) {
  if (!UUID.test(String(id))) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("challenges")
    .select(
      "id, creator_id, quiz_id, quiz_title, questions, created_at, creator:profiles(username), challenge_results(user_id, started_at, finished_at, correct, total, duration_ms, answers, player:profiles(username))"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * What one player may see. Before finishing: the questions only once started, without
 * answers. After finishing: the full review plus everyone's per-question results.
 */
function buildView(row, userId) {
  const snapshot = row.questions || [];
  const results = row.challenge_results || [];
  const mine = results.find((result) => result.user_id === userId);
  const finished = Boolean(mine?.finished_at);

  const leaderboard = rankResults(
    results
      .filter((result) => result.finished_at)
      .map((result) => ({
        userId: result.user_id,
        username: result.player?.username || "игрок",
        isMe: result.user_id === userId,
        isCreator: result.user_id === row.creator_id,
        correct: result.correct,
        total: result.total,
        durationMs: result.duration_ms,
        finishedAt: result.finished_at,
        // per-question marks only for people who already finished themselves
        marks: finished ? (result.answers || []).map((item) => Boolean(item?.ok)) : null,
      }))
  );

  const view = {
    id: row.id,
    quizId: row.quiz_id,
    quizTitle: row.quiz_title,
    creator: row.creator?.username || "",
    isCreator: row.creator_id === userId,
    questionCount: snapshot.length,
    secondsPerQuestion: CHALLENGE_LIMITS.secondsPerQuestion,
    createdAt: row.created_at,
    participants: results.length,
    leaderboard,
    status: finished ? "finished" : mine ? "started" : "new",
  };

  if (mine && !finished) {
    view.questions = toPublicQuestions(snapshot);
    view.startedAt = mine.started_at;
  }

  if (finished) {
    view.mine = { correct: mine.correct, total: mine.total, durationMs: mine.duration_ms };
    view.review = snapshot.map((question, index) => ({
      ...question,
      selected: mine.answers?.[index]?.selected || [],
      ok: Boolean(mine.answers?.[index]?.ok),
    }));
  }

  return view;
}

export async function getChallenge(id, userId) {
  const row = await loadChallenge(id);
  if (!row) return { error: "Вызов не найден" };
  return { challenge: buildView(row, userId) };
}

export async function startChallenge(id, userId) {
  const row = await loadChallenge(id);
  if (!row) return { error: "Вызов не найден" };

  const results = row.challenge_results || [];
  if (!results.some((result) => result.user_id === userId)) {
    if (results.length >= CHALLENGE_LIMITS.maxParticipants) return { error: "Этот вызов уже прошло максимум игроков" };
    const { error } = await getSupabaseAdmin()
      .from("challenge_results")
      .upsert({ challenge_id: id, user_id: userId }, { onConflict: "challenge_id,user_id", ignoreDuplicates: true });
    if (error) throw error;
  }
  return getChallenge(id, userId);
}

export async function submitChallenge(id, userId, answers) {
  const row = await loadChallenge(id);
  if (!row) return { error: "Вызов не найден" };
  const mine = (row.challenge_results || []).find((result) => result.user_id === userId);
  if (!mine) return { error: "Сначала начните вызов" };
  if (mine.finished_at) return { challenge: buildView(row, userId) };

  const graded = gradeChallenge(row.questions || [], Array.isArray(answers) ? answers : []);
  const elapsed = Date.now() - new Date(mine.started_at).getTime();
  // Past the overall deadline the run still counts, at the deadline's time.
  const durationMs = Math.max(0, Math.min(elapsed, challengeDeadlineMs(graded.total)));

  const { error } = await getSupabaseAdmin()
    .from("challenge_results")
    .update({
      finished_at: new Date().toISOString(),
      correct: graded.correct,
      total: graded.total,
      duration_ms: durationMs,
      answers: graded.items,
    })
    .eq("challenge_id", id)
    .eq("user_id", userId)
    .is("finished_at", null);
  if (error) throw error;

  return getChallenge(id, userId);
}
