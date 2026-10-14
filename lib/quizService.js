import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { RETENTION } from "./privacy.js";
import {
  GENERATE_LIMITS,
  QUIZ_LIMITS,
  canPlayQuiz,
  getPublishErrors,
  normalizeQuestions,
  normalizeQuizMeta,
} from "./quizModel.js";
import {
  buildProgress,
  isPracticeAttempt,
  sanitizeAttemptAnswers,
  toStoredAnswers,
} from "./progress.js";

const QUIZ_COLUMNS = "id, owner_id, title, description, tags, status, visibility, created_at, updated_at";

function mapQuizRow(row, questionCount = 0) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    tags: row.tags || [],
    status: row.status,
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    questionCount,
  };
}

function mapQuestionRow(row) {
  return {
    id: row.id,
    type: row.type,
    text: row.text,
    options: row.options,
    correct: row.correct,
  };
}

function embeddedCount(row) {
  return row.quiz_questions?.[0]?.count ?? 0;
}

export async function listQuizzes(ownerId) {
  const { data, error } = await getSupabaseAdmin()
    .from("quizzes")
    .select(`${QUIZ_COLUMNS}, quiz_questions(count)`)
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data || []).map((row) => mapQuizRow(row, embeddedCount(row)));
}

/** Lightweight ownership check: quiz row + question count, no question bodies. */
export async function getQuizMeta(quizId, ownerId) {
  const { data: quiz, error } = await getSupabaseAdmin()
    .from("quizzes")
    .select(`${QUIZ_COLUMNS}, quiz_questions(count)`)
    .eq("id", quizId)
    .maybeSingle();

  if (error) throw error;
  if (!quiz) return { error: "Quiz not found" };
  if (quiz.owner_id !== ownerId) return { error: "Forbidden" };
  return { quiz: mapQuizRow(quiz, embeddedCount(quiz)) };
}

/** Owners always; everyone else only for published link-only quizzes. */
function accessError(quiz, userId) {
  if (!quiz) return "Quiz not found";
  if (canPlayQuiz(quiz, userId)) return null;
  return quiz.visibility === "unlisted" ? "Not shared" : "Forbidden";
}

function withAccess(row, userId, questionCount) {
  return {
    ...mapQuizRow(row, questionCount),
    ...(row.owner_id === userId ? { ownerId: row.owner_id } : {}),
    isOwner: row.owner_id === userId,
    author: row.author?.username || "",
  };
}

/** Quiz the user may play (own or shared by link), without question bodies. */
export async function getQuizAccess(quizId, userId) {
  const { data: quiz, error } = await getSupabaseAdmin()
    .from("quizzes")
    .select(`${QUIZ_COLUMNS}, author:profiles(username), quiz_questions(count)`)
    .eq("id", quizId)
    .maybeSingle();

  if (error) throw error;
  const denied = accessError(quiz, userId);
  if (denied) return { error: denied };
  return { quiz: withAccess(quiz, userId, embeddedCount(quiz)) };
}

export async function getQuiz(quizId, userId) {
  const { data: quiz, error } = await getSupabaseAdmin()
    .from("quizzes")
    .select(
      `${QUIZ_COLUMNS}, author:profiles(username), quiz_questions(id, type, text, options, correct, sort_order)`
    )
    .eq("id", quizId)
    .order("sort_order", { referencedTable: "quiz_questions", ascending: true })
    .maybeSingle();

  if (error) throw error;
  const denied = accessError(quiz, userId);
  if (denied) return { error: denied };

  const questions = quiz.quiz_questions || [];
  return {
    quiz: {
      ...withAccess(quiz, userId, questions.length),
      questions: questions.map(mapQuestionRow),
    },
  };
}

const UNDEFINED_TABLE = "42P01";
const UNDEFINED_FUNCTION = "42883";
const GENERATION_WINDOW_SEC = 60 * 60;

/**
 * Model calls are paid, so each user gets a budget per hour.
 * The count and the insert happen atomically in one transaction (claim_generation_quota),
 * serialized per user, so parallel requests can't slip past the limit together.
 * Skips the check if the log table / function isn't migrated yet.
 */
export async function claimGenerationQuota(userId) {
  const supabase = getSupabaseAdmin();

  const { data: allowed, error } = await supabase.rpc("claim_generation_quota", {
    p_user_id: userId,
    p_limit: GENERATE_LIMITS.perHour,
    p_window_seconds: GENERATION_WINDOW_SEC,
  });

  if (error?.code === UNDEFINED_TABLE || error?.code === UNDEFINED_FUNCTION) {
    console.warn("claim_generation_quota is missing: run supabase/rate-limit-migration.sql");
    return { ok: true };
  }
  if (error) throw error;
  if (!allowed) {
    return { error: `Лимит генерации — ${GENERATE_LIMITS.perHour} в час. Попробуйте позже.` };
  }

  // only the last hour matters for the limit; older entries are just a usage history
  const staleBefore = new Date(Date.now() - RETENTION.generationLogHours * 60 * 60 * 1000).toISOString();
  await supabase.from("generation_log").delete().lt("created_at", staleBefore);
  return { ok: true };
}

