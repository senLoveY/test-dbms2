import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { examDurationSec, examGrade, formatClock } from "../lib/exam.js";
import {
  buildChallengeSnapshot,
  challengeQuestionCount,
  gradeChallenge,
  rankResults,
  toPublicQuestions,
} from "../lib/challenge.js";

describe("exam", () => {
  it("gives 45 s per question in whole minutes, within 5–60 min", () => {
    assert.equal(examDurationSec(10), 480);
    assert.equal(examDurationSec(2), 300);
    assert.equal(examDurationSec(200), 3600);
  });

  it("maps percent to a school grade", () => {
    assert.deepEqual(examGrade(9, 10), { grade: 5, label: "отлично", percent: 90 });
    assert.equal(examGrade(8, 10).grade, 4);
    assert.equal(examGrade(5, 10).grade, 3);
    assert.equal(examGrade(4, 10).grade, 2);
    assert.equal(examGrade(0, 0).grade, 2);
  });

  it("formats the clock", () => {
    assert.equal(formatClock(65), "1:05");
    assert.equal(formatClock(-3), "0:00");
  });
});

const bank = Array.from({ length: 12 }, (_, i) => ({
  type: i % 3 ? "single" : "multiple",
  text: `Q${i}`,
  options: ["A", "B", "C", "D"],
  correct: i % 3 ? [1] : [0, 2],
}));

function seeded(seed) {
  let state = seed;
  return () => (state = (state * 9301 + 49297) % 233280) / 233280;
}

describe("challenge snapshot", () => {
  it("clamps the question count to the allowed choices and the bank", () => {
    assert.equal(challengeQuestionCount(15, 12), 12);
    assert.equal(challengeQuestionCount(7, 40), 10);
    assert.equal(challengeQuestionCount(5, 3), 3);
  });

  it("keeps each correct answer attached to its text after shuffling", () => {
    const snapshot = buildChallengeSnapshot(bank, 10, seeded(7));
    assert.equal(snapshot.length, 10);
    for (const question of snapshot) {
      const source = bank.find((item) => item.text === question.text);
      const expected = source.correct.map((index) => source.options[index]).sort();
      assert.deepEqual(question.correct.map((index) => question.options[index]).sort(), expected);
    }
  });

  it("never sends correct answers to players", () => {
    for (const question of toPublicQuestions(buildChallengeSnapshot(bank, 5))) {
      assert.equal("correct" in question, false);
    }
  });
});

describe("gradeChallenge", () => {
  const snapshot = [
    { type: "single", text: "a", options: ["x", "y"], correct: [1] },
    { type: "multiple", text: "b", options: ["x", "y", "z"], correct: [0, 2] },
    { type: "single", text: "c", options: ["x", "y"], correct: [0] },
  ];

  it("counts only fully correct answers", () => {
    const result = gradeChallenge(snapshot, [[1], [0], [0]]);
    assert.equal(result.correct, 2);
    assert.deepEqual(result.items.map((item) => item.ok), [true, false, true]);
  });

  it("ignores junk and missing answers", () => {
    const result = gradeChallenge(snapshot, [[1, 1, 9, "x"], null]);
    assert.deepEqual(result.items[0].selected, [1]);
    assert.equal(result.items[0].ok, true);
    assert.equal(result.correct, 1);
  });
});

describe("rankResults", () => {
  it("orders by correct answers, then time, then who finished first", () => {
    const ranked = rankResults([
      { name: "slow", correct: 8, durationMs: 90_000, finishedAt: "2026-01-01T10:00:00Z" },
      { name: "late", correct: 8, durationMs: 60_000, finishedAt: "2026-01-02T10:00:00Z" },
      { name: "best", correct: 9, durationMs: 120_000, finishedAt: "2026-01-03T10:00:00Z" },
      { name: "early", correct: 8, durationMs: 60_000, finishedAt: "2026-01-01T09:00:00Z" },
    ]);
    assert.deepEqual(ranked.map((r) => r.name), ["best", "early", "late", "slow"]);
  });
});
