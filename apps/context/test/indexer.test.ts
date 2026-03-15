/**
 * Integration tests for the indexing pipeline.
 *
 * Tests the full flow: discover → parse → extract relationships → store in graph.
 * Uses in-memory SQLite databases for speed and isolation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "node:path";
import { indexProject, type IndexResult } from "../src/indexer.js";
import { GraphStore } from "../src/graph/store.js";
import { RelationshipKind, SymbolKind } from "../src/types.js";
import { generateSymbolId } from "../src/parser/common.js";

// ── Fixture paths ──

const FIXTURES_ROOT = resolve(import.meta.dirname!, "fixtures");
const MIXED_ROOT = resolve(FIXTURES_ROOT, "mixed");
const TS_REL_ROOT = resolve(FIXTURES_ROOT, "relationships/ts");
const PY_REL_ROOT = resolve(FIXTURES_ROOT, "relationships/py");

// ── Helpers ──

function indexWithMemoryStore(
  rootPath: string,
  store: GraphStore,
): IndexResult {
  return indexProject(rootPath, { store });
}

// ── Tests ──

describe("indexProject — mixed fixture directory", () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("indexes all files and returns correct summary", () => {
    const result = indexWithMemoryStore(MIXED_ROOT, store);

    // mixed/ has: utils.ts, service.ts, empty.ts, nested/deep.ts, helpers.py, nested/models.py
    // syntax-error.ts should fail gracefully
    expect(result.filesIndexed).toBeGreaterThanOrEqual(5);
    expect(result.symbolsExtracted).toBeGreaterThan(0);
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it("stores symbols in the graph", () => {
    indexWithMemoryStore(MIXED_ROOT, store);

    const stats = store.getStats();
    expect(stats.symbols).toBeGreaterThan(0);
    expect(stats.files).toBeGreaterThan(0);
  });

  it("handles syntax error files gracefully", () => {
    const result = indexWithMemoryStore(MIXED_ROOT, store);

    // syntax-error.ts may or may not error — important thing is it doesn't crash
    expect(result.filesIndexed).toBeGreaterThanOrEqual(5);
  });

  it("FTS search works after indexing", () => {
    indexWithMemoryStore(MIXED_ROOT, store);

    const results = store.ftsSearch("helper");
    expect(Array.isArray(results)).toBe(true);
  });

  it("returns IndexResult with all required fields", () => {
    const result = indexWithMemoryStore(MIXED_ROOT, store);

    expect(typeof result.filesIndexed).toBe("number");
    expect(typeof result.symbolsExtracted).toBe("number");
    expect(typeof result.edgesCreated).toBe("number");
    expect(typeof result.duration).toBe("number");
    expect(Array.isArray(result.errors)).toBe(true);
  });
});

describe("indexProject — TypeScript relationship fixtures", () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("indexes TS relationship files and creates edges", () => {
    const result = indexWithMemoryStore(TS_REL_ROOT, store);

    // 6 files: types.ts, utils.ts, service.ts, index.ts, consumer.ts, init.ts
    expect(result.filesIndexed).toBe(6);
    expect(result.symbolsExtracted).toBeGreaterThan(0);
    expect(result.edgesCreated).toBeGreaterThan(0);
    expect(result.errors).toEqual([]);
  });

  it("creates correct import edges", () => {
    indexWithMemoryStore(TS_REL_ROOT, store);

    const stats = store.getStats();
    expect(stats.edges).toBeGreaterThan(0);

    // utils.ts module should have import edges to types.ts symbols
    const utilsModuleId = generateSymbolId("utils.ts", "<module>", SymbolKind.Module);
    const edgesFrom = store.getEdgesFrom(utilsModuleId);
    const importEdges = edgesFrom.filter((e) => e.kind === RelationshipKind.Imports);
    expect(importEdges.length).toBeGreaterThan(0);
  });

  it("creates correct inherits edges", () => {
    indexWithMemoryStore(TS_REL_ROOT, store);

    const serviceSymbols = store.getSymbolsByFile("service.ts");
    const allEdges = serviceSymbols.flatMap((sym) => store.getEdgesFrom(sym.id));
    const inheritsEdges = allEdges.filter((e) => e.kind === RelationshipKind.Inherits);
    expect(inheritsEdges.length).toBeGreaterThan(0);
  });

  it("creates correct implements edges", () => {
    indexWithMemoryStore(TS_REL_ROOT, store);

    const serviceSymbols = store.getSymbolsByFile("service.ts");
    const allEdges = serviceSymbols.flatMap((sym) => store.getEdgesFrom(sym.id));
    const implementsEdges = allEdges.filter((e) => e.kind === RelationshipKind.Implements);
    expect(implementsEdges.length).toBeGreaterThan(0);
  });

  it("creates correct calls edges", () => {
    indexWithMemoryStore(TS_REL_ROOT, store);

    // consumer.ts or service.ts should have call edges to imported functions
    const consumerSymbols = store.getSymbolsByFile("consumer.ts");
    const serviceSymbols = store.getSymbolsByFile("service.ts");
    const allSymbols = [...consumerSymbols, ...serviceSymbols];
    const allEdges = allSymbols.flatMap((sym) => store.getEdgesFrom(sym.id));
    const callEdges = allEdges.filter((e) => e.kind === RelationshipKind.Calls);
    expect(callEdges.length).toBeGreaterThan(0);
  });

  it("FTS search finds symbols after TS indexing", () => {
    indexWithMemoryStore(TS_REL_ROOT, store);

    const results = store.ftsSearch("Config");
    expect(results.length).toBeGreaterThan(0);
  });
});

describe("indexProject — Python relationship fixtures", () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("indexes Python relationship files and creates edges", () => {
    const result = indexWithMemoryStore(PY_REL_ROOT, store);

    // py/ has: models.py, utils.py, service.py, subpkg/helper.py + __init__.py files
    expect(result.filesIndexed).toBeGreaterThanOrEqual(4);
    expect(result.symbolsExtracted).toBeGreaterThan(0);
    expect(result.edgesCreated).toBeGreaterThan(0);
    expect(result.errors).toEqual([]);
  });

  it("creates correct import edges for Python", () => {
    indexWithMemoryStore(PY_REL_ROOT, store);

    const stats = store.getStats();
    expect(stats.edges).toBeGreaterThan(0);

    // Check that import edges exist — service.py or utils.py imports from models.py
    const allSymbols = store.getSymbolsByFile("service.py");
    // Also check module-level symbols
    const serviceModuleId = generateSymbolId("service.py", "<module>", SymbolKind.Module);
    const moduleEdges = store.getEdgesFrom(serviceModuleId);
    const serviceEdges = allSymbols.flatMap((sym) => store.getEdgesFrom(sym.id));
    const allEdges = [...moduleEdges, ...serviceEdges];
    const importEdges = allEdges.filter((e) => e.kind === RelationshipKind.Imports);
    expect(importEdges.length).toBeGreaterThan(0);
  });

  it("creates correct inherits edges for Python", () => {
    indexWithMemoryStore(PY_REL_ROOT, store);

    // models.py has class inheritance (User extends BaseModel, etc.)
    const modelSymbols = store.getSymbolsByFile("models.py");
    const allEdges = modelSymbols.flatMap((sym) => store.getEdgesFrom(sym.id));
    const inheritsEdges = allEdges.filter((e) => e.kind === RelationshipKind.Inherits);
    expect(inheritsEdges.length).toBeGreaterThan(0);
  });

  it("FTS search finds Python symbols", () => {
    indexWithMemoryStore(PY_REL_ROOT, store);

    const results = store.ftsSearch("BaseModel");
    expect(results.length).toBeGreaterThan(0);
  });
});

describe("indexProject — idempotency", () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("re-indexing produces the same symbol count (no duplicates)", () => {
    indexWithMemoryStore(TS_REL_ROOT, store);
    const stats1 = store.getStats();

    indexWithMemoryStore(TS_REL_ROOT, store);
    const stats2 = store.getStats();

    expect(stats2.symbols).toBe(stats1.symbols);
    expect(stats2.edges).toBe(stats1.edges);
    expect(stats2.files).toBe(stats1.files);
  });

  it("re-indexing Python fixtures is idempotent", () => {
    indexWithMemoryStore(PY_REL_ROOT, store);
    const stats1 = store.getStats();

    indexWithMemoryStore(PY_REL_ROOT, store);
    const stats2 = store.getStats();

    expect(stats2.symbols).toBe(stats1.symbols);
    expect(stats2.edges).toBe(stats1.edges);
  });
});

describe("indexProject — performance", () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("indexes TS fixtures in <1s", () => {
    const result = indexWithMemoryStore(TS_REL_ROOT, store);
    expect(result.duration).toBeLessThan(1000);
  });

  it("indexes PY fixtures in <1s", () => {
    const result = indexWithMemoryStore(PY_REL_ROOT, store);
    expect(result.duration).toBeLessThan(1000);
  });

  it("indexes mixed fixtures in <1s", () => {
    const result = indexWithMemoryStore(MIXED_ROOT, store);
    expect(result.duration).toBeLessThan(1000);
  });
});

describe("indexProject — cross-language", () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("indexes mixed-language directory with both TS and PY symbols", () => {
    indexWithMemoryStore(MIXED_ROOT, store);

    const pySymbols = store.getSymbolsByFile("helpers.py");
    expect(pySymbols.length).toBeGreaterThan(0);

    const tsSymbols = store.getSymbolsByFile("utils.ts");
    expect(tsSymbols.length).toBeGreaterThan(0);
  });
});

describe("indexProject — edge cases", () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("returns zero edges for directory with no cross-file relationships", () => {
    const singleFileRoot = resolve(FIXTURES_ROOT, "typescript");
    const result = indexWithMemoryStore(singleFileRoot, store);

    expect(result.filesIndexed).toBeGreaterThan(0);
    expect(result.edgesCreated).toBe(0);
  });

  it("handles empty store gracefully", () => {
    const emptyStore = new GraphStore(":memory:");
    try {
      const stats = emptyStore.getStats();
      expect(stats.symbols).toBe(0);
      expect(stats.edges).toBe(0);
      expect(stats.files).toBe(0);
    } finally {
      emptyStore.close();
    }
  });

  it("graph stats are consistent with IndexResult", () => {
    const result = indexWithMemoryStore(TS_REL_ROOT, store);
    const stats = store.getStats();

    expect(stats.symbols).toBe(result.symbolsExtracted);
    expect(stats.edges).toBe(result.edgesCreated);
  });
});
