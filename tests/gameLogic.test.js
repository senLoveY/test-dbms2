import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOptionOrder,
  getCorrectOptions,
  getPublicQuestion,
  getSelectedAnswerBreakdown,
  gradeAnswerDetailed,
  mapDisplayIndicesToOriginal,
} from "../lib/gameLogic.js";

const single = { id: "q1", type: "single", text: "2 + 2?", options: ["3", "4", "5"], correct: [1] };
const multiple = {
  id: "q2",
  type: "multiple",
  text: "Чётные?",
  options: ["1", "2", "3", "4"],
  correct: [1, 3],
};

describe("gradeAnswerDetailed — single", () => {
  it("accepts the correct option", () => {
    const grade = gradeAnswerDetailed(single, [1]);
    assert.equal(grade.isFullyCorrect, true);
    assert.equal(grade.scoreRatio, 1);
  });

  it("rejects a wrong option", () => {
    const grade = gradeAnswerDetailed(single, [0]);
    assert.equal(grade.isFullyCorrect, false);
    assert.equal(grade.scoreRatio, 0);
    assert.deepEqual(grade.wrongSelected, [0]);
    assert.deepEqual(grade.missedCorrect, [1]);
  });

  it("ignores duplicate selections", () => {
    assert.equal(gradeAnswerDetailed(single, [1, 1]).isFullyCorrect, true);
  });

  it("handles missing input", () => {
    assert.equal(gradeAnswerDetailed(null, [1]).scoreRatio, 0);
    assert.equal(gradeAnswerDetailed(single, null).scoreRatio, 0);
  });
});

describe("gradeAnswerDetailed — multiple", () => {
  it("accepts exactly the correct set in any order", () => {
    assert.equal(gradeAnswerDetailed(multiple, [3, 1]).isFullyCorrect, true);
  });

  it("gives partial credit for an incomplete answer", () => {
    const grade = gradeAnswerDetailed(multiple, [1]);
    assert.equal(grade.isPartial, true);
    assert.equal(grade.scoreRatio, 0.5);
  });

  it("subtracts wrong picks from partial credit", () => {
    const grade = gradeAnswerDetailed(multiple, [1, 0]);
    assert.equal(grade.scoreRatio, 0);
    assert.equal(grade.isPartial, false);
  });

  it("never goes below zero", () => {
    assert.equal(gradeAnswerDetailed(multiple, [0, 2]).scoreRatio, 0);
  });

  it("gives nothing for an incomplete answer without partial credit", () => {
    const grade = gradeAnswerDetailed(multiple, [1], { partialCredit: false });
    assert.equal(grade.scoreRatio, 0);
    assert.equal(grade.isPartial, false);
  });
});

describe("option shuffling", () => {
  it("is a permutation", () => {
    const order = buildOptionOrder(6, "room:0:q1");
    assert.deepEqual([...order].sort(), [0, 1, 2, 3, 4, 5]);
  });

  it("is deterministic for the same key, so both players see the same order", () => {
    assert.deepEqual(buildOptionOrder(8, "room:3:q9"), buildOptionOrder(8, "room:3:q9"));
  });

  it("maps displayed picks back to the original options", () => {
    const order = buildOptionOrder(single.options.length, "room:0:q1");
    const shown = getPublicQuestion(single, "room:0:q1");
    const displayIndex = shown.options.indexOf("4");
    assert.deepEqual(mapDisplayIndicesToOriginal([displayIndex], order), [1]);
  });

  it("does not leak correct answers in the public question", () => {
    assert.equal("correct" in getPublicQuestion(single), false);
  });
});

describe("helpers", () => {
  it("lists correct option labels", () => {
    assert.deepEqual(getCorrectOptions(multiple), ["2", "4"]);
  });

  it("marks each selected option as right or wrong", () => {
    assert.deepEqual(getSelectedAnswerBreakdown(multiple, [0, 1]), [
      { label: "1", state: "wrong-selected" },
      { label: "2", state: "right-selected" },
    ]);
  });
});
