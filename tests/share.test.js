import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeNextPath } from "../src/lib/share.js";

describe("safeNextPath", () => {
  it("keeps same-site paths with query strings", () => {
    assert.equal(safeNextPath("/q/abc?from=link"), "/q/abc?from=link");
  });

  it("rejects other origins and protocol-relative urls", () => {
    assert.equal(safeNextPath("https://evil.example"), "/");
    assert.equal(safeNextPath("//evil.example"), "/");
    assert.equal(safeNextPath("/\\evil.example"), "/");
  });

  it("falls back to home for missing values", () => {
    assert.equal(safeNextPath(null), "/");
    assert.equal(safeNextPath(""), "/");
  });
});
