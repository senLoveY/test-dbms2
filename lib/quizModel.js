export const QUIZ_LIMITS = {
  maxQuizzesPerUser: 30,
  maxQuestions: 100,
  minOptions: 2,
  maxOptions: 8,
  maxTitle: 120,
  maxDescription: 500,
  maxTags: 8,
  maxTagLength: 32,
  maxQuestionText: 2000,
  maxOptionText: 400,
};

export function createEmptyQuestion() {
  return {
    type: "single",
    text: "",
    options: ["", ""],
    correct: [0],
  };
}

function clip(text, max) {
  return String(text ?? "").trim().slice(0, max);
}

export function normalizeTags(input) {
  const raw = Array.isArray(input)
    ? input
    : String(input || "")
        .split(",")
        .map((tag) => tag.trim());

  const unique = [];
  for (const tag of raw) {
    const next = clip(tag, QUIZ_LIMITS.maxTagLength).toLowerCase();
    if (next && !unique.includes(next)) unique.push(next);
    if (unique.length >= QUIZ_LIMITS.maxTags) break;
  }
  return unique;
}

export function normalizeQuestion(input = {}) {
  const type = input.type === "multiple" ? "multiple" : "single";
  const options = (Array.isArray(input.options) ? input.options : [])
    .map((option) => clip(typeof option === "string" ? option : option?.text, QUIZ_LIMITS.maxOptionText))
    .filter((_, index) => index < QUIZ_LIMITS.maxOptions);

  while (options.length < QUIZ_LIMITS.minOptions) options.push("");

  const correctSource = Array.isArray(input.correct) ? input.correct : [];
  const correct = [
    ...new Set(
      correctSource
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0 && value < options.length)
    ),
  ].sort((a, b) => a - b);

  if (type === "single" && correct.length > 1) {
    correct.splice(1);
  }

  return {
    id: input.id || null,
    type,
    text: clip(input.text, QUIZ_LIMITS.maxQuestionText),
    options,
    correct,
  };
}

export function validateQuestion(question) {
  const errors = [];
  if (!question.text) errors.push("Введите текст вопроса");
  const filled = question.options.filter(Boolean);
  if (filled.length < QUIZ_LIMITS.minOptions) {
    errors.push("Нужно минимум два варианта");
  }
  if (question.options.some((option) => !option)) {
    errors.push("Варианты не должны быть пустыми");
  }
  if (!question.correct.length) {
    errors.push("Отметьте хотя бы один правильный ответ");
  }
  if (question.type === "single" && question.correct.length !== 1) {
    errors.push("Для одиночного выбора нужен ровно один правильный ответ");
  }
  return errors;
}

export function normalizeQuizMeta(input = {}) {
  const status = input.status === "published" ? "published" : "draft";
  const visibility = input.visibility === "unlisted" ? "unlisted" : "private";

  return {
    title: clip(input.title, QUIZ_LIMITS.maxTitle) || "Без названия",
    description: clip(input.description, QUIZ_LIMITS.maxDescription),
    tags: normalizeTags(input.tags),
    status,
    visibility,
  };
}

export function normalizeQuestions(input) {
  const list = Array.isArray(input) ? input.slice(0, QUIZ_LIMITS.maxQuestions) : [];
  return list.map((question) => normalizeQuestion(question));
}

export function getPublishErrors(questions) {
  if (!questions.length) return ["Добавьте хотя бы один вопрос"];
  const errors = [];
  questions.forEach((question, index) => {
    const itemErrors = validateQuestion(question);
    if (itemErrors.length) {
      errors.push(`Вопрос ${index + 1}: ${itemErrors[0]}`);
    }
  });
  return errors;
}

export function parseImportPayload(raw) {
  let data = raw;
  if (typeof raw === "string") {
    data = JSON.parse(raw);
  }

  if (Array.isArray(data)) {
    return { title: "", questions: normalizeQuestions(data) };
  }

  if (data && typeof data === "object") {
    const questions = Array.isArray(data.questions) ? data.questions : [];
    return {
      title: clip(data.title, QUIZ_LIMITS.maxTitle),
      description: clip(data.description, QUIZ_LIMITS.maxDescription),
      tags: normalizeTags(data.tags),
      questions: normalizeQuestions(questions),
    };
  }

  throw new Error("Некорректный JSON");
}
