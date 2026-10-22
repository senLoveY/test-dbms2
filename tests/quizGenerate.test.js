import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkGenerationTopic, generateQuizFromText, hasLazyOption, shuffleQuestionOptions } from "../lib/quizGenerate.js";

const question = (options, correct = [0]) => ({ type: "single", text: "Q", options, correct });

describe("hasLazyOption", () => {
  for (const option of [
    "Все перечисленное",
    "Всё вышеперечисленное.",
    "все варианты верны",
    "Ничего из перечисленного",
    "Ни один из вариантов",
    "Нет правильного ответа",
    "Оба варианта",
    "All of the above",
  ]) {
    it(`flags «${option}»`, () => {
      assert.equal(hasLazyOption(question(["a", option])), true);
    });
  }

  it("keeps real options that merely contain those words", () => {
    assert.equal(hasLazyOption(question(["Все атрибуты зависят от ключа", "Ничего не меняется в схеме"])), false);
  });
});

describe("shuffleQuestionOptions", () => {
  it("keeps every option and moves the correct index with its text", () => {
    const original = { type: "multiple", text: "Q", options: ["A", "B", "C", "D"], correct: [0, 2] };
    for (let seed = 0; seed < 20; seed += 1) {
      let state = seed;
      const random = () => ((state = (state * 9301 + 49297) % 233280) / 233280);
      const shuffled = shuffleQuestionOptions(original, random);
      assert.deepEqual([...shuffled.options].sort(), ["A", "B", "C", "D"]);
      assert.deepEqual(shuffled.correct.map((i) => shuffled.options[i]).sort(), ["A", "C"]);
    }
  });

  it("spreads the right answer across positions", () => {
    const positions = new Set();
    for (let i = 0; i < 200; i += 1) positions.add(shuffleQuestionOptions(question(["A", "B", "C", "D"])).correct[0]);
    assert.equal(positions.size, 4);
  });
});

describe("topic mode", () => {
  const realFetch = globalThis.fetch;
  const ok = { type: "single", text: "Какой газ выделяется при фотосинтезе?", options: ["Кислород", "Азот", "Водород", "Гелий"], correct: [0] };

  function mockModel() {
    const bodies = [];
    globalThis.fetch = async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      const content = JSON.stringify({ title: "Фотосинтез", questions: [ok] });
      return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
    };
    return bodies;
  }

  it("asks for settled textbook facts instead of a source text", async () => {
    process.env.DEEPSEEK_API_KEY = "test";
    const bodies = mockModel();
    const result = await generateQuizFromText({ topic: "  Фотосинтез   у растений ", count: 1 });
    globalThis.fetch = realFetch;
    const [system, user] = bodies[0].messages.map((m) => m.content);
    assert.match(user, /по теме: Фотосинтез у растений$/);
    assert.doesNotMatch(user, /по материалу/);
    assert.match(system, /уровня учебника/);
    assert.doesNotMatch(system, /опирайся только на данный текст/);
    assert.equal(result.fromTopic, true);
  });

  it("splits a big topic request into sub-topics", async () => {
    process.env.DEEPSEEK_API_KEY = "test";
    const bodies = mockModel();
    await generateQuizFromText({ topic: "Фотосинтез", count: 12 });
    globalThis.fetch = realFetch;
    assert.ok(bodies.length > 1);
    assert.match(bodies[1].messages[1].content, /подтемы/);
  });

  it("checks the topic before any paid call", () => {
    process.env.DEEPSEEK_API_KEY = "test";
    assert.match(checkGenerationTopic("а"), /пару слов/);
    assert.match(checkGenerationTopic("т".repeat(301)), /до 300/);
    assert.equal(checkGenerationTopic("Нормальные формы"), null);
  });
});
