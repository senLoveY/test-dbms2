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

/**
 * Players read these against a timer: options are short phrases, not sentences.
 * The prompt asks for LENGTH; anything past the CHECK limits gets one rewrite pass.
 */
export const GENERATED_LENGTH = { question: 200, option: 70 };
const LENGTH_CHECK = { question: 260, option: 90 };
/** The rewrite pass only runs if the batch left enough of the function's time budget. */
const SHORTEN_BUDGET_MS = 30_000;

export function isTooLong(question) {
  return (
    question.text.length > LENGTH_CHECK.question ||
    question.options.some((option) => option.length > LENGTH_CHECK.option)
  );
}

function questionKey(question) {
  return question.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

async function callModel(apiKey, { system, user, maxTokens, temperature }) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature,
      max_tokens: maxTokens,
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
  return { content: payload.choices?.[0]?.message?.content };
}

/**
 * One rewrite pass for questions that came out too long. Meaning, option order and
 * the correct answers stay as they were; anything that doesn't keep the shape is ignored.
 */
async function shortenQuestions(apiKey, questions) {
  const system = `Ты редактор учебных тестов. Тест проходят на время, поэтому формулировки должны читаться за секунды.
Сократи каждый вопрос и его варианты, не меняя смысла, правильности и порядка вариантов.
Верни ТОЛЬКО JSON: {"questions":[{"text":"...","options":["..."]}]} — в том же порядке, с тем же числом вариантов.
- вопрос — до ${GENERATED_LENGTH.question} символов
- вариант — до ${GENERATED_LENGTH.option} символов, 2–8 слов; убери пояснения, оговорки, скобки
- общую часть вариантов перенеси в вопрос, в вариантах оставь только различие
- верный вариант не должен стать заметно длиннее или точнее неверных`;
  const user = JSON.stringify({
    questions: questions.map(({ text, options, correct }) => ({ text, options, correct })),
  });

  const reply = await callModel(apiKey, { system, user, maxTokens: 3000, temperature: 0.2 });
  if (reply.error) return questions;
  try {
    const rewritten = extractJson(reply.content).questions || [];
    return questions.map((original, index) => {
      const next = rewritten[index];
      if (!next || !Array.isArray(next.options) || next.options.length !== original.options.length) {
        return original;
      }
      const candidate = normalizeQuestions([
        { type: original.type, text: next.text, options: next.options, correct: original.correct },
      ])[0];
      return validateQuestion(candidate).length === 0 && !hasLazyOption(candidate) ? candidate : original;
    });
  } catch {
    return questions;
  }
}

/** What the questions may rely on: the given text, or (topic mode) settled textbook facts. */
function groundingRules(topic) {
  if (!topic) {
    return `- опирайся только на данный текст, не выдумывай факты; правильный ответ должен однозначно следовать из текста
- формулируй своими словами, не копируй фразы из текста дословно — иначе ответ находится поиском по тексту
- язык вопросов и вариантов — язык исходного текста`;
  }
  return `- материала нет, только тема: опирайся на устоявшиеся факты уровня учебника, которые подтвердит любой учебник по предмету
- не включай спорное, устаревшее, новости и точные цифры, даты, имена, в которых не уверен полностью — лучше вопрос на понимание, чем на запоминание сомнительной детали
- правильный ответ должен быть общепризнанным, а не мнением одной школы
- язык вопросов и вариантов — язык темы`;
}

