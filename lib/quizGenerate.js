import {
  GENERATE_LIMITS,
  QUIZ_LIMITS,
  normalizeQuestions,
  validateQuestion,
} from "./quizModel.js";

function clampCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 5;
  return Math.min(GENERATE_LIMITS.maxCount, Math.max(GENERATE_LIMITS.minCount, Math.round(number)));
}

function extractJson(content) {
  const trimmed = String(content || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(raw);
}

export async function generateQuizFromText({ source, count, allowMultiple = true }) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return { error: "Не задан DEEPSEEK_API_KEY" };
  }

  const text = String(source || "").trim();
  if (text.length < 40) {
    return { error: "Вставьте текст подлиннее — хотя бы несколько предложений" };
  }

  const clipped = text.slice(0, GENERATE_LIMITS.maxSourceChars);
  const questionCount = clampCount(count);

  const system = `Ты составляешь учебные тесты с вариантами ответа.
Верни ТОЛЬКО JSON вида:
{"title":"кратко","questions":[{"type":"single"|"multiple","text":"...","options":["..."],"correct":[0]}]}
Правила:
- questions ровно ${questionCount} штук
- options: от 2 до 6 коротких вариантов
- correct: индексы правильных вариантов, с нуля
- type "single": ровно один индекс в correct
- type "multiple": минимум два правильных, только если allowMultiple=true
- опирайся только на данный текст, не выдумывай факты
- язык вопросов — язык исходного текста`;

  const user = `allowMultiple=${allowMultiple ? "true" : "false"}
Составь тест по материалу:

${clipped}`;

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.3,
      max_tokens: 3500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error?.message || `DeepSeek error (${response.status})`;
    return { error: message };
  }

  const content = payload.choices?.[0]?.message?.content;
  let parsed;
  try {
    parsed = extractJson(content);
  } catch {
    return { error: "Модель вернула некорректный JSON. Попробуйте ещё раз." };
  }

  const questions = normalizeQuestions(parsed.questions).filter(
    (question) => validateQuestion(question).length === 0
  );

  if (!questions.length) {
    return { error: "Не удалось получить валидные вопросы. Уточните текст и повторите." };
  }

  return {
    title: String(parsed.title || "").trim().slice(0, QUIZ_LIMITS.maxTitle),
    questions: questions.slice(0, questionCount),
  };
}
