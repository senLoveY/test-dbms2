import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasLazyOption, shuffleQuestionOptions } from "../lib/quizGenerate.js";

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
