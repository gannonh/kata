import { describe, it } from "bun:test";
import assert from "node:assert/strict";
import { formatElapsed } from "../elapsed.js";

describe("formatElapsed", () => {
  it("formats 0ms", () => {
    assert.strictEqual(formatElapsed(0), "0.0s");
  });

  it("formats sub-second values", () => {
    assert.strictEqual(formatElapsed(300), "0.3s");
    assert.strictEqual(formatElapsed(500), "0.5s");
    assert.strictEqual(formatElapsed(999), "1.0s");
  });

  it("formats seconds", () => {
    assert.strictEqual(formatElapsed(1234), "1.2s");
    assert.strictEqual(formatElapsed(12345), "12.3s");
    assert.strictEqual(formatElapsed(59999), "60.0s");
  });

  it("formats minutes", () => {
    assert.strictEqual(formatElapsed(60000), "1m 0s");
    assert.strictEqual(formatElapsed(65000), "1m 5s");
    assert.strictEqual(formatElapsed(83000), "1m 23s");
    assert.strictEqual(formatElapsed(125000), "2m 5s");
  });

  it("handles negative values gracefully", () => {
    assert.strictEqual(formatElapsed(-100), "0.0s");
  });

  it("handles large values", () => {
    assert.strictEqual(formatElapsed(3600000), "60m 0s");
  });
});
