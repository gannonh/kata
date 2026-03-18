import { GraphStore } from "../../src/graph/store.js";
import { SymbolKind, RelationshipKind } from "../../src/types.js";
import type { Symbol, Relationship } from "../../src/types.js";
import { generateSymbolId } from "../../src/parser/common.js";

// ── Helpers ──

function makeSymbol(
  overrides: Partial<Symbol> & {
    name: string;
    filePath: string;
    kind: SymbolKind;
  },
): Symbol {
  const id =
    overrides.id ??
    generateSymbolId(overrides.filePath, overrides.name, overrides.kind);
  return {
    id,
    name: overrides.name,
    kind: overrides.kind,
    filePath: overrides.filePath,
    lineStart: overrides.lineStart ?? 1,
    lineEnd: overrides.lineEnd ?? 10,
    signature: overrides.signature ?? null,
    docstring: overrides.docstring ?? null,
    source: overrides.source ?? `function ${overrides.name}() {}`,
    exported: overrides.exported ?? true,
    summary: overrides.summary,
    lastIndexedAt: overrides.lastIndexedAt,
    gitSha: overrides.gitSha,
  };
}

function makeEdge(
  overrides: Partial<Relationship> & { sourceId: string; targetId: string },
): Relationship {
  return {
    sourceId: overrides.sourceId,
    targetId: overrides.targetId,
    kind: overrides.kind ?? RelationshipKind.Imports,
    filePath: overrides.filePath ?? "src/main.ts",
    lineNumber: overrides.lineNumber ?? 1,
  };
}

// ── Test Data ──

function seedSymbols(store: GraphStore): Symbol[] {
  const symbols = [
    makeSymbol({
      name: "greet",
      filePath: "src/greet.ts",
      kind: SymbolKind.Function,
      docstring: "Greets the user by name with a friendly message.",
      signature: "function greet(name: string): string",
    }),
    makeSymbol({
      name: "greetAll",
      filePath: "src/greet.ts",
      kind: SymbolKind.Function,
      docstring: "Greets multiple users at once.",
      signature: "function greetAll(names: string[]): string[]",
    }),
    makeSymbol({
      name: "UserService",
      filePath: "src/services/user.ts",
      kind: SymbolKind.Class,
      docstring: "Manages user accounts and authentication.",
    }),
    makeSymbol({
      name: "Config",
      filePath: "src/config.ts",
      kind: SymbolKind.Interface,
      docstring: "Application configuration interface.",
    }),
    makeSymbol({
      name: "parseInput",
      filePath: "src/parser.ts",
      kind: SymbolKind.Function,
      docstring: null,
    }),
    makeSymbol({
      name: "formatOutput",
      filePath: "src/formatter.ts",
      kind: SymbolKind.Function,
      docstring: "Formats the output for display.",
    }),
    makeSymbol({
      name: "helper",
      filePath: "src/utils/helper.py",
      kind: SymbolKind.Function,
      docstring: "A helper utility function for data processing.",
    }),
    makeSymbol({
      name: "DataModel",
      filePath: "src/models/data.py",
      kind: SymbolKind.Class,
      docstring: "Data model for the knowledge graph.",
    }),
  ];
  store.upsertSymbols(symbols);
  return symbols;
}

// ── Tests ──

