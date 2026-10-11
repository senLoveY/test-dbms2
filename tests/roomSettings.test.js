import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_ROOM_SETTINGS,
  normalizeRoomSettings,
  parseRoomRecord,
  questionCountChoices,
  settingsToDbColumns,
} from "../lib/roomSettings.js";

describe("normalizeRoomSettings", () => {
  it("returns defaults for empty input", () => {
    assert.deepEqual(normalizeRoomSettings(), DEFAULT_ROOM_SETTINGS);
  });

  it("rejects values outside the allowed lists", () => {
    const s = normalizeRoomSettings({ timeLimitSec: 7, revealPauseMs: 1, maxPointsPerQuestion: 9999 });
    assert.equal(s.timeLimitSec, 30);
    assert.equal(s.revealPauseMs, 3500);
    assert.equal(s.maxPointsPerQuestion, 1000);
  });

  it("clamps the question count", () => {
    assert.equal(normalizeRoomSettings({ questionCount: 500 }).questionCount, 100);
    assert.equal(normalizeRoomSettings({ questionCount: 0 }).questionCount, 1);
  });

  it("accepts numeric strings from forms", () => {
    assert.equal(normalizeRoomSettings({ timeLimitSec: "45" }).timeLimitSec, 45);
  });
});

describe("database mapping", () => {
  it("round-trips through db columns", () => {
    const settings = normalizeRoomSettings({ timeLimitSec: 20, questionCount: 5, partialCredit: false });
    const columns = settingsToDbColumns(settings);
    assert.deepEqual(parseRoomRecord({ ...columns }), settings);
  });

  it("ignores extra keys stored in the settings json", () => {
    const columns = settingsToDbColumns(DEFAULT_ROOM_SETTINGS);
    const room = { ...columns, settings: { ...columns.settings, rematchCode: "ABC234" } };
    assert.deepEqual(parseRoomRecord(room), DEFAULT_ROOM_SETTINGS);
  });
});

describe("questionCountChoices", () => {
  it("offers presets below the quiz size plus the size itself", () => {
    assert.deepEqual(questionCountChoices(12), [5, 10, 12]);
  });

  it("offers the size alone for tiny quizzes", () => {
    assert.deepEqual(questionCountChoices(3), [3]);
  });
});
