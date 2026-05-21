import { questions } from "./questions.js";
import { computePoints } from "./scoring.js";

export const DEFAULT_TIME_LIMIT_SEC = 30;
export const REVEAL_PAUSE_MS = 3500;

export function shuffleArray(items) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function buildQuestionOrder() {
  return shuffleArray(questions.map((q) => q.id));
}

export function getQuestionById(id) {
  return questions.find((q) => q.id === id);
}

export function getPublicQuestion(id) {
  const question = getQuestionById(id);
  if (!question) return null;
  return {
    id: question.id,
    type: question.type,
    text: question.text,
    options: question.options,
  };
}

export function arraysEqualAsSet(a, b) {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((item) => setA.has(item));
}

export function gradeAnswer(questionId, selected) {
  const question = getQuestionById(questionId);
  if (!question) return false;
  return arraysEqualAsSet(selected, question.correct);
}

export function getCorrectOptions(questionId) {
  const question = getQuestionById(questionId);
  if (!question) return [];
  return question.correct.map((index) => question.options[index]);
}

export function formatAnswerLabels(questionId, selected) {
  const question = getQuestionById(questionId);
  if (!question || !Array.isArray(selected) || !selected.length) {
    return [];
  }
  return selected
    .map((index) => question.options[index])
    .filter((label) => label != null);
}
