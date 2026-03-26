import { describe, it, expect } from 'vitest'
import { formatElapsed } from "../elapsed.js";

describe("formatElapsed", () => {
  it("formats 0ms", () => {
    expect(formatElapsed(0)).toBe("0.0s");
  });

  it("formats sub-second values", () => {
    expect(formatElapsed(300)).toBe("0.3s");
    expect(formatElapsed(500)).toBe("0.5s");
    expect(formatElapsed(999)).toBe("1.0s");
  });

  it("formats seconds", () => {
    expect(formatElapsed(1234)).toBe("1.2s");
    expect(formatElapsed(12345)).toBe("12.3s");
    expect(formatElapsed(59999)).toBe("1m 0s");
  });

  it("formats minutes", () => {
    expect(formatElapsed(60000)).toBe("1m 0s");
    expect(formatElapsed(65000)).toBe("1m 5s");
    expect(formatElapsed(83000)).toBe("1m 23s");
    expect(formatElapsed(125000)).toBe("2m 5s");
  });

  it("handles negative values gracefully", () => {
    expect(formatElapsed(-100)).toBe("0.0s");
  });

  it("handles large values", () => {
    expect(formatElapsed(3600000)).toBe("60m 0s");
  });
});
