import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getApiParts } from "../lib/apiPath.js";

const req = (url, headers = {}, query = {}) => ({ url, headers, query });

describe("getApiParts", () => {
  it("reads segments from the original path", () => {
    assert.deepEqual(getApiParts(req("/api/quizzes/abc/progress"), "quizzes"), ["abc", "progress"]);
  });

  it("ignores the query string", () => {
    assert.deepEqual(getApiParts(req("/api/rooms/state?code=K7Q2AB"), "rooms"), ["state"]);
  });

  it("prefers the path Vercel reports in headers", () => {
    const parts = getApiParts(req("/api/quizzes?id=abc", { "x-matched-path": "/api/quizzes/abc/info" }), "quizzes");
    assert.deepEqual(parts, ["abc", "info"]);
  });

  it("falls back to rewrite query params", () => {
    const parts = getApiParts(req("/api/quizzes", {}, { id: "abc", extra: "attempt" }), "quizzes");
    assert.deepEqual(parts, ["abc", "attempt"]);
  });
});

describe("game actions in the rooms function", async () => {
  const { isGameRequest } = await import("../lib/gameApi.js");

  it("recognizes the rewritten and the original path", () => {
    assert.equal(isGameRequest(req("/api/rooms?group=game&action=answer", {}, { group: "game", action: "answer" })), true);
    assert.equal(isGameRequest(req("/api/game/answer")), true);
    assert.equal(isGameRequest(req("/api/rooms", { "x-matched-path": "/api/game/start" })), true);
  });

  it("leaves room actions alone", () => {
    assert.equal(isGameRequest(req("/api/rooms/join")), false);
    assert.equal(isGameRequest(req("/api/rooms?action=state", {}, { action: "state" })), false);
  });
});
