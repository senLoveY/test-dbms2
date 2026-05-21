import { questions } from "./questions.js";

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

export function buildQuestionOrder(count = questions.length) {
  const limit = Math.min(Math.max(1, count), questions.length);
  return shuffleArray(questions.map((q) => q.id)).slice(0, limit);
}

export function getQuestionById(id) {
  return questions.find((q) => q.id === id);
}

function hashString(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic option order so all players in a room see the same shuffle */
export function buildOptionOrder(length, seedKey) {
  const indices = Array.from({ length }, (_, index) => index);
  const random = mulberry32(hashString(seedKey));

  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  return indices;
}

export function getQuestionShuffleKey(roomId, questionIndex, questionId) {
  return `${roomId}:${questionIndex}:${questionId}`;
}

export function mapDisplayIndicesToOriginal(displayIndices, optionOrder) {
  return displayIndices.map((displayIndex) => optionOrder[displayIndex]);
}

export function getPublicQuestion(id, shuffleKey = null) {
  const question = getQuestionById(id);
  if (!question) return null;

  const optionOrder = shuffleKey
    ? buildOptionOrder(question.options.length, shuffleKey)
    : question.options.map((_, index) => index);

  return {
    id: question.id,
    type: question.type,
    text: question.text,
    options: optionOrder.map((index) => question.options[index]),
  };
}

export function arraysEqualAsSet(a, b) {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((item) => setA.has(item));
}

/**
 * @returns {{
 *   scoreRatio: number,
 *   isFullyCorrect: boolean,
 *   isPartial: boolean,
 *   correctSelected: number[],
 *   wrongSelected: number[],
 *   missedCorrect: number[],
 * }}
 */
export function gradeAnswerDetailed(questionId, selected, options = {}) {
  const { partialCredit = true } = options;
  const question = getQuestionById(questionId);
  const empty = {
    scoreRatio: 0,
    isFullyCorrect: false,
    isPartial: false,
    correctSelected: [],
    wrongSelected: [],
    missedCorrect: [],
  };

  if (!question || !Array.isArray(selected)) return empty;

  const correctSet = new Set(question.correct);
  const selectedUnique = [...new Set(selected)];

  const correctSelected = selectedUnique.filter((index) => correctSet.has(index));
  const wrongSelected = selectedUnique.filter((index) => !correctSet.has(index));
  const missedCorrect = question.correct.filter(
    (index) => !selectedUnique.includes(index)
  );

  if (question.type === "single") {
    const isFullyCorrect = arraysEqualAsSet(selectedUnique, question.correct);
    return {
      ...empty,
      scoreRatio: isFullyCorrect ? 1 : 0,
      isFullyCorrect,
      isPartial: false,
      correctSelected,
      wrongSelected,
      missedCorrect,
    };
  }

  const totalCorrect = question.correct.length;
  if (totalCorrect === 0) return empty;

  const isFullyCorrect =
    correctSelected.length === totalCorrect && wrongSelected.length === 0;

  if (isFullyCorrect) {
    return {
      scoreRatio: 1,
      isFullyCorrect: true,
      isPartial: false,
      correctSelected,
      wrongSelected,
      missedCorrect,
    };
  }

  if (!partialCredit) {
    return {
      scoreRatio: 0,
      isFullyCorrect: false,
      isPartial: false,
      correctSelected,
      wrongSelected,
      missedCorrect,
    };
  }

  let scoreRatio = correctSelected.length / totalCorrect;
  if (wrongSelected.length > 0) {
    scoreRatio -= wrongSelected.length / totalCorrect;
  }
  scoreRatio = Math.max(0, Math.min(1, scoreRatio));

  const isPartial = scoreRatio > 0 && scoreRatio < 1;

  return {
    scoreRatio,
    isFullyCorrect: false,
    isPartial,
    correctSelected,
    wrongSelected,
    missedCorrect,
  };
}

export function gradeAnswer(questionId, selected) {
  return gradeAnswerDetailed(questionId, selected).isFullyCorrect;
}

/** Подсветка выбранных вариантов для разбора ответа */
export function getSelectedAnswerBreakdown(questionId, selected) {
  const question = getQuestionById(questionId);
  if (!question || !Array.isArray(selected) || !selected.length) return [];

  const correctSet = new Set(question.correct);
  return [...new Set(selected)].map((index) => ({
    label: question.options[index],
    state: correctSet.has(index) ? "right-selected" : "wrong-selected",
  }));
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
