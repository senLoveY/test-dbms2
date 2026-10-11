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
