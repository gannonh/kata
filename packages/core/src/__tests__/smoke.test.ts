import { describe, test, expect } from "bun:test";

describe("core", () => {
  test("package.json is valid", async () => {
    const pkg = await import("../../package.json");
    expect(pkg.default.name).toBe("@craft-agent/core");
  });
});
