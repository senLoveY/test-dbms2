/**
 * Lesson report for classroom mode, built from the rows class_report_record() saves
 * at each reveal: what the class got wrong, and which wrong option pulled them in.
 */

/** Below this share of correct answers a question goes into "what to go over again". */
export const STRUGGLE_THRESHOLD = 0.6;

function percent(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function questionView(entry) {
  const options = Array.isArray(entry.options) ? entry.options : [];
  const correct = new Set(Array.isArray(entry.correct) ? entry.correct : []);
  const counts = options.map((_, index) => Number(entry.counts?.[index]) || 0);
  const players = Number(entry.players) || 0;
  const answered = Number(entry.answered) || 0;
  const correctCount = Number(entry.correctCount) || 0;

  // the wrong option most people picked: the misconception worth discussing
  let trap = null;
  counts.forEach((count, index) => {
    if (!correct.has(index) && count > 0 && (!trap || count > trap.count)) {
      trap = { index, label: options[index], count, percent: percent(count, players) };
    }
  });

  return {
    index: Number(entry.index) || 0,
    type: entry.type === "multiple" ? "multiple" : "single",
    text: String(entry.text || ""),
    options: options.map((label, index) => ({
      label,
      count: counts[index],
      percent: percent(counts[index], players),
      correct: correct.has(index),
    })),
    players,
    answered,
    skipped: Math.max(0, players - answered),
    correctCount,
    correctPercent: percent(correctCount, players),
    trap,
  };
}

export function buildClassReport(row) {
  const questions = (Array.isArray(row.questions) ? row.questions : [])
    .map(questionView)
    .sort((a, b) => a.index - b.index);
  const players = (Array.isArray(row.players) ? row.players : []).map((player) => ({
    name: String(player.name || "Игрок"),
    score: Number(player.score) || 0,
    correct: Number(player.correct) || 0,
  }));

  const totalAnswers = questions.reduce((sum, q) => sum + q.players, 0);
  const totalCorrect = questions.reduce((sum, q) => sum + q.correctCount, 0);

  return {
    id: row.id,
    roomId: row.room_id,
    quizId: row.quiz_id,
    quizTitle: row.quiz_title || "Тест",
    createdAt: row.created_at,
    questionTotal: Number(row.question_total) || questions.length,
    questionsPlayed: questions.length,
    playerCount: players.length,
    averagePercent: percent(totalCorrect, totalAnswers),
    questions,
    struggles: questions
      .filter((q) => q.players > 0 && q.correctCount / q.players < STRUGGLE_THRESHOLD)
      .sort((a, b) => a.correctPercent - b.correctPercent),
    players,
  };
}

/** One line per lesson for the list page. */
export function summarizeClassReport(row) {
  const report = buildClassReport(row);
  return {
    id: report.id,
    quizTitle: report.quizTitle,
    createdAt: report.createdAt,
    playerCount: report.playerCount,
    questionsPlayed: report.questionsPlayed,
    questionTotal: report.questionTotal,
    averagePercent: report.averagePercent,
    struggleCount: report.struggles.length,
  };
}
