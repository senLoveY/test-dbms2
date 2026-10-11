/**
 * Async challenge: a fixed set of questions anyone with the link plays once, on their own time.
 * The snapshot (with correct answers) lives only on the server; players get it without answers
 * when they press start, and the server grades and times the run.
 */
import { gradeAnswerDetailed } from "./gameLogic.js";

export const CHALLENGE_LIMITS = {
  questionCounts: [5, 10, 15],
  defaultCount: 10,
  secondsPerQuestion: 30,
  maxParticipants: 50,
};

/** Grace for network and the reveal between questions when checking the overall deadline. */
const SLACK_MS = 60_000;

export function challengeQuestionCount(requested, available) {
  const count = CHALLENGE_LIMITS.questionCounts.includes(Number(requested))
    ? Number(requested)
    : CHALLENGE_LIMITS.defaultCount;
  return Math.max(1, Math.min(count, available));
}

function shuffle(items, random) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/** Random questions with shuffled options, frozen so every player sees the same order. */
export function buildChallengeSnapshot(questions, count, random = Math.random) {
  return shuffle(questions, random)
    .slice(0, count)
    .map((question) => {
      const order = shuffle(
        question.options.map((_, index) => index),
        random
      );
      return {
        type: question.type,
        text: question.text,
        options: order.map((index) => question.options[index]),
        correct: order
          .map((original, position) => (question.correct.includes(original) ? position : -1))
          .filter((position) => position >= 0),
      };
    });
}

export function toPublicQuestions(snapshot) {
  return snapshot.map(({ type, text, options }) => ({ type, text, options }));
}

function cleanSelection(selected, optionCount) {
  if (!Array.isArray(selected)) return [];
  return [...new Set(selected)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < optionCount)
    .sort((a, b) => a - b);
}

/** All or nothing per question; answers is an array aligned with the snapshot. */
export function gradeChallenge(snapshot, answers) {
  const items = snapshot.map((question, index) => {
    const selected = cleanSelection(answers?.[index], question.options.length);
    return { selected, ok: gradeAnswerDetailed(question, selected).isFullyCorrect };
  });
  return { correct: items.filter((item) => item.ok).length, total: snapshot.length, items };
}

export function challengeDeadlineMs(questionCount) {
  return questionCount * CHALLENGE_LIMITS.secondsPerQuestion * 1000 + SLACK_MS;
}

/** More correct answers first, then faster, then whoever finished earlier. */
export function rankResults(results) {
  return [...results].sort(
    (a, b) =>
      b.correct - a.correct ||
      a.durationMs - b.durationMs ||
      new Date(a.finishedAt).getTime() - new Date(b.finishedAt).getTime()
  );
}
