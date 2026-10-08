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

const MIN_CHUNK_CHARS = 1500;

const SPLITTERS = [
  { pattern: /\n{2,}/, joiner: "\n\n" },
  { pattern: /\n/, joiner: "\n" },
  { pattern: /(?<=[.!?…])\s+/, joiner: " " },
];

function splitBy(text, parts, { pattern, joiner }) {
  const pieces = text.split(pattern);
  const target = text.length / parts;
  const chunks = [];
  let current = "";
  for (const piece of pieces) {
    if (current && current.length + piece.length > target && chunks.length < parts - 1) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}${joiner}${piece}` : piece;
  }
  if (current) chunks.push(current);
  return chunks.length === parts ? chunks : null;
}

/** Split the source into contiguous parts of similar length at the cleanest available breaks. */
function splitSource(text, parts) {
  if (parts <= 1) return [text];
  for (const splitter of SPLITTERS) {
    const chunks = splitBy(text, parts, splitter);
    if (chunks) return chunks;
  }
  return null;
}

function questionKey(question) {
  return question.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

async function requestBatch({ apiKey, source, count, allowMultiple, part }) {
  const system = `Ты составляешь учебные тесты с вариантами ответа.
Верни ТОЛЬКО JSON вида:
{"title":"кратко","questions":[{"type":"single"|"multiple","text":"...","options":["..."],"correct":[0]}]}
Правила:
- questions ровно ${count} штук
- options: от 2 до 6 коротких вариантов
- correct: индексы правильных вариантов, с нуля
- type "single": ровно один индекс в correct
- type "multiple": минимум два правильных, только если allowMultiple=true
- опирайся только на данный текст, не выдумывай факты
- вопросы не должны повторять друг друга
- язык вопросов — язык исходного текста`;

  const focus = part
    ? `\nЭто партия ${part.index} из ${part.total}: другие партии составляются параллельно по тому же тексту. Бери факты в основном из ${part.index}-й из ${part.total} равных частей текста, чтобы вопросы не совпадали.`
    : "";

  const user = `allowMultiple=${allowMultiple ? "true" : "false"}${focus}
Составь тест по материалу:

${source}`;

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { error: payload.error?.message || `DeepSeek error (${response.status})` };
  }

  try {
    const parsed = extractJson(payload.choices?.[0]?.message?.content);
    const questions = normalizeQuestions(parsed.questions).filter(
      (question) => validateQuestion(question).length === 0
    );
    return { title: String(parsed.title || "").trim(), questions: questions.slice(0, count) };
  } catch {
    return { error: "Модель вернула некорректный JSON. Попробуйте ещё раз." };
  }
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

  // Big requests are split into parallel batches so they fit the function time limit.
  const batches = Math.ceil(questionCount / GENERATE_LIMITS.batchSize);
  const chunks = clipped.length >= batches * MIN_CHUNK_CHARS ? splitSource(clipped, batches) : null;
  const sizes = Array.from({ length: batches }, (_, index) =>
    Math.floor(questionCount / batches) + (index < questionCount % batches ? 1 : 0)
  );

  const results = await Promise.all(
    sizes.map((size, index) =>
      requestBatch({
        apiKey,
        source: chunks ? chunks[index] : clipped,
        count: size,
        allowMultiple,
        part: batches > 1 && !chunks ? { index: index + 1, total: batches } : null,
      })
    )
  );

  const seen = new Set();
  const questions = [];
  for (const result of results) {
    for (const question of result.questions || []) {
      const key = questionKey(question);
      if (seen.has(key)) continue;
      seen.add(key);
      questions.push(question);
    }
  }

  if (!questions.length) {
    const failed = results.find((result) => result.error);
    return {
      error: failed?.error || "Не удалось получить валидные вопросы. Уточните текст и повторите.",
    };
  }

  const title = results.find((result) => result.title)?.title || "";
  return {
    title: title.slice(0, QUIZ_LIMITS.maxTitle),
    questions: questions.slice(0, questionCount),
  };
}
