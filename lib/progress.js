/**
 * Per-question learning progress, built from the answers stored with solo attempts.
 *
 * Question ids change every time a quiz is saved (quiz_save re-inserts the rows),
 * so answers are keyed by a hash of the question's type and text instead.
 */

/** Correct answers in a row needed to call a question learned. */
export const LEARNED_STREAK = 3;
export const REVIEW_BATCH = 10;
const MAX_ITEMS = 100;

function fnv1a(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function questionKey(question) {
  const text = String(question?.text ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return fnv1a(`${question?.type}\n${text}`).toString(36);
}

/** Payload items for one run: [{ k, ok }]. */
export function buildAttemptAnswers(questions, isCorrect) {
  return questions.map((question) => ({ k: questionKey(question), ok: Boolean(isCorrect(question)) }));
}

/** Keeps only well-formed items, so a client can't store arbitrary json. */
export function sanitizeAttemptAnswers(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item) => item && typeof item.k === "string" && item.k.length <= 16)
    .slice(0, MAX_ITEMS)
    .map((item) => ({ k: item.k, ok: item.ok === true }));
}

/**
 * Full runs store a plain array; practice runs (mistakes / weak spots) store
 * { practice: true, items } so they feed progress without counting as attempts.
 */
export function toStoredAnswers(items, practice) {
  return practice ? { practice: true, items } : items;
}

export function isPracticeAttempt(answers) {
  return Boolean(answers && !Array.isArray(answers) && answers.practice);
}

function attemptItems(answers) {
  const items = Array.isArray(answers) ? answers : Array.isArray(answers?.items) ? answers.items : [];
  // rows written before validation existed may hold anything
  return items.filter((item) => item && typeof item.k === "string");
}

/**
 * @param attempts [{ answers, created_at }] in any order
 * @returns {Record<string, { seen: number, wrong: number, streak: number, lastOk: boolean, lastAt: string }>}
 */
export function buildProgress(attempts) {
  const ordered = [...(attempts || [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const progress = {};
  for (const attempt of ordered) {
    for (const { k, ok } of attemptItems(attempt.answers)) {
      const stat = progress[k] || { seen: 0, wrong: 0, streak: 0, lastOk: false, lastAt: null };
      stat.seen += 1;
      if (ok) {
        stat.streak += 1;
      } else {
        stat.wrong += 1;
        stat.streak = 0;
      }
      stat.lastOk = Boolean(ok);
      stat.lastAt = attempt.created_at;
      progress[k] = stat;
    }
  }
  return progress;
}

/** "new" | "weak" | "learning" | "learned" */
export function classifyStat(stat) {
  if (!stat?.seen) return "new";
  if (!stat.lastOk) return "weak";
  if (stat.streak >= LEARNED_STREAK) return "learned";
  return "learning";
}

export function summarizeProgress(questions, progress) {
  const summary = { new: 0, weak: 0, learning: 0, learned: 0, total: questions.length };
  for (const question of questions) {
    summary[classifyStat(progress?.[questionKey(question)])] += 1;
  }
  return summary;
}

function time(value) {
  return value ? new Date(value).getTime() : 0;
}

/**
 * Next batch to review: weak spots first (most error-prone, least recent),
 * then questions still being learned, then ones never answered. Learned ones are skipped.
 */
export function pickReviewQuestions(questions, progress, limit = REVIEW_BATCH) {
  const rank = { weak: 0, learning: 1, new: 2 };
  return questions
    .map((question, index) => {
      const stat = progress?.[questionKey(question)];
      return { question, index, stat, group: classifyStat(stat) };
    })
    .filter((item) => item.group !== "learned")
    .sort((a, b) => {
      if (rank[a.group] !== rank[b.group]) return rank[a.group] - rank[b.group];
      if (a.group === "weak") {
        const errorRate = b.stat.wrong / b.stat.seen - a.stat.wrong / a.stat.seen;
        if (errorRate) return errorRate;
      }
      if (a.group === "learning" && a.stat.streak !== b.stat.streak) return a.stat.streak - b.stat.streak;
      return time(a.stat?.lastAt) - time(b.stat?.lastAt) || a.index - b.index;
    })
    .slice(0, limit)
    .map((item) => item.question);
}