async function requestBatch({ apiKey, source, topic, count, allowMultiple, part }) {
  const startedAt = Date.now();
  const system = `Ты методист: составляешь проверочные тесты по учебному материалу.
Тест должен проверять понимание, а не умение угадывать.

Верни ТОЛЬКО JSON вида:
{"title":"кратко","questions":[{"type":"single"|"multiple","text":"...","checks":"что именно проверяет вопрос","traps":["..."],"options":["..."],"correct":[0]}]}

Вопросы:
- ровно ${count} штук, не повторяют друг друга
${groundingRules(topic)}
- не больше трети вопросов на простое воспроизведение определения; остальные — на понимание: применить правило к примеру, сравнить понятия, найти причину или следствие, выбрать верное утверждение
- вопрос — до ${GENERATED_LENGTH.question} символов, одно-два предложения; отвечают на время, поэтому без вводных и пересказа текста

Длина вариантов (их читают на время):
- каждый вариант — до ${GENERATED_LENGTH.option} символов, обычно 2–8 слов: термин, число, короткая формулировка
- без пояснений, оговорок, скобок и «потому что…» внутри варианта
- если различие между вариантами — в одной детали, вынеси общую часть в текст вопроса, а в вариантах оставь только то, что отличается

Варианты ответа — это главное:
- type "single": ровно 4 варианта, ровно один индекс в correct
- type "multiple": только если allowMultiple=true; 4–5 вариантов, из них правильных 2–3
- correct: индексы правильных вариантов, с нуля
- сначала заполни "traps" (коротко, 3–8 слов на пункт): для каждого неверного варианта — правдоподобное заблуждение, которое возникнет у того, кто читал текст невнимательно или путает понятия; затем построй неверные варианты из этих заблуждений
- хорошие источники ловушек: соседнее понятие из того же текста, которое отвечает на другой вопрос; верное утверждение с одной изменённой деталью (число, условие, направление связи, исключение); перепутанные причина и следствие; распространённое бытовое заблуждение по теме
- неверный вариант должен быть однозначно неверным${topic ? "" : " по тексту"} — не «частично верным» и не спорным
- все варианты одного вопроса — из одной категории, в одной грамматической форме и примерно одной длины; правильный не должен выделяться длиной, точностью, оговорками или словами из текста
- запрещено: «все перечисленное», «ничего из перечисленного», «оба варианта», шуточные и заведомо абсурдные варианты, слова «всегда», «никогда», «только» лишь в неверных вариантах
- не выбирай позицию правильного ответа специально: порядок вариантов потом перемешивается

Пример на постороннюю тему (не из текста), вопрос «Что происходит при фотосинтезе?»
Слабые варианты: «Из CO₂ и воды образуется глюкоза, выделяется кислород» / «Растение спит» / «Растение ест землю» / «Ничего из перечисленного».
Сильные варианты: «Из CO₂ и воды образуется глюкоза, выделяется кислород» (верный) / «Из кислорода и воды образуется глюкоза, выделяется CO₂» (перепутаны вещества) / «Из CO₂ и воды образуется глюкоза, выделяется водород» (изменена одна деталь) / «Растение получает органические вещества из почвы через корни» (бытовое заблуждение).
Ещё короче — общую часть в вопрос: «Какой газ выделяется при фотосинтезе?» — «Кислород» / «Углекислый газ» / «Водород» / «Азот».`;

  let focus = "";
  if (part && topic) {
    focus = `\nЭто партия ${part.index} из ${part.total}: другие партии составляются параллельно по той же теме. Мысленно раздели тему на ${part.total} подтемы и возьми ${part.index}-ю, чтобы вопросы не совпадали.`;
  } else if (part) {
    focus = `\nЭто партия ${part.index} из ${part.total}: другие партии составляются параллельно по тому же тексту. Бери факты в основном из ${part.index}-й из ${part.total} равных частей текста, чтобы вопросы не совпадали.`;
  }

  const user = topic
    ? `allowMultiple=${allowMultiple ? "true" : "false"}${focus}
Составь тест по теме: ${topic}`
    : `allowMultiple=${allowMultiple ? "true" : "false"}${focus}
Составь тест по материалу:

${source}`;

  const reply = await callModel(apiKey, {
    system,
    user,
    // room for the "checks"/"traps" reasoning fields, which are dropped after parsing
    maxTokens: 6000,
    temperature: 0.3,
  });
  if (reply.error) return reply;

  let parsed;
  let questions;
  try {
    parsed = extractJson(reply.content);
    questions = normalizeQuestions(parsed.questions)
      .filter((question) => validateQuestion(question).length === 0 && !hasLazyOption(question))
      .slice(0, count);
  } catch {
    return { error: "Модель вернула некорректный JSON. Попробуйте ещё раз." };
  }

  const longIndices = questions.flatMap((question, index) => (isTooLong(question) ? [index] : []));
  if (longIndices.length && Date.now() - startedAt < SHORTEN_BUDGET_MS) {
    const shortened = await shortenQuestions(
      apiKey,
      longIndices.map((index) => questions[index])
    );
    longIndices.forEach((index, i) => {
      questions[index] = shortened[i];
    });
  }

  return {
    title: String(parsed.title || "").trim(),
    questions: questions.map((question) => shuffleQuestionOptions(question)),
  };
}

/** Cheap checks that must pass before a (paid, rate-limited) model call. */
export function checkGenerationSource(source) {
  if (!process.env.DEEPSEEK_API_KEY) return "Не задан DEEPSEEK_API_KEY";
  if (String(source || "").trim().length < 40) {
    return "Вставьте текст подлиннее — хотя бы несколько предложений";
  }
  return null;
}

export const TOPIC_LIMITS = { min: 3, max: 300 };

/** Topic mode: a few words instead of a text. Same pre-checks as for a source. */
export function checkGenerationTopic(topic) {
  if (!process.env.DEEPSEEK_API_KEY) return "Не задан DEEPSEEK_API_KEY";
  const length = String(topic || "").trim().length;
  if (length < TOPIC_LIMITS.min) return "Напишите тему — хотя бы пару слов";
  if (length > TOPIC_LIMITS.max) return `Тема — до ${TOPIC_LIMITS.max} символов; для длинного текста есть режим «Из материала»`;
  return null;
}

export async function generateQuizFromText({ source, topic: topicInput, count, allowMultiple = true }) {
  const topic = String(topicInput || "").trim().replace(/\s+/g, " ");
  const inputError = topic ? checkGenerationTopic(topic) : checkGenerationSource(source);
  if (inputError) return { error: inputError };
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const text = topic ? "" : String(source || "").trim();

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
        topic,
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
  const kept = questions.slice(0, questionCount);
  return {
    title: title.slice(0, QUIZ_LIMITS.maxTitle),
    questions: kept,
    // still long after the rewrite pass: the editor asks to check them
    longCount: kept.filter(isTooLong).length,
    // no source to check against: the editor warns that facts need checking
    fromTopic: Boolean(topic),
  };
}
