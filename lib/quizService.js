import { getSupabaseAdmin } from "./supabaseAdmin.js";
import {
  QUIZ_LIMITS,
  getPublishErrors,
  normalizeQuestions,
  normalizeQuizMeta,
} from "./quizModel.js";

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

export async function listQuizzes(ownerId) {
  const supabase = getSupabaseAdmin();

  const { data: quizzes, error } = await supabase
    .from("quizzes")
    .select("id, title, description, tags, status, visibility, created_at, updated_at")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  if (!quizzes?.length) return [];

  const ids = quizzes.map((quiz) => quiz.id);
  const { data: questions, error: countError } = await supabase
    .from("quiz_questions")
    .select("quiz_id")
    .in("quiz_id", ids);

  if (countError) throw countError;

  const counts = {};
  for (const row of questions || []) {
    counts[row.quiz_id] = (counts[row.quiz_id] || 0) + 1;
  }

  return quizzes.map((quiz) => mapQuizRow(quiz, counts[quiz.id] || 0));
}

export async function getQuiz(quizId, ownerId, { requireOwner = true } = {}) {
  const supabase = getSupabaseAdmin();

  const { data: quiz, error } = await supabase
    .from("quizzes")
    .select("*")
    .eq("id", quizId)
    .maybeSingle();

  if (error) throw error;
  if (!quiz) return { error: "Quiz not found" };
  if (requireOwner && quiz.owner_id !== ownerId) {
    return { error: "Forbidden" };
  }

  const { data: questions, error: questionsError } = await supabase
    .from("quiz_questions")
    .select("id, type, text, options, correct, sort_order")
    .eq("quiz_id", quizId)
    .order("sort_order", { ascending: true });

  if (questionsError) throw questionsError;

  return {
    quiz: {
      ...mapQuizRow(quiz, questions?.length || 0),
      ownerId: quiz.owner_id,
      questions: (questions || []).map(mapQuestionRow),
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
    .select("*")
    .single();

  if (error) throw error;

  return { quiz: { ...mapQuizRow(quiz, 0), questions: [] } };
}

async function replaceQuestions(supabase, quizId, questions) {
  const { error: deleteError } = await supabase
    .from("quiz_questions")
    .delete()
    .eq("quiz_id", quizId);

  if (deleteError) throw deleteError;
  if (!questions.length) return;

  const rows = questions.map((question, index) => ({
    quiz_id: quizId,
    sort_order: index,
    type: question.type,
    text: question.text,
    options: question.options,
    correct: question.correct,
  }));

  const { error: insertError } = await supabase.from("quiz_questions").insert(rows);
  if (insertError) throw insertError;
}

export async function updateQuiz(quizId, ownerId, input = {}) {
  const current = await getQuiz(quizId, ownerId);
  if (current.error) return current;

  const meta = normalizeQuizMeta({
    ...current.quiz,
    ...input,
  });
  const questions = normalizeQuestions(input.questions ?? current.quiz.questions);

  if (meta.status === "published") {
    const publishErrors = getPublishErrors(questions);
    if (publishErrors.length) {
      return { error: publishErrors[0] };
    }
  }

  const supabase = getSupabaseAdmin();
  const { data: quiz, error } = await supabase
    .from("quizzes")
    .update({
      title: meta.title,
      description: meta.description,
      tags: meta.tags,
      status: meta.status,
      visibility: meta.visibility,
      updated_at: new Date().toISOString(),
    })
    .eq("id", quizId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error) throw error;

  await replaceQuestions(supabase, quizId, questions);

  return {
    quiz: {
      ...mapQuizRow(quiz, questions.length),
      questions,
    },
  };
}

export async function deleteQuiz(quizId, ownerId) {
  const current = await getQuiz(quizId, ownerId);
  if (current.error) return current;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("quizzes")
    .delete()
    .eq("id", quizId)
    .eq("owner_id", ownerId);

  if (error) throw error;
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

  return updateQuiz(created.quiz.id, ownerId, {
    ...created.quiz,
    questions: current.quiz.questions.map(({ type, text, options, correct }) => ({
      type,
      text,
      options,
      correct,
    })),
    status: "draft",
  });
}

export async function saveAttempt(quizId, userId, payload = {}) {
  const current = await getQuiz(quizId, userId);
  if (current.error) return current;

  const supabase = getSupabaseAdmin();
  const score = Math.max(0, Number(payload.score) || 0);
  const total = Math.max(0, Number(payload.total) || 0);

  const { data: attempt, error } = await supabase
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
  const current = await getQuiz(quizId, userId);
  if (current.error) return current;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("quiz_attempts")
    .select("id, score, total, created_at")
    .eq("quiz_id", quizId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;
  return { attempts: data || [] };
}
