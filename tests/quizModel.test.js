import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  QUIZ_LIMITS,
  canPlayQuiz,
  getPublishErrors,
  normalizeQuestion,
  normalizeQuizMeta,
  normalizeTags,
  parseImportPayload,
  toExportPayload,
  validateQuestion,
} from "../lib/quizModel.js";

describe("normalizeQuestion", () => {
  it("pads options up to the minimum", () => {
    assert.deepEqual(normalizeQuestion({ text: "Q" }).options, ["", ""]);
  });

  it("keeps a single correct answer for single-choice questions", () => {
    const q = normalizeQuestion({ type: "single", options: ["a", "b", "c"], correct: [2, 0] });
    assert.deepEqual(q.correct, [0]);
  });

  it("drops out-of-range and duplicate correct indices", () => {
    const q = normalizeQuestion({ type: "multiple", options: ["a", "b"], correct: [1, 1, 5, -1, "0"] });
    assert.deepEqual(q.correct, [0, 1]);
  });

  it("caps the number of options", () => {
    const options = Array.from({ length: 20 }, (_, i) => `o${i}`);
    assert.equal(normalizeQuestion({ options }).options.length, QUIZ_LIMITS.maxOptions);
  });

  it("accepts options given as objects", () => {
    assert.deepEqual(normalizeQuestion({ options: [{ text: " a " }, "b"] }).options, ["a", "b"]);
  });
});

describe("validation", () => {
  it("reports an empty question", () => {
    const errors = validateQuestion(normalizeQuestion({}));
    assert.ok(errors.includes("Введите текст вопроса"));
    assert.ok(errors.includes("Отметьте хотя бы один правильный ответ"));
  });

  it("passes a complete question", () => {
    assert.deepEqual(validateQuestion(normalizeQuestion({ text: "Q", options: ["a", "b"], correct: [0] })), []);
  });

  it("refuses to publish an empty quiz", () => {
    assert.deepEqual(getPublishErrors([]), ["Добавьте хотя бы один вопрос"]);
  });

  it("names the broken question when publishing", () => {
    const good = normalizeQuestion({ text: "Q", options: ["a", "b"], correct: [0] });
    const bad = normalizeQuestion({ text: "", options: ["a", "b"], correct: [0] });
    assert.deepEqual(getPublishErrors([good, bad]), ["Вопрос 2: Введите текст вопроса"]);
  });
});

describe("meta and tags", () => {
  it("lowercases, trims and dedupes tags", () => {
    assert.deepEqual(normalizeTags(" SQL, бд ,sql,, "), ["sql", "бд"]);
  });

  it("falls back to safe defaults", () => {
    assert.deepEqual(normalizeQuizMeta({ status: "weird", visibility: "public" }), {
      title: "Без названия",
      description: "",
      tags: [],
      status: "draft",
      visibility: "private",
    });
  });
});

describe("JSON import/export", () => {
  it("round-trips a quiz", () => {
    const quiz = {
      title: "T",
      description: "D",
      tags: ["x"],
      questions: [{ id: "1", type: "single", text: "Q", options: ["a", "b"], correct: [1] }],
    };
    const parsed = parseImportPayload(JSON.stringify(toExportPayload(quiz)));
    assert.equal(parsed.title, "T");
    assert.deepEqual(parsed.questions[0].options, ["a", "b"]);
    assert.deepEqual(parsed.questions[0].correct, [1]);
  });

  it("accepts a bare array of questions", () => {
    assert.equal(parseImportPayload([{ text: "Q", options: ["a", "b"], correct: [0] }]).questions.length, 1);
  });

  it("rejects garbage", () => {
    assert.throws(() => parseImportPayload("42"), /Некорректный JSON/);
  });
});

describe("canPlayQuiz", () => {
  const quiz = { owner_id: "owner", status: "published", visibility: "private" };

  it("lets the owner play their own quiz in any state", () => {
    assert.equal(canPlayQuiz({ ...quiz, status: "draft" }, "owner"), true);
  });

  it("hides private quizzes from others", () => {
    assert.equal(canPlayQuiz(quiz, "guest"), false);
  });

  it("opens published link-only quizzes to anyone signed in", () => {
    assert.equal(canPlayQuiz({ ...quiz, visibility: "unlisted" }, "guest"), true);
  });

  it("keeps unpublished link-only quizzes closed", () => {
    assert.equal(canPlayQuiz({ ...quiz, visibility: "unlisted", status: "draft" }, "guest"), false);
  });

  it("requires a user", () => {
    assert.equal(canPlayQuiz({ ...quiz, visibility: "unlisted" }, null), false);
  });
});