describe("FTS5 Search", () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  // ── Basic search ──

  it("finds symbols by exact name match", () => {
    const symbols = seedSymbols(store);
    const results = store.ftsSearch("greet");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.name === "greet")).toBe(true);
  });

  it("finds symbols by prefix matching", () => {
    seedSymbols(store);
    const results = store.ftsSearch("greet*");
    expect(results).toHaveLength(2);
    const names = results.map((r) => r.name).sort();
    expect(names).toEqual(["greet", "greetAll"]);
  });

  it("finds symbols by docstring content", () => {
    seedSymbols(store);
    const results = store.ftsSearch("authentication");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("UserService");
  });

  it("finds symbols by file path", () => {
    seedSymbols(store);
    const results = store.ftsSearch("helper.py");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("helper");
  });

  it("returns empty array for no matches", () => {
    seedSymbols(store);
    const results = store.ftsSearch("nonexistent_xyz_abc");
    expect(results).toEqual([]);
  });

  it("returns empty array for empty query", () => {
    seedSymbols(store);
    const results = store.ftsSearch("");
    expect(results).toEqual([]);
  });

  it("returns empty array for whitespace-only query", () => {
    seedSymbols(store);
    const results = store.ftsSearch("   ");
    expect(results).toEqual([]);
  });

  // ── Options ──

  it("respects limit option", () => {
    seedSymbols(store);
    const results = store.ftsSearch("greet*", { limit: 1 });
    expect(results).toHaveLength(1);
  });

  it("filters by symbol kind", () => {
    seedSymbols(store);
    // Both "greet" and "greetAll" are functions, "UserService" is a class
    // Search for something that matches both function and class
    const results = store.ftsSearch("user", { kind: SymbolKind.Class });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("UserService");
  });

  it("combines kind filter with limit", () => {
    seedSymbols(store);
    const results = store.ftsSearch("greet*", {
      kind: SymbolKind.Function,
      limit: 1,
    });
    expect(results).toHaveLength(1);
    expect(results[0].kind).toBe(SymbolKind.Function);
  });

  // ── BM25 Ranking ──

  it("ranks exact name matches higher than docstring matches", () => {
    seedSymbols(store);
    // "greet" appears in both symbol name and docstring for greet/greetAll
    // but "greet" should rank higher than "greetAll" for exact name match
    const results = store.ftsSearch("greet");
    // At minimum, we get results back ranked by relevance
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toBe("greet");
  });

  // ── FTS stays in sync ──

  it("FTS reflects newly inserted symbols", () => {
    const sym = makeSymbol({
      name: "laterAdd",
      filePath: "src/later.ts",
      kind: SymbolKind.Function,
      docstring: "Added after initial seed.",
    });
    store.upsertSymbols([sym]);

    const results = store.ftsSearch("laterAdd");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("laterAdd");
  });

  it("FTS reflects symbol updates", () => {
    const sym = makeSymbol({
      name: "mutable",
      filePath: "src/mut.ts",
      kind: SymbolKind.Function,
      docstring: "Original docstring about bananas.",
    });
    store.upsertSymbols([sym]);

    // Verify original docstring is searchable
    expect(store.ftsSearch("bananas")).toHaveLength(1);

    // Update the symbol with new docstring
    const updated = { ...sym, docstring: "Updated docstring about oranges." };
    store.upsertSymbols([updated]);

    // Old docstring should no longer match
    expect(store.ftsSearch("bananas")).toHaveLength(0);
    // New docstring should match
    expect(store.ftsSearch("oranges")).toHaveLength(1);
  });

  it("FTS reflects symbol deletion via deleteSymbolsByFile", () => {
    const sym = makeSymbol({
      name: "ephemeral",
      filePath: "src/temp.ts",
      kind: SymbolKind.Function,
      docstring: "Temporary function that will be deleted.",
    });
    store.upsertSymbols([sym]);
    expect(store.ftsSearch("ephemeral")).toHaveLength(1);

    store.deleteSymbolsByFile("src/temp.ts");
    expect(store.ftsSearch("ephemeral")).toHaveLength(0);
  });

  it("handles symbols with null docstring in FTS", () => {
    const sym = makeSymbol({
      name: "noDoc",
      filePath: "src/nodoc.ts",
      kind: SymbolKind.Function,
      docstring: null,
    });
    store.upsertSymbols([sym]);

    // Should still be searchable by name
    const results = store.ftsSearch("noDoc");
    expect(results).toHaveLength(1);
    expect(results[0].docstring).toBeNull();
  });
});

