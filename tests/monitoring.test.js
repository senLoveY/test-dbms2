import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { buildEnvelope, buildEvent, parseDsn, reportServerError, stackFrames } from "../lib/monitoring.js";

const DSN = "https://abc123@o42.ingest.de.sentry.io/77";

describe("server error reports", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.SENTRY_DSN;
  });

  it("reads the endpoint and key from a DSN", () => {
    assert.deepEqual(parseDsn(DSN), { publicKey: "abc123", endpoint: "https://o42.ingest.de.sentry.io/api/77/envelope/" });
    assert.equal(parseDsn("not a dsn"), null);
    assert.equal(parseDsn("https://o42.ingest.sentry.io/77"), null);
  });

  it("turns a V8 stack into frames, oldest first, app code marked", () => {
    const frames = stackFrames(`Error: boom
    at listQuizzes (file:///var/task/lib/quizService.js:55:11)
    at async handler (file:///var/task/api/quizzes.js:49:25)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)`);
    assert.deepEqual(frames.map((f) => f.function), ["process.processTicksAndRejections", "async handler", "listQuizzes"]);
    assert.equal(frames[2].filename, "lib/quizService.js");
    assert.equal(frames[2].lineno, 55);
    assert.equal(frames[0].in_app, false);
  });

  it("keeps the path but not the query string, and nothing about the user", () => {
    const event = buildEvent(new TypeError("x is undefined"), { method: "GET", path: "/api/rooms/state" });
    assert.equal(event.request.url, "/api/rooms/state");
    assert.equal(event.exception.values[0].type, "TypeError");
    assert.equal("user" in event, false);
    const [header, item, payload] = buildEnvelope(event, DSN).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(header.event_id, event.event_id);
    assert.equal(item.type, "event");
    assert.equal(payload.exception.values[0].value, "x is undefined");
  });

  it("sends nothing without a DSN, and never throws", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("network down");
    };
    await reportServerError(new Error("a"), { method: "GET", url: "/api/quizzes?id=1" });
    assert.equal(calls, 0);
    process.env.SENTRY_DSN = DSN;
    await reportServerError(new Error("b"), { method: "GET", url: "/api/quizzes?id=1" });
    assert.equal(calls, 1);
  });

  it("posts the envelope with the auth header, without the query string", async () => {
    process.env.SENTRY_DSN = DSN;
    let sent;
    globalThis.fetch = async (url, init) => {
      sent = { url, init };
      return { ok: true };
    };
    await reportServerError(new Error("c"), { method: "POST", url: "/api/rooms/join?code=ABC123" });
    assert.equal(sent.url, "https://o42.ingest.de.sentry.io/api/77/envelope/");
    assert.match(sent.init.headers["X-Sentry-Auth"], /sentry_key=abc123/);
    assert.doesNotMatch(sent.init.body, /ABC123/);
  });
});
