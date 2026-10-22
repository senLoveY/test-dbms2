import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { answerDistribution, normalizeNickname, normalizeRoomMode } from "../lib/classroom.js";
import { buildRoomView } from "../lib/roomService.js";
import { getPublicQuestion, getQuestionShuffleKey } from "../lib/gameLogic.js";

const HOST = "host";
const question = { id: "q1", type: "single", text: "2 + 2?", options: ["3", "4", "5", "22"], correct: [1] };

function player(id, score, extra = {}) {
  return {
    user_id: id,
    username: id,
    score,
    correct_count: 0,
    has_answered: false,
    last_answer: null,
    last_answer_correct: null,
    last_points: 0,
    ...extra,
  };
}

function raw(status, players) {
  return {
    room: {
      id: "room-1",
      host_id: HOST,
      mode: "classroom",
      status,
      current_index: 0,
      time_limit_sec: 30,
      question_count: 1,
      reveal_pause_ms: 3500,
      settings: { shuffleOptions: true },
    },
    question,
    players,
    quiz_question_total: 1,
  };
}

describe("classroom nicknames", () => {
  it("trims and limits names", () => {
    assert.deepEqual(normalizeNickname("  Саша   К "), { nickname: "Саша К" });
    assert.ok(normalizeNickname("я").error);
    assert.ok(normalizeNickname("x".repeat(21)).error);
  });

  it("rejects links and addresses", () => {
    for (const bad of ["http://spam", "www.site", "casino.com", "me@mail"]) {
      assert.ok(normalizeNickname(bad).error, bad);
    }
  });

  it("falls back to duel for unknown modes", () => {
    assert.equal(normalizeRoomMode("classroom"), "classroom");
    assert.equal(normalizeRoomMode("party"), "duel");
  });
});

describe("classroom view", () => {
  const players = [
    player("anna", 900, { has_answered: true, last_answer: [1], last_answer_correct: true, last_points: 900 }),
    player("boris", 0, { has_answered: true, last_answer: [0], last_answer_correct: false }),
    player("vera", 500, { has_answered: true, last_answer: [1], last_answer_correct: true, last_points: 500 }),
  ];

  it("gives the host every player, the answer counts and no player answers", () => {
    const view = buildRoomView(raw("revealing", players), HOST);
    assert.equal(view.viewer.isHost, true);
    assert.deepEqual(view.players.map((p) => p.username), ["anna", "vera", "boris"]);
    assert.ok(view.players.every((p) => !("last_answer" in p)));
    assert.equal(view.classroom.answered, 3);
    assert.equal(view.classroom.distribution.reduce((a, b) => a + b, 0), 3);
  });

  it("counts answers in the order the screen shows the options", () => {
    const room = raw("revealing", players).room;
    const counts = answerDistribution(room, question, { shuffleOptions: true }, players);
    const shown = getPublicQuestion(question, getQuestionShuffleKey(room.id, 0, question.id)).options;
    assert.equal(counts[shown.indexOf("4")], 2);
    assert.equal(counts[shown.indexOf("3")], 1);
  });

  it("gives a player only their own row and place", () => {
    const view = buildRoomView(raw("revealing", players), "vera");
    assert.equal(view.viewer.isHost, false);
    assert.deepEqual(view.players.map((p) => p.username), ["vera"]);
    assert.equal(view.classroom.rank, 2);
    assert.equal(view.classroom.playerCount, 3);
    assert.equal(view.classroom.distribution, undefined);
    assert.equal(view.players[0].roundPoints, 500);
  });

  it("hides round results from a player while the question is open", () => {
    const view = buildRoomView(raw("playing", players), "boris");
    assert.equal(view.players[0].last_answer_correct, null);
    assert.equal(view.players[0].roundPoints, null);
    assert.equal(view.reveal, null);
  });

  it("shows the podium to players at the end", () => {
    const view = buildRoomView(raw("finished", players), "boris");
    assert.deepEqual(view.classroom.podium.map((p) => p.username), ["anna", "vera", "boris"]);
  });
});
