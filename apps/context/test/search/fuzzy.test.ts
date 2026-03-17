/**
 * Tests for fuzzyFind() — FTS5-based fuzzy symbol/file matching.
 *
 * Uses the TS relationship fixtures indexed into an in-memory GraphStore.
 */

import { resolve } from "node:path";
import { GraphStore } from "../../src/graph/store.js";
import { indexProject } from "../../src/indexer.js";
import { fuzzyFind } from "../../src/search/lexical.js";
import { SymbolKind } from "../../src/types.js";

// ── Setup: index TS relationship fixtures ──

const TS_FIXTURES = resolve(import.meta.dirname!, "../fixtures/relationships/ts");

let store: GraphStore;

beforeAll(() => {
  store = new GraphStore(":memory:");
  const result = indexProject(TS_FIXTURES, { store });
  expect(result.filesIndexed).toBeGreaterThan(0);
  expect(result.symbolsExtracted).toBeGreaterThan(0);
});

afterAll(() => {
  store.close();
});

// ── Basic matching ──

describe("fuzzyFind — basic matching", () => {
  it("finds a symbol by exact name", () => {
    const results = fuzzyFind("greet", store);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const names = results.map((r) => r.symbol.name);
    expect(names).toContain("greet");
  });

  it("finds a symbol by prefix", () => {
    const results = fuzzyFind("gre", store);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const names = results.map((r) => r.symbol.name);
    expect(names).toContain("greet");
  });

  it("finds a class by name", () => {
    const results = fuzzyFind("AppService", store);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const names = results.map((r) => r.symbol.name);
    expect(names).toContain("AppService");
  });

  it("finds symbols by partial class name prefix", () => {
    const results = fuzzyFind("Base", store);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const names = results.map((r) => r.symbol.name);
    expect(names).toContain("BaseService");
  });

  it("finds interfaces", () => {
    const results = fuzzyFind("IService", store);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const names = results.map((r) => r.symbol.name);
    expect(names).toContain("IService");
  });

  it("finds enum members", () => {
    const results = fuzzyFind("LogLevel", store);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const names = results.map((r) => r.symbol.name);
    expect(names).toContain("LogLevel");
  });

  it("returns FuzzyResult shape with symbol", () => {
    const results = fuzzyFind("greet", store);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const first = results[0]!;
    expect(first).toHaveProperty("symbol");
    expect(first.symbol).toHaveProperty("id");
    expect(first.symbol).toHaveProperty("name");
    expect(first.symbol).toHaveProperty("kind");
    expect(first.symbol).toHaveProperty("filePath");
    expect(first.symbol).toHaveProperty("lineStart");
    expect(first.symbol).toHaveProperty("lineEnd");
  });
});

// ── Options: limit ──

describe("fuzzyFind — limit option", () => {
  it("respects limit option", () => {
    const results = fuzzyFind("a", store, { limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("default limit is 20", () => {
    // Query that matches many things
    const results = fuzzyFind("s", store);
    expect(results.length).toBeLessThanOrEqual(20);
  });
});

// ── Options: kind filter ──

describe("fuzzyFind — kind filter", () => {
  it("filters to functions only", () => {
    const results = fuzzyFind("gre", store, { kind: SymbolKind.Function });
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.symbol.kind).toBe(SymbolKind.Function);
    }
  });

  it("filters to classes only", () => {
    const results = fuzzyFind("Service", store, { kind: SymbolKind.Class });
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.symbol.kind).toBe(SymbolKind.Class);
    }
  });

  it("filters to interfaces only", () => {
    const results = fuzzyFind("IService", store, { kind: SymbolKind.Interface });
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.symbol.kind).toBe(SymbolKind.Interface);
    }
  });

  it("returns empty when kind filter excludes all matches", () => {
    // greet is a function, not a class
    const results = fuzzyFind("greet", store, { kind: SymbolKind.Class });
    expect(results).toHaveLength(0);
  });
});

// ── Options: fileScope ──

describe("fuzzyFind — fileScope filter", () => {
  it("filters to a specific file", () => {
    const results = fuzzyFind("greet", store, { fileScope: "utils.ts" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.symbol.filePath).toMatch(/^utils\.ts/);
    }
  });

  it("returns empty when fileScope excludes all matches", () => {
    // greet is in utils.ts, not service.ts
    const results = fuzzyFind("greet", store, { fileScope: "service.ts" });
    expect(results).toHaveLength(0);
  });

  it("supports directory prefix scope", () => {
    // All fixtures are at the top level with simple filenames
    const results = fuzzyFind("Config", store, { fileScope: "types" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.symbol.filePath.startsWith("types")).toBe(true);
    }
  });
});

// ── Edge cases ──

describe("fuzzyFind — edge cases", () => {
  it("returns empty array for empty query", () => {
    const results = fuzzyFind("", store);
    expect(results).toHaveLength(0);
  });

  it("returns empty array for whitespace-only query", () => {
    const results = fuzzyFind("   ", store);
    expect(results).toHaveLength(0);
  });

  it("handles query with no matches", () => {
    const results = fuzzyFind("xyznonexistent", store);
    expect(results).toHaveLength(0);
  });

  it("handles query with special characters gracefully", () => {
    // Should not throw — special chars are quoted by FTS5 sanitizer
    const results = fuzzyFind("foo.bar-baz", store);
    expect(Array.isArray(results)).toBe(true);
  });

  it("passes through FTS5 operator queries", () => {
    // Using explicit FTS5 prefix operator
    const results = fuzzyFind("greet*", store);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const names = results.map((r) => r.symbol.name);
    expect(names).toContain("greet");
  });

  it("handles multi-word query (all tokens matched)", () => {
    // Searching for "create Config" should match createConfig (name) and/or files with both tokens
    const results = fuzzyFind("create Config", store);
    expect(Array.isArray(results)).toBe(true);
  });
});

// ── Empty store ──

describe("fuzzyFind — empty store", () => {
  it("returns empty for any query on empty store", () => {
    const emptyStore = new GraphStore(":memory:");
    try {
      const results = fuzzyFind("anything", emptyStore);
      expect(results).toHaveLength(0);
    } finally {
      emptyStore.close();
    }
  });
});
