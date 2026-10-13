import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { CONSENT_VERSION, normalizeUsername } from "./privacy.js";

const UNDEFINED_TABLE = "42P01";
const UNDEFINED_COLUMN = "42703";
const UNIQUE_VIOLATION = "23505";

async function rows(query) {
  const { data, error } = await query;
  // tables from optional migrations may be missing; the export just skips them
  if (error?.code === UNDEFINED_TABLE) return [];
  if (error) throw error;
  return data || [];
}

export async function acceptConsent(userId, version) {
  if (version !== CONSENT_VERSION) return { error: "Текст согласия обновился, обновите страницу" };

  const { error } = await getSupabaseAdmin()
    .from("profiles")
    .update({ consent_version: CONSENT_VERSION, consent_at: new Date().toISOString() })
    .eq("id", userId);

  if (error?.code === UNDEFINED_COLUMN) return { error: "Не применена миграция supabase/privacy-migration.sql" };
  if (error) throw error;
  return { ok: true };
}

export async function updateUsername(userId, value) {
  const { username, error: invalid } = normalizeUsername(value);
  if (invalid) return { error: invalid };

  const { error } = await getSupabaseAdmin().from("profiles").update({ username }).eq("id", userId);
  if (error?.code === UNIQUE_VIOLATION) return { error: "Такой никнейм уже занят" };
  if (error) throw error;
  return { username };
}

/** Everything stored about the user, as one JSON document (right to information, art. 11 of 99-З). */
export async function exportAccount(user) {
  const supabase = getSupabaseAdmin();
  const userId = user.id;

  const [profile] = await rows(supabase.from("profiles").select("*").eq("id", userId));
  const quizzes = await rows(
    supabase
      .from("quizzes")
      .select("id, title, description, tags, status, visibility, created_at, updated_at")
      .eq("owner_id", userId)
      .order("created_at")
  );
  const quizIds = quizzes.map((quiz) => quiz.id);
  const questions = quizIds.length
    ? await rows(
        supabase
          .from("quiz_questions")
          .select("quiz_id, sort_order, type, text, options, correct")
          .in("quiz_id", quizIds)
          .order("sort_order")
      )
    : [];

  const [attempts, challenges, challengeResults, duels, generations] = await Promise.all([
    rows(
      supabase
        .from("quiz_attempts")
        .select("quiz_id, score, total, answers, created_at")
        .eq("user_id", userId)
        .order("created_at")
    ),
    rows(
      supabase
        .from("challenges")
        .select("id, quiz_id, quiz_title, created_at")
        .eq("creator_id", userId)
        .order("created_at")
    ),
    rows(
      supabase
        .from("challenge_results")
        .select("challenge_id, started_at, finished_at, correct, total, duration_ms, answers")
        .eq("user_id", userId)
    ),
    rows(
      supabase
        .from("room_players")
        .select("score, last_answer, last_answer_correct, last_points, room:rooms(code, quiz_title, status, created_at)")
        .eq("user_id", userId)
    ),
    rows(supabase.from("generation_log").select("created_at").eq("user_id", userId)),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: userId,
      email: user.email || null,
      username: profile?.username ?? null,
      createdAt: profile?.created_at ?? null,
      consentVersion: profile?.consent_version ?? null,
      consentAt: profile?.consent_at ?? null,
    },
    quizzes: quizzes.map((quiz) => ({
      ...quiz,
      questions: questions.filter((question) => question.quiz_id === quiz.id).map(({ quiz_id, ...rest }) => rest),
    })),
    attempts,
    challengesCreated: challenges,
    challengeResults,
    duels,
    quizGenerations: generations,
  };
}

/** Withdrawing consent: the auth user goes, and every table cascades from it. */
export async function deleteAccount(userId) {
  const { error } = await getSupabaseAdmin().auth.admin.deleteUser(userId);
  if (error) throw error;
  return { ok: true };
}
