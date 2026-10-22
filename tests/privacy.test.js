import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { daysAgo, normalizeUsername } from "../lib/privacy.js";

describe("personal data", () => {
  it("normalizeUsername trims, limits length and rejects emails", () => {
    assert.deepEqual(normalizeUsername("  Паша   К  "), { username: "Паша К" });
    assert.ok(normalizeUsername("").error);
    assert.ok(normalizeUsername("x".repeat(33)).error);
    assert.ok(normalizeUsername("me@example.com").error);
  });

  it("daysAgo counts back whole days", () => {
    const now = Date.parse("2026-10-13T12:00:00Z");
    assert.equal(daysAgo(30, now), "2026-09-13T12:00:00.000Z");
  });

  it("no third-party font or analytics requests from the page", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
    assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/);
    assert.doesNotMatch(sw, /fonts\.(googleapis|gstatic)\.com/);
    assert.doesNotMatch(html, /googletagmanager|google-analytics|metrika/);
  });

  it("sign-up never derives a public nickname from the email", () => {
    const sql = readFileSync(new URL("../supabase/migrations/20261013122504_privacy.sql", import.meta.url), "utf8");
    assert.doesNotMatch(sql, /split_part\(new\.email/);
  });
});