describe("Edge Queries", () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("getEdgesFrom returns outgoing edges", () => {
    const symA = makeSymbol({
      name: "caller",
      filePath: "src/a.ts",
      kind: SymbolKind.Function,
    });
    const symB = makeSymbol({
      name: "callee",
      filePath: "src/b.ts",
      kind: SymbolKind.Function,
    });
    store.upsertSymbols([symA, symB]);

    const edges = [
      makeEdge({
        sourceId: symA.id,
        targetId: symB.id,
        kind: RelationshipKind.Calls,
        filePath: "src/a.ts",
        lineNumber: 5,
      }),
    ];
    store.upsertEdges(edges);

    const result = store.getEdgesFrom(symA.id);
    expect(result).toHaveLength(1);
    expect(result[0].sourceId).toBe(symA.id);
    expect(result[0].targetId).toBe(symB.id);
    expect(result[0].kind).toBe(RelationshipKind.Calls);
    expect(result[0].lineNumber).toBe(5);
  });

  it("getEdgesTo returns incoming edges", () => {
    const symA = makeSymbol({
      name: "importer",
      filePath: "src/a.ts",
      kind: SymbolKind.Function,
    });
    const symB = makeSymbol({
      name: "exported",
      filePath: "src/b.ts",
      kind: SymbolKind.Function,
    });
    store.upsertSymbols([symA, symB]);

    const edges = [
      makeEdge({
        sourceId: symA.id,
        targetId: symB.id,
        kind: RelationshipKind.Imports,
        filePath: "src/a.ts",
        lineNumber: 1,
      }),
    ];
    store.upsertEdges(edges);

    const result = store.getEdgesTo(symB.id);
    expect(result).toHaveLength(1);
    expect(result[0].sourceId).toBe(symA.id);
    expect(result[0].targetId).toBe(symB.id);
    expect(result[0].kind).toBe(RelationshipKind.Imports);
  });

  it("getEdgesFrom returns empty for symbol with no outgoing edges", () => {
    expect(store.getEdgesFrom("nonexistent")).toEqual([]);
  });

  it("getEdgesTo returns empty for symbol with no incoming edges", () => {
    expect(store.getEdgesTo("nonexistent")).toEqual([]);
  });

  it("returns multiple edges from a single symbol", () => {
    const symA = makeSymbol({
      name: "hub",
      filePath: "src/hub.ts",
      kind: SymbolKind.Function,
    });
    const symB = makeSymbol({
      name: "dep1",
      filePath: "src/dep1.ts",
      kind: SymbolKind.Function,
    });
    const symC = makeSymbol({
      name: "dep2",
      filePath: "src/dep2.ts",
      kind: SymbolKind.Function,
    });
    store.upsertSymbols([symA, symB, symC]);

    store.upsertEdges([
      makeEdge({
        sourceId: symA.id,
        targetId: symB.id,
        kind: RelationshipKind.Imports,
        filePath: "src/hub.ts",
      }),
      makeEdge({
        sourceId: symA.id,
        targetId: symC.id,
        kind: RelationshipKind.Calls,
        filePath: "src/hub.ts",
      }),
    ]);

    const outgoing = store.getEdgesFrom(symA.id);
    expect(outgoing).toHaveLength(2);

    const incoming = store.getEdgesTo(symA.id);
    expect(incoming).toHaveLength(0);
  });

  it("returns multiple edges to a single symbol", () => {
    const symA = makeSymbol({
      name: "target",
      filePath: "src/target.ts",
      kind: SymbolKind.Function,
    });
    const symB = makeSymbol({
      name: "user1",
      filePath: "src/user1.ts",
      kind: SymbolKind.Function,
    });
    const symC = makeSymbol({
      name: "user2",
      filePath: "src/user2.ts",
      kind: SymbolKind.Function,
    });
    store.upsertSymbols([symA, symB, symC]);

    store.upsertEdges([
      makeEdge({
        sourceId: symB.id,
        targetId: symA.id,
        kind: RelationshipKind.Imports,
        filePath: "src/user1.ts",
      }),
      makeEdge({
        sourceId: symC.id,
        targetId: symA.id,
        kind: RelationshipKind.Calls,
        filePath: "src/user2.ts",
      }),
    ]);

    const incoming = store.getEdgesTo(symA.id);
    expect(incoming).toHaveLength(2);
  });

  it("handles different relationship kinds between same symbols", () => {
    const symA = makeSymbol({
      name: "a",
      filePath: "src/a.ts",
      kind: SymbolKind.Function,
    });
    const symB = makeSymbol({
      name: "b",
      filePath: "src/b.ts",
      kind: SymbolKind.Function,
    });
    store.upsertSymbols([symA, symB]);

    store.upsertEdges([
      makeEdge({
        sourceId: symA.id,
        targetId: symB.id,
        kind: RelationshipKind.Imports,
        filePath: "src/a.ts",
      }),
      makeEdge({
        sourceId: symA.id,
        targetId: symB.id,
        kind: RelationshipKind.Calls,
        filePath: "src/a.ts",
      }),
    ]);

    const from = store.getEdgesFrom(symA.id);
    expect(from).toHaveLength(2);
    const kinds = from.map((e) => e.kind).sort();
    expect(kinds).toEqual([RelationshipKind.Calls, RelationshipKind.Imports]);
  });
});

