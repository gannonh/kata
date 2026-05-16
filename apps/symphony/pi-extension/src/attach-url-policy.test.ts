import { describe, expect, it } from "vitest";
import { resolveAttachUrl } from "./attach-url-policy.ts";

const ownedProcess = {
  pid: 123,
  command: "symphony --no-tui",
  cwd: "/repo",
  baseUrl: "http://127.0.0.1:8080",
  startedAt: "2026-05-14T00:00:00.000Z",
};

describe("resolveAttachUrl", () => {
  it("treats whitespace-only URLs as absent so owned process fallback is preserved", () => {
    expect(resolveAttachUrl("   ", ownedProcess)).toBe("http://127.0.0.1:8080");
  });

  it("returns trimmed explicit URLs", () => {
    expect(resolveAttachUrl(" http://localhost:8080 ", ownedProcess)).toBe("http://localhost:8080");
  });
});
