import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LEARNED_STREAK,
  buildAttemptAnswers,
  buildProgress,
  classifyStat,
  isPracticeAttempt,
  pickReviewQuestions,
  questionKey,
  sanitizeAttemptAnswers,
  summarizeProgress,
  toStoredAnswers,
} from "../lib/progress.js";

const q = (text, type = "single") => ({ id: crypto.randomUUID(), type, text, options: ["a", "b"], correct: [0] });

function attempt(day, items, practice = false) {
  return { created_at: `2026-01-${String(day).padStart(2, "0")}T10:00:00Z`, answers: toStoredAnswers(items, practice) };
}

const item = (question, ok) => ({ k: questionKey(question), ok });

describe("questionKey", () => {
  it("survives re-saving (new ids) and whitespace / case edits", () => {
    assert.equal(questionKey(q("Что такое 3НФ?")), questionKey(q("  что такое   3нф? ")));
  });

  it("differs for different text or type", () => {
    assert.notEqual(questionKey(q("A")), questionKey(q("B")));
    assert.notEqual(questionKey(q("A", "single")), questionKey(q("A", "multiple")));
  });
});

describe("attempt payloads", () => {
  it("builds one item per question", () => {
    const a = q("A");
    const b = q("B");
    assert.deepEqual(buildAttemptAnswers([a, b], (question) => question === a), [item(a, true), item(b, false)]);
  });

  it("drops malformed items and coerces ok to a boolean", () => {
    assert.deepEqual(sanitizeAttemptAnswers([{ k: "abc", ok: 1 }, { k: 5 }, null, { k: "x".repeat(40), ok: true }]), [
      { k: "abc", ok: false },
    ]);
    assert.deepEqual(sanitizeAttemptAnswers("nope"), []);
  });

  it("tags practice runs", () => {
    assert.equal(isPracticeAttempt(toStoredAnswers([], true)), true);
    assert.equal(isPracticeAttempt(toStoredAnswers([], false)), false);
    assert.equal(isPracticeAttempt([]), false);
  });
});

describe("buildProgress", () => {
  const a = q("A");

  it("counts answers in chronological order regardless of input order", () => {
    const progress = buildProgress([attempt(3, [item(a, true)]), attempt(1, [item(a, false)]), attempt(2, [item(a, true)])]);
    assert.deepEqual(progress[questionKey(a)], {
      seen: 3,
      wrong: 1,
      streak: 2,
      lastOk: true,
      lastAt: "2026-01-03T10:00:00Z",
    });
  });

  it("includes practice runs", () => {
    const progress = buildProgress([attempt(1, [item(a, false)]), attempt(2, [item(a, true)], true)]);
    assert.equal(progress[questionKey(a)].seen, 2);
  });

  it("tolerates legacy attempts without answers", () => {
    assert.deepEqual(buildProgress([{ created_at: "2026-01-01", answers: [] }, { created_at: "2026-01-02" }]), {});
  });
});

describe("classification", () => {
  it("sorts a question into its learning stage", () => {
    assert.equal(classifyStat(undefined), "new");
    assert.equal(classifyStat({ seen: 4, lastOk: false, streak: 0 }), "weak");
    assert.equal(classifyStat({ seen: 1, lastOk: true, streak: 1 }), "learning");
    assert.equal(classifyStat({ seen: 3, lastOk: true, streak: LEARNED_STREAK }), "learned");
  });

  it("summarizes a quiz", () => {
    const [a, b, c] = [q("A"), q("B"), q("C")];
    const progress = buildProgress([attempt(1, [item(a, false), item(b, true)])]);
    assert.deepEqual(summarizeProgress([a, b, c], progress), { new: 1, weak: 1, learning: 1, learned: 0, total: 3 });
  });
});

describe("pickReviewQuestions", () => {
  const [weakOften, weakOnce, learning, learned, fresh] = ["W1", "W2", "L", "D", "N"].map((t) => q(t));
  const progress = buildProgress([
    attempt(1, [item(weakOften, false), item(weakOnce, true), item(learning, true), item(learned, true)]),
    attempt(2, [item(weakOften, false), item(weakOnce, true), item(learned, true)]),
    attempt(3, [item(weakOften, false), item(weakOnce, false), item(learned, true)]),
  ]);
  const all = [fresh, learned, learning, weakOnce, weakOften];

  it("puts weak spots first, then learning, then new, and skips learned", () => {
    assert.deepEqual(pickReviewQuestions(all, progress), [weakOften, weakOnce, learning, fresh]);
  });

  it("respects the batch size", () => {
    assert.deepEqual(pickReviewQuestions(all, progress, 2), [weakOften, weakOnce]);
  });

  it("returns nothing when everything is learned", () => {
    assert.deepEqual(pickReviewQuestions([learned], progress), []);
  });

  it("works without any history", () => {
    assert.deepEqual(pickReviewQuestions([fresh, learned], {}), [fresh, learned]);
  });
});