describe("getStats", () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("returns zeros for empty graph", () => {
    const stats = store.getStats();
    expect(stats).toEqual({ symbols: 0, edges: 0, files: 0 });
  });

  it("counts symbols, edges, and unique files correctly", () => {
    const symA = makeSymbol({
      name: "foo",
      filePath: "src/a.ts",
      kind: SymbolKind.Function,
    });
    const symB = makeSymbol({
      name: "bar",
      filePath: "src/a.ts",
      kind: SymbolKind.Function,
    });
    const symC = makeSymbol({
      name: "baz",
      filePath: "src/b.ts",
      kind: SymbolKind.Class,
    });
    store.upsertSymbols([symA, symB, symC]);

    store.upsertEdges([
      makeEdge({
        sourceId: symA.id,
        targetId: symC.id,
        kind: RelationshipKind.Imports,
      }),
      makeEdge({
        sourceId: symB.id,
        targetId: symC.id,
        kind: RelationshipKind.Calls,
      }),
    ]);

    const stats = store.getStats();
    expect(stats.symbols).toBe(3);
    expect(stats.edges).toBe(2);
    expect(stats.files).toBe(2); // src/a.ts and src/b.ts
  });

  it("counts files correctly with many symbols per file", () => {
    const symbols = Array.from({ length: 10 }, (_, i) =>
      makeSymbol({
        name: `fn${i}`,
        filePath: `src/file${i % 3}.ts`,
        kind: SymbolKind.Function,
      }),
    );
    store.upsertSymbols(symbols);

    const stats = store.getStats();
    expect(stats.symbols).toBe(10);
    expect(stats.files).toBe(3);
  });

  it("updates after deletions", () => {
    const symA = makeSymbol({
      name: "keep",
      filePath: "src/keep.ts",
      kind: SymbolKind.Function,
    });
    const symB = makeSymbol({
      name: "remove",
      filePath: "src/remove.ts",
      kind: SymbolKind.Function,
    });
    store.upsertSymbols([symA, symB]);

    store.upsertEdges([
      makeEdge({
        sourceId: symB.id,
        targetId: symA.id,
        kind: RelationshipKind.Imports,
        filePath: "src/remove.ts",
      }),
    ]);

    expect(store.getStats()).toEqual({ symbols: 2, edges: 1, files: 2 });

    store.deleteSymbolsByFile("src/remove.ts");
    store.deleteEdgesByFile("src/remove.ts");

    expect(store.getStats()).toEqual({ symbols: 1, edges: 0, files: 1 });
  });
});
