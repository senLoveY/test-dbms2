import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { challengeDeadlineMs, CHALLENGE_LIMITS } from "../lib/challenge.js";
import { examDurationSec } from "../lib/exam.js";
import { generateQuizFromText, isTooLong } from "../lib/quizGenerate.js";
import { READING_TIME, readingBonusSec, totalReadingSec } from "../lib/readingTime.js";

const q = (textLength, optionLength = 10, count = 4) => ({
  type: "single",
  text: "в".repeat(textLength),
  options: Array.from({ length: count }, (_, i) => `${i}`.padEnd(optionLength, "о")),
  correct: [0],
});

describe("reading time", () => {
  it("adds nothing to a short question", () => {
    assert.equal(readingBonusSec(q(60, 10)), 0); // 60 + 40 chars
  });

  it("adds a second per 15 chars past the first 150", () => {
    assert.equal(readingBonusSec(q(100, 20)), 2); // 180 chars → 30 extra
    assert.equal(readingBonusSec(q(100, 21)), 3); // 184 chars → 34 extra
  });

  it("is capped", () => {
    assert.equal(readingBonusSec(q(2000, 400)), READING_TIME.maxBonusSec);
  });

  it("matches the SQL that sets room deadlines", () => {
    const sql = readFileSync(new URL("../supabase/migrations/20261022211134_reading_time.sql", import.meta.url), "utf8");
    const fn = sql.slice(sql.indexOf("question_reading_bonus"), sql.indexOf("$$;"));
    assert.match(fn, new RegExp(`least\\(${READING_TIME.maxBonusSec},`));
    assert.match(fn, new RegExp(`- ${READING_TIME.freeChars}\\b`));
    assert.match(fn, new RegExp(`/ ${READING_TIME.charsPerSecond}\\.0`));
  });

  it("extends the exam and the challenge deadline", () => {
    const questions = [q(100, 20), q(10)];
    assert.equal(totalReadingSec(questions), 2);
    assert.equal(examDurationSec(10, 120), examDurationSec(10) + 120);
    assert.equal(
      challengeDeadlineMs(questions) - challengeDeadlineMs([q(10), q(10)]),
      2000
    );
    assert.ok(challengeDeadlineMs([q(10)]) >= CHALLENGE_LIMITS.secondsPerQuestion * 1000);
  });
});

describe("generated question length", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const longOption = "Это очень длинный вариант ответа с пояснением, оговорками и скобками (как в учебнике), который не прочитать за секунды";
  const longQuestion = { type: "single", text: "Что верно?", options: [longOption, "Б", "В", "Г"], correct: [0] };

  function mockModel(replies) {
    const calls = [];
    globalThis.fetch = async (_url, init) => {
      calls.push(JSON.parse(init.body));
      const content = JSON.stringify(replies[calls.length - 1]);
      return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
    };
    return calls;
  }

  it("flags options that run past the limit", () => {
    assert.equal(isTooLong(longQuestion), true);
    assert.equal(isTooLong({ ...longQuestion, options: ["А", "Б", "В", "Г"] }), false);
  });

  it("rewrites long questions once and keeps the right answer", async () => {
    process.env.DEEPSEEK_API_KEY = "test";
    const calls = mockModel([
      { title: "T", questions: [longQuestion] },
      { questions: [{ text: "Что верно?", options: ["Короткий верный", "Б", "В", "Г"] }] },
    ]);
    const result = await generateQuizFromText({ source: "текст ".repeat(20), count: 1 });
    assert.equal(calls.length, 2);
    const [question] = result.questions;
    assert.deepEqual(question.correct.map((i) => question.options[i]), ["Короткий верный"]);
    assert.equal(result.longCount, 0);
  });

  it("keeps the original when the rewrite changes the shape", async () => {
    process.env.DEEPSEEK_API_KEY = "test";
    mockModel([
      { title: "T", questions: [longQuestion] },
      { questions: [{ text: "Что?", options: ["А", "Б"] }] },
    ]);
    const result = await generateQuizFromText({ source: "текст ".repeat(20), count: 1 });
    assert.ok(result.questions[0].options.includes(longOption));
    assert.equal(result.longCount, 1);
  });

  it("doesn't call the model again when everything is short", async () => {
    process.env.DEEPSEEK_API_KEY = "test";
    const calls = mockModel([{ title: "T", questions: [{ ...longQuestion, options: ["А", "Б", "В", "Г"] }] }]);
    await generateQuizFromText({ source: "текст ".repeat(20), count: 1 });
    assert.equal(calls.length, 1);
  });
});
