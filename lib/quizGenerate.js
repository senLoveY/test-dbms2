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

/** "All of the above" style options let people answer without knowing the material. */
const LAZY_OPTION = new RegExp(
  [
    "(?:все|всё)(?: вышеперечисленное| перечисленное| варианты| ответы)?(?: верны| верно| правильны)?",
    "(?:ничего|ни один|ни одно)(?: из)?(?: вышеперечисленн\\S*| перечисленн\\S*| вариантов| ответов)?",
    "нет (?:правильного|верного) ответа",
    "оба (?:варианта|ответа)(?: верны)?",
    "(?:all|none) of the above",
  ]
    .map((phrase) => `^${phrase}$`)
    .join("|"),
  "i"
);

export function hasLazyOption(question) {
  return question.options.some((option) => LAZY_OPTION.test(option.trim().replace(/[.!]+$/, "")));
}

/**
 * Models tend to put the right answer first; shuffle so its position carries no signal
 * (duels can run with option shuffling off, and the editor shows the stored order).
 */
export function shuffleQuestionOptions(question, random = Math.random) {
  const order = question.options.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...question,
    options: order.map((index) => question.options[index]),
    correct: order
      .map((original, position) => (question.correct.includes(original) ? position : -1))
      .filter((position) => position >= 0),
  };
}

function questionKey(question) {
  return question.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

async function requestBatch({ apiKey, source, count, allowMultiple, part }) {
  const system = `Ты методист: составляешь проверочные тесты по учебному материалу.
Тест должен проверять понимание, а не умение угадывать.

Верни ТОЛЬКО JSON вида:
{"title":"кратко","questions":[{"type":"single"|"multiple","text":"...","checks":"что именно проверяет вопрос","traps":["..."],"options":["..."],"correct":[0]}]}

Вопросы:
- ровно ${count} штук, не повторяют друг друга
- опирайся только на данный текст, не выдумывай факты; правильный ответ должен однозначно следовать из текста
- не больше трети вопросов на простое воспроизведение определения; остальные — на понимание: применить правило к примеру, сравнить понятия, найти причину или следствие, выбрать верное утверждение
- формулируй своими словами, не копируй фразы из текста дословно — иначе ответ находится поиском по тексту
- язык вопросов и вариантов — язык исходного текста

Варианты ответа — это главное:
- type "single": ровно 4 варианта, ровно один индекс в correct
- type "multiple": только если allowMultiple=true; 4–5 вариантов, из них правильных 2–3
- correct: индексы правильных вариантов, с нуля
- сначала заполни "traps" (коротко, 3–8 слов на пункт): для каждого неверного варианта — правдоподобное заблуждение, которое возникнет у того, кто читал текст невнимательно или путает понятия; затем построй неверные варианты из этих заблуждений
- хорошие источники ловушек: соседнее понятие из того же текста, которое отвечает на другой вопрос; верное утверждение с одной изменённой деталью (число, условие, направление связи, исключение); перепутанные причина и следствие; распространённое бытовое заблуждение по теме
- неверный вариант должен быть однозначно неверным по тексту — не «частично верным» и не спорным
- все варианты одного вопроса — из одной категории, в одной грамматической форме и примерно одной длины; правильный не должен выделяться длиной, точностью, оговорками или словами из текста
- запрещено: «все перечисленное», «ничего из перечисленного», «оба варианта», шуточные и заведомо абсурдные варианты, слова «всегда», «никогда», «только» лишь в неверных вариантах
- не выбирай позицию правильного ответа специально: порядок вариантов потом перемешивается

Пример на постороннюю тему (не из текста), вопрос «Что происходит при фотосинтезе?»
Слабые варианты: «Из CO₂ и воды образуется глюкоза, выделяется кислород» / «Растение спит» / «Растение ест землю» / «Ничего из перечисленного».
Сильные варианты: «Из CO₂ и воды образуется глюкоза, выделяется кислород» (верный) / «Из кислорода и воды образуется глюкоза, выделяется CO₂» (перепутаны вещества) / «Из CO₂ и воды образуется глюкоза, выделяется водород» (изменена одна деталь) / «Растение получает органические вещества из почвы через корни» (бытовое заблуждение).`;

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
      // room for the "checks"/"traps" reasoning fields, which are dropped after parsing
      max_tokens: 6000,
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
    const questions = normalizeQuestions(parsed.questions)
      .filter((question) => validateQuestion(question).length === 0 && !hasLazyOption(question))
      .map((question) => shuffleQuestionOptions(question));
    return { title: String(parsed.title || "").trim(), questions: questions.slice(0, count) };
  } catch {
    return { error: "Модель вернула некорректный JSON. Попробуйте ещё раз." };
  }
}

/** Cheap checks that must pass before a (paid, rate-limited) model call. */
export function checkGenerationSource(source) {
  if (!process.env.DEEPSEEK_API_KEY) return "Не задан DEEPSEEK_API_KEY";
  if (String(source || "").trim().length < 40) {
    return "Вставьте текст подлиннее — хотя бы несколько предложений";
  }
  return null;
}

export async function generateQuizFromText({ source, count, allowMultiple = true }) {
  const sourceError = checkGenerationSource(source);
  if (sourceError) return { error: sourceError };
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const text = String(source || "").trim();

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
