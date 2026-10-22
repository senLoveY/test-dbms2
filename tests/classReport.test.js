import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildClassReport, summarizeClassReport } from "../lib/classReport.js";

const row = {
  id: "r1",
  room_id: "room",
  quiz_title: "Нормальные формы",
  question_total: 3,
  created_at: "2026-10-22T10:00:00Z",
  questions: [
    // recorded out of order on purpose
    { index: 1, type: "single", text: "Что такое 2НФ?", options: ["А", "Б", "В", "Г"], correct: [2], counts: [1, 6, 2, 1], players: 10, answered: 10, correctCount: 2 },
    { index: 0, type: "single", text: "Что такое 1НФ?", options: ["А", "Б", "В", "Г"], correct: [0], counts: [9, 1, 0, 0], players: 10, answered: 10, correctCount: 9 },
  ],
  players: [
    { name: "Аня", score: 1800, correct: 2 },
    { name: "Боря", score: 900, correct: 1 },
  ],
};

describe("lesson report", () => {
  const report = buildClassReport(row);

  it("puts questions in play order and averages correct answers", () => {
    assert.deepEqual(report.questions.map((q) => q.index), [0, 1]);
    assert.equal(report.averagePercent, 55); // 11 of 20
    assert.equal(report.questionsPlayed, 2);
    assert.equal(report.questionTotal, 3);
  });

  it("lists questions under 60% as the ones to go over, hardest first", () => {
    assert.deepEqual(report.struggles.map((q) => q.text), ["Что такое 2НФ?"]);
    assert.equal(report.struggles[0].correctPercent, 20);
  });

  it("names the wrong option most people picked", () => {
    const trap = report.questions[1].trap;
    assert.deepEqual([trap.label, trap.count, trap.percent], ["Б", 6, 60]);
    assert.equal(report.questions[0].trap.label, "Б");
  });

  it("has no trap when nobody picked a wrong option", () => {
    const clean = buildClassReport({ ...row, questions: [{ ...row.questions[1], counts: [10, 0, 0, 0], correctCount: 10 }] });
    assert.equal(clean.questions[0].trap, null);
  });

  it("summarizes a lesson for the list", () => {
    const summary = summarizeClassReport(row);
    assert.deepEqual(
      [summary.playerCount, summary.questionsPlayed, summary.averagePercent, summary.struggleCount],
      [2, 2, 55, 1]
    );
  });

  it("survives malformed rows", () => {
    const empty = buildClassReport({ id: "x", questions: null, players: "nope" });
    assert.equal(empty.averagePercent, 0);
    assert.deepEqual(empty.struggles, []);
  });

  it("is recorded in the same transaction as the reveal", () => {
    const sql = readFileSync(new URL("../supabase/class-reports-migration.sql", import.meta.url), "utf8");
    const reveal = sql.slice(sql.indexOf("function public.room_try_reveal_locked"));
    assert.match(reveal, /perform public\.class_report_record\(v_room\.id\)/);
    assert.match(sql, /revoke all on public\.class_reports from anon, authenticated/);
  });
});
