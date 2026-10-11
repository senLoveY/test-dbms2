import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildProgress, questionKey } from "../lib/progress.js";
import { checkGenerationSource } from "../lib/quizGenerate.js";
import { generateRoomCode } from "../lib/roomCode.js";

describe("room codes", () => {
  it("use only unambiguous characters", () => {
    for (let i = 0; i < 200; i += 1) assert.match(generateRoomCode(), /^[A-HJ-NP-Z2-9]{6}$/);
  });

  it("don't repeat in practice", () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generateRoomCode()));
    assert.ok(codes.size > 1990);
  });
});

describe("progress from untrusted rows", () => {
  it("skips malformed answer items instead of crashing", () => {
    const key = questionKey({ type: "single", text: "Q" });
    const progress = buildProgress([
      { created_at: "2026-01-01", answers: [null, 5, { ok: true }, { k: key, ok: true }] },
      { created_at: "2026-01-02", answers: { practice: true, items: "nope" } },
    ]);
    assert.deepEqual(Object.keys(progress), [key]);
  });
});

describe("generation pre-checks", () => {
  it("rejects short input before any paid call", () => {
    process.env.DEEPSEEK_API_KEY = "test";
    assert.match(checkGenerationSource("коротко"), /подлиннее/);
    assert.equal(checkGenerationSource("а".repeat(60)), null);
  });

  it("reports a missing model key", () => {
    delete process.env.DEEPSEEK_API_KEY;
    assert.match(checkGenerationSource("а".repeat(60)), /DEEPSEEK_API_KEY/);
  });
});
