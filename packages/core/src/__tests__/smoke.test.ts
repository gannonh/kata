import { describe, test, expect } from "vitest";

describe("core", () => {
  test("package.json is valid", async () => {
    const pkg = await import("../../package.json");
    expect(pkg.default.name).toBe("@kata/core");
  });
});
