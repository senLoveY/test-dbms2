import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyClassroomPush } from "../lib/classroomPush.js";
import { buildRoomView } from "../lib/roomService.js";

const question = { id: "q1", type: "single", text: "2 + 2?", options: ["3", "4", "5", "22"], correct: [1] };
const baseRoom = {
  id: "room-1",
  host_id: "host",
  mode: "classroom",
  current_index: 0,
  time_limit_sec: 30,
  question_count: 2,
  reveal_pause_ms: 3500,
  settings: { shuffleOptions: true },
  question_started_at: "2026-10-23T10:00:00Z",
  question_deadline_at: "2026-10-23T10:00:30Z",
};
const player = (id, score, extra = {}) => ({
  user_id: id, username: id, score, correct_count: 0, has_answered: false,
  last_answer: null, last_answer_correct: null, last_points: 0, ...extra,
});

function raw(status, players, room = {}) {
  return { room: { ...baseRoom, status, ...room }, question, players, quiz_question_total: 2 };
}

describe("classroom push", () => {
  const lobby = buildRoomView(raw("waiting", [player("anna", 0), player("vera", 0)]), "vera");

  it("turns a question row into what the API would have returned", () => {
    const row = { ...baseRoom, status: "playing", public_question: { index: 0, question: { ...question, correct: undefined } } };
    const pushed = applyClassroomPush(lobby, row);
    const fetched = buildRoomView(raw("playing", [player("anna", 0), player("vera", 0)]), "vera");
    assert.deepEqual(pushed.currentQuestion, fetched.currentQuestion);
    assert.equal(pushed.players[0].has_answered, false);
    assert.equal(pushed.room.status, "playing");
    assert.equal("public_question" in pushed.room, false);
  });

  it("gives the same place and points as the API after the reveal", () => {
    const answered = [
      player("anna", 900, { has_answered: true, last_answer: [1], last_answer_correct: true, last_points: 900 }),
      player("vera", 0, { has_answered: true, last_answer: [0], last_answer_correct: false }),
    ];
    const playing = buildRoomView(raw("playing", answered), "vera");
    const row = {
      ...baseRoom,
      status: "revealing",
      public_reveal: {
        index: 0,
        correctOptions: ["4"],
        standings: [
          { id: "anna", name: "anna", score: 900, round: 900, ok: true, skipped: false },
          { id: "vera", name: "vera", score: 0, round: 0, ok: false, skipped: false },
        ],
      },
    };
    const pushed = applyClassroomPush(playing, row);
    const fetched = buildRoomView(raw("revealing", answered), "vera");
    assert.equal(pushed.classroom.rank, fetched.classroom.rank);
    assert.equal(pushed.classroom.playerCount, fetched.classroom.playerCount);
    assert.equal(pushed.players[0].roundPoints, fetched.players[0].roundPoints);
    assert.equal(pushed.players[0].last_answer_correct, fetched.players[0].last_answer_correct);
    assert.deepEqual(pushed.reveal.correctOptions, fetched.reveal.correctOptions);
  });

  it("builds the podium at the end", () => {
    const revealing = { ...lobby, room: { ...lobby.room, status: "revealing" } };
    const row = {
      ...baseRoom, status: "finished", current_index: 2,
      public_reveal: { index: 1, correctOptions: [], standings: [
        { id: "vera", name: "vera", score: 500, round: 0, ok: false, skipped: false },
        { id: "anna", name: "anna", score: 1800, round: 0, ok: false, skipped: false },
      ] },
    };
    const pushed = applyClassroomPush(revealing, row);
    assert.deepEqual(pushed.classroom.podium.map((p) => p.username), ["anna", "vera"]);
    assert.equal(pushed.classroom.rank, 2);
  });

  it("falls back to a fetch when the row isn't enough", () => {
    const playingRow = { ...baseRoom, status: "playing" };
    assert.equal(applyClassroomPush(lobby, playingRow), null, "no public_question (before the migration)");
    assert.equal(applyClassroomPush(lobby, { ...playingRow, public_question: { index: 1, question } }), null, "stale question");
    assert.equal(applyClassroomPush(lobby, { ...baseRoom, status: "waiting" }), null, "lobby");
    const host = buildRoomView(raw("waiting", [player("anna", 0)]), "host");
    assert.equal(applyClassroomPush(host, { ...playingRow, public_question: { index: 0, question } }), null, "host screen");
    assert.equal(
      applyClassroomPush(lobby, { ...baseRoom, status: "revealing", public_reveal: { index: 0, standings: [] } }),
      null,
      "player missing from standings"
    );
  });
});
