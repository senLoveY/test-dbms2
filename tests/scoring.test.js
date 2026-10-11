import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computePoints, MIN_TIME_FACTOR } from "../lib/scoring.js";

describe("computePoints", () => {
  it("gives full points for an instant correct answer", () => {
    assert.equal(computePoints(1, 30_000, 0), 1000);
  });

  it("gives the minimum time factor at the deadline", () => {
    assert.equal(computePoints(1, 30_000, 30_000), 1000 * MIN_TIME_FACTOR);
  });

  it("never drops below the minimum factor when answered late", () => {
    assert.equal(computePoints(1, 30_000, 45_000), 1000 * MIN_TIME_FACTOR);
  });

  it("scales linearly with the time left", () => {
    // half the time left: 0.6 + 0.4 * 0.5 = 0.8
    assert.equal(computePoints(1, 30_000, 15_000), 800);
  });

  it("scales with partial correctness", () => {
    assert.equal(computePoints(0.5, 30_000, 0), 500);
  });

  it("gives nothing for a wrong answer", () => {
    assert.equal(computePoints(0, 30_000, 0), 0);
    assert.equal(computePoints(-1, 30_000, 0), 0);
  });

  it("respects custom max points and min factor", () => {
    assert.equal(computePoints(1, 10_000, 10_000, { maxPoints: 1500, minTimeFactor: 0.4 }), 600);
  });
});
