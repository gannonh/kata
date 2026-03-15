import { describe, it, expect } from "vitest";
import { generateSymbolId, normalizePath } from "../../src/parser/common.js";
import { SymbolKind } from "../../src/types.js";

describe("generateSymbolId", () => {
  it("produces a 16-char hex string", () => {
    const id = generateSymbolId("src/auth.ts", "login", SymbolKind.Function);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic — same inputs produce same output", () => {
    const a = generateSymbolId("src/auth.ts", "login", SymbolKind.Function);
    const b = generateSymbolId("src/auth.ts", "login", SymbolKind.Function);
    expect(a).toBe(b);
  });

  it("produces different IDs for different names", () => {
    const a = generateSymbolId("src/auth.ts", "login", SymbolKind.Function);
    const b = generateSymbolId("src/auth.ts", "logout", SymbolKind.Function);
    expect(a).not.toBe(b);
  });

  it("produces different IDs for different kinds", () => {
    const a = generateSymbolId("src/user.ts", "User", SymbolKind.Class);
    const b = generateSymbolId("src/user.ts", "User", SymbolKind.Interface);
    expect(a).not.toBe(b);
  });

  it("produces different IDs for different files", () => {
    const a = generateSymbolId("src/a.ts", "foo", SymbolKind.Function);
    const b = generateSymbolId("src/b.ts", "foo", SymbolKind.Function);
    expect(a).not.toBe(b);
  });
});

describe("normalizePath", () => {
  it("converts backslashes to forward slashes", () => {
    expect(normalizePath("src\\parser\\common.ts")).toBe(
      "src/parser/common.ts",
    );
  });

  it("removes leading ./", () => {
    expect(normalizePath("./src/types.ts")).toBe("src/types.ts");
  });

  it("leaves clean paths unchanged", () => {
    expect(normalizePath("src/types.ts")).toBe("src/types.ts");
  });
});
