import { getSupabaseAdmin } from "./supabaseAdmin.js";
import {
  QUIZ_LIMITS,
  getPublishErrors,
  normalizeQuestions,
  normalizeQuizMeta,
} from "./quizModel.js";

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

export async function getQuiz(quizId, ownerId) {
  const { data: quiz, error } = await getSupabaseAdmin()
    .from("quizzes")
    .select(`${QUIZ_COLUMNS}, quiz_questions(id, type, text, options, correct, sort_order)`)
    .eq("id", quizId)
    .order("sort_order", { referencedTable: "quiz_questions", ascending: true })
    .maybeSingle();

  if (error) throw error;
  if (!quiz) return { error: "Quiz not found" };
  if (quiz.owner_id !== ownerId) return { error: "Forbidden" };

  const questions = quiz.quiz_questions || [];
  return {
    quiz: {
      ...mapQuizRow(quiz, questions.length),
      ownerId: quiz.owner_id,
      questions: questions.map(mapQuestionRow),
    },
  };
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

export async function duplicateQuiz(quizId, ownerId) {
  const current = await getQuiz(quizId, ownerId);
  if (current.error) return current;

  const created = await createQuiz(ownerId, {
    title: `${current.quiz.title} (копия)`,
    description: current.quiz.description,
    tags: current.quiz.tags,
    visibility: current.quiz.visibility,
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
  const owned = await getQuizMeta(quizId, userId);
  if (owned.error) return owned;

  const score = Math.max(0, Number(payload.score) || 0);
  const total = Math.max(0, Number(payload.total) || 0);

  const { data: attempt, error } = await getSupabaseAdmin()
    .from("quiz_attempts")
    .insert({
      quiz_id: quizId,
      user_id: userId,
      score,
      total,
      answers: payload.answers || [],
    })
    .select("id, score, total, created_at")
    .single();

  if (error) throw error;
  return { attempt };
}

export async function listAttempts(quizId, userId) {
  // Filtering by user_id already limits the result to the caller's own attempts.
  const { data, error } = await getSupabaseAdmin()
    .from("quiz_attempts")
    .select("id, score, total, created_at")
    .eq("quiz_id", quizId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;
  return { attempts: data || [] };
}