export async function createQuiz(ownerId, input = {}) {
  const supabase = getSupabaseAdmin();

  const { count, error: countError } = await supabase
    .from("quizzes")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId);

  if (countError) throw countError;
  if ((count || 0) >= QUIZ_LIMITS.maxQuizzesPerUser) {
    return { error: `Можно создать не больше ${QUIZ_LIMITS.maxQuizzesPerUser} тестов` };
  }

  const meta = normalizeQuizMeta({ ...input, status: "draft" });

  const { data: quiz, error } = await supabase
    .from("quizzes")
    .insert({
      owner_id: ownerId,
      title: meta.title,
      description: meta.description,
      tags: meta.tags,
      status: "draft",
      visibility: meta.visibility,
    })
    .select(QUIZ_COLUMNS)
    .single();

  if (error) throw error;

  return { quiz: { ...mapQuizRow(quiz, 0), questions: [] } };
}

async function saveQuiz(quizId, ownerId, meta, questions) {
  const { data, error } = await getSupabaseAdmin().rpc("quiz_save", {
    p_quiz_id: quizId,
    p_owner_id: ownerId,
    p_title: meta.title,
    p_description: meta.description,
    p_tags: meta.tags,
    p_status: meta.status,
    p_visibility: meta.visibility,
    p_questions: questions.map(({ type, text, options, correct }) => ({
      type,
      text,
      options,
      correct,
    })),
  });

  if (error) throw error;
  if (!data) return null;

  return {
    quiz: {
      ...mapQuizRow(data.quiz, data.questions.length),
      questions: data.questions,
    },
  };
}

const META_FIELDS = ["title", "description", "tags", "status", "visibility"];

export async function updateQuiz(quizId, ownerId, input = {}) {
  // The editor always sends the full quiz; only partial updates need the current row.
  const isPartial =
    !Array.isArray(input.questions) || META_FIELDS.some((field) => input[field] === undefined);

  let base = {};
  if (isPartial) {
    const current = await getQuiz(quizId, ownerId);
    if (current.error) return current;
    if (!current.quiz.isOwner) return { error: "Forbidden" };
    base = current.quiz;
  }

  const meta = normalizeQuizMeta({ ...base, ...input });
  const questions = normalizeQuestions(input.questions ?? base.questions);

  if (meta.status === "published") {
    const publishErrors = getPublishErrors(questions);
    if (publishErrors.length) return { error: publishErrors[0] };
  }

  const saved = await saveQuiz(quizId, ownerId, meta, questions);
  if (saved) return saved;

  // Nothing updated: tell "missing" apart from "not yours".
  const check = await getQuizMeta(quizId, ownerId);
  return check.error ? check : { error: "Quiz not found" };
}

export async function deleteQuiz(quizId, ownerId) {
  const { data, error } = await getSupabaseAdmin()
    .from("quizzes")
    .delete()
    .eq("id", quizId)
    .eq("owner_id", ownerId)
    .select("id");

  if (error) throw error;
  if (!data?.length) {
    const check = await getQuizMeta(quizId, ownerId);
    return check.error ? check : { error: "Quiz not found" };
  }
  return { ok: true };
}

/** Copies an own quiz, or saves someone else's shared quiz into the caller's library. */
export async function duplicateQuiz(quizId, ownerId) {
  const current = await getQuiz(quizId, ownerId);
  if (current.error) return current;

  const created = await createQuiz(ownerId, {
    title: current.quiz.isOwner ? `${current.quiz.title} (копия)` : current.quiz.title,
    description: current.quiz.description,
    tags: current.quiz.tags,
    visibility: current.quiz.isOwner ? current.quiz.visibility : "private",
  });
  if (created.error) return created;

  const meta = normalizeQuizMeta({ ...created.quiz, status: "draft" });
  const saved = await saveQuiz(
    created.quiz.id,
    ownerId,
    meta,
    normalizeQuestions(current.quiz.questions)
  );
  return saved || { error: "Quiz not found" };
}

export async function saveAttempt(quizId, userId, payload = {}) {
  const access = await getQuizAccess(quizId, userId);
  if (access.error) return access;

  const practice = payload.practice === true;
  const sanitized = sanitizeAttemptAnswers(payload.answers);

  // Full runs: derive the score from the per-question marks the client already sends,
  // so a stored score can never contradict the answers (and can't be inflated past the
  // question count). Practice runs carry no attempt score of their own, so fall back to
  // the reported numbers, clamped to a sane range.
  const total = practice
    ? Math.max(0, Math.floor(Number(payload.total) || 0))
    : sanitized.length;
  const rawScore = practice
    ? Math.floor(Number(payload.score) || 0)
    : sanitized.filter((item) => item.ok).length;
  const score = Math.min(Math.max(0, rawScore), total);
  const answers = toStoredAnswers(sanitized, practice);

  const { data: attempt, error } = await getSupabaseAdmin()
    .from("quiz_attempts")
    .insert({
      quiz_id: quizId,
      user_id: userId,
      score,
      total,
      answers,
    })
    .select("id, score, total, created_at")
    .single();

  if (error) throw error;
  return { attempt };
}

async function loadAttempts(quizId, userId, limit) {
  // Filtering by user_id already limits the result to the caller's own attempts.
  const { data, error } = await getSupabaseAdmin()
    .from("quiz_attempts")
    .select("id, score, total, answers, created_at")
    .eq("quiz_id", quizId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/** Full runs only; practice runs feed progress but aren't shown as attempts. */
export async function listAttempts(quizId, userId) {
  const rows = await loadAttempts(quizId, userId, 60);
  const attempts = rows
    .filter((row) => !isPracticeAttempt(row.answers))
    .slice(0, 20)
    .map(({ id, score, total, created_at }) => ({ id, score, total, created_at }));
  return { attempts };
}

export async function getProgress(quizId, userId) {
  const access = await getQuizAccess(quizId, userId);
  if (access.error) return access;
  return { progress: buildProgress(await loadAttempts(quizId, userId, 100)) };
}
