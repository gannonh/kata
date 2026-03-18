import { GraphStore } from "../../src/graph/store.js";
import { SymbolKind, RelationshipKind } from "../../src/types.js";
import type { Symbol, Relationship } from "../../src/types.js";
import { generateSymbolId } from "../../src/parser/common.js";

// ── Helpers ──

function makeSymbol(overrides: Partial<Symbol> & { name: string; filePath: string; kind: SymbolKind }): Symbol {
  const id = overrides.id ?? generateSymbolId(overrides.filePath, overrides.name, overrides.kind);
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

function makeEdge(overrides: Partial<Relationship> & { sourceId: string; targetId: string }): Relationship {
  return {
    sourceId: overrides.sourceId,
    targetId: overrides.targetId,
    kind: overrides.kind ?? RelationshipKind.Imports,
    filePath: overrides.filePath ?? "src/main.ts",
    lineNumber: overrides.lineNumber ?? 1,
  };
}

// ── Tests ──

describe("GraphStore", () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  // ── Constructor ──

  it("creates an in-memory database successfully", () => {
    // If we got here, the constructor worked
    expect(store).toBeDefined();
  });

  it("creates a file-based database", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const dbPath = path.join(os.tmpdir(), `kata-test-${Date.now()}.db`);
    try {
      const fileStore = new GraphStore(dbPath);
      expect(fs.existsSync(dbPath)).toBe(true);
      fileStore.close();
    } finally {
      fs.unlinkSync(dbPath);
      // Clean up WAL/SHM files
      try { fs.unlinkSync(dbPath + "-wal"); } catch {}
      try { fs.unlinkSync(dbPath + "-shm"); } catch {}
    }
  });

  // ── Symbol CRUD ──

  describe("upsertSymbols", () => {
    it("inserts symbols and retrieves by id", () => {
      const sym = makeSymbol({ name: "greet", filePath: "src/greet.ts", kind: SymbolKind.Function });
      store.upsertSymbols([sym]);

      const result = store.getSymbol(sym.id);
      expect(result).not.toBeNull();
      expect(result!.name).toBe("greet");
      expect(result!.kind).toBe(SymbolKind.Function);
      expect(result!.filePath).toBe("src/greet.ts");
      expect(result!.exported).toBe(true);
    });

    it("updates existing symbols on conflict (upsert)", () => {
      const sym = makeSymbol({
        name: "greet",
        filePath: "src/greet.ts",
        kind: SymbolKind.Function,
        lineEnd: 10,
      });
      store.upsertSymbols([sym]);

      const updated = { ...sym, lineEnd: 20, source: "function greet() { return 'hi'; }" };
      store.upsertSymbols([updated]);

      const result = store.getSymbol(sym.id);
      expect(result!.lineEnd).toBe(20);
      expect(result!.source).toBe("function greet() { return 'hi'; }");
    });

    it("handles batch insert of multiple symbols in one transaction", () => {
      const symbols = [
        makeSymbol({ name: "foo", filePath: "src/a.ts", kind: SymbolKind.Function }),
        makeSymbol({ name: "bar", filePath: "src/a.ts", kind: SymbolKind.Function }),
        makeSymbol({ name: "Baz", filePath: "src/b.ts", kind: SymbolKind.Class }),
      ];
      store.upsertSymbols(symbols);

      expect(store.getSymbol(symbols[0].id)).not.toBeNull();
      expect(store.getSymbol(symbols[1].id)).not.toBeNull();
      expect(store.getSymbol(symbols[2].id)).not.toBeNull();
    });

    it("handles empty array gracefully", () => {
      store.upsertSymbols([]);
      // No throw
    });

    it("preserves optional fields (summary, lastIndexedAt, gitSha)", () => {
      const sym = makeSymbol({
        name: "withMeta",
        filePath: "src/meta.ts",
        kind: SymbolKind.Function,
        summary: "A function that does things",
        lastIndexedAt: "2026-03-15T10:00:00Z",
        gitSha: "abc123",
      });
      store.upsertSymbols([sym]);

      const result = store.getSymbol(sym.id);
      expect(result!.summary).toBe("A function that does things");
      expect(result!.lastIndexedAt).toBe("2026-03-15T10:00:00Z");
      expect(result!.gitSha).toBe("abc123");
    });

    it("stores signature and docstring", () => {
      const sym = makeSymbol({
        name: "greet",
        filePath: "src/greet.ts",
        kind: SymbolKind.Function,
        signature: "function greet(name: string): string",
        docstring: "Greets the user by name.",
      });
      store.upsertSymbols([sym]);

      const result = store.getSymbol(sym.id);
      expect(result!.signature).toBe("function greet(name: string): string");
      expect(result!.docstring).toBe("Greets the user by name.");
    });
  });

  describe("getSymbol", () => {
    it("returns null for non-existent id", () => {
      expect(store.getSymbol("nonexistent")).toBeNull();
    });
  });

  describe("getSymbolsByFile", () => {
    it("returns all symbols in a file ordered by line_start", () => {
      const symbols = [
        makeSymbol({ name: "second", filePath: "src/a.ts", kind: SymbolKind.Function, lineStart: 10 }),
        makeSymbol({ name: "first", filePath: "src/a.ts", kind: SymbolKind.Function, lineStart: 1 }),
        makeSymbol({ name: "other", filePath: "src/b.ts", kind: SymbolKind.Function }),
      ];
      store.upsertSymbols(symbols);

      const result = store.getSymbolsByFile("src/a.ts");
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("first");
      expect(result[1].name).toBe("second");
    });

    it("returns empty array for unknown file", () => {
      expect(store.getSymbolsByFile("nope.ts")).toEqual([]);
    });
  });

  describe("deleteSymbolsByFile", () => {
    it("removes all symbols for a file and returns count", () => {
      const symbols = [
        makeSymbol({ name: "a", filePath: "src/target.ts", kind: SymbolKind.Function }),
        makeSymbol({ name: "b", filePath: "src/target.ts", kind: SymbolKind.Class }),
        makeSymbol({ name: "c", filePath: "src/keep.ts", kind: SymbolKind.Function }),
      ];
      store.upsertSymbols(symbols);

      const deleted = store.deleteSymbolsByFile("src/target.ts");
      expect(deleted).toBe(2);
      expect(store.getSymbolsByFile("src/target.ts")).toEqual([]);
      expect(store.getSymbolsByFile("src/keep.ts")).toHaveLength(1);
    });

    it("returns 0 when no symbols match", () => {
      expect(store.deleteSymbolsByFile("nothing.ts")).toBe(0);
    });
  });

  // ── Edge CRUD ──

  describe("upsertEdges", () => {
    it("inserts edges and they can be retrieved by querying", () => {
      const sym1 = makeSymbol({ name: "caller", filePath: "src/a.ts", kind: SymbolKind.Function });
      const sym2 = makeSymbol({ name: "callee", filePath: "src/b.ts", kind: SymbolKind.Function });
      store.upsertSymbols([sym1, sym2]);

      const edge = makeEdge({
        sourceId: sym1.id,
        targetId: sym2.id,
        kind: RelationshipKind.Calls,
        filePath: "src/a.ts",
        lineNumber: 5,
      });
      store.upsertEdges([edge]);

      // Verify via raw query — edge traversal methods are in T02
      const rows = (store as any).db
        .prepare("SELECT * FROM edges WHERE source_id = ?")
        .all(sym1.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].target_id).toBe(sym2.id);
      expect(rows[0].kind).toBe(RelationshipKind.Calls);
    });

    it("replaces edges on conflict (same source, target, kind)", () => {
      const edge1 = makeEdge({ sourceId: "a", targetId: "b", kind: RelationshipKind.Imports, lineNumber: 1 });
      store.upsertEdges([edge1]);

      const edge2 = makeEdge({ sourceId: "a", targetId: "b", kind: RelationshipKind.Imports, lineNumber: 99 });
      store.upsertEdges([edge2]);

      const rows = (store as any).db
        .prepare("SELECT * FROM edges WHERE source_id = 'a' AND target_id = 'b'")
        .all();
      expect(rows).toHaveLength(1);
      expect(rows[0].line_number).toBe(99);
    });

    it("allows multiple edge kinds between same symbols", () => {
      const edges = [
        makeEdge({ sourceId: "a", targetId: "b", kind: RelationshipKind.Imports }),
        makeEdge({ sourceId: "a", targetId: "b", kind: RelationshipKind.Calls }),
      ];
      store.upsertEdges(edges);

      const rows = (store as any).db
        .prepare("SELECT * FROM edges WHERE source_id = 'a' AND target_id = 'b'")
        .all();
      expect(rows).toHaveLength(2);
    });

    it("handles empty array gracefully", () => {
      store.upsertEdges([]);
    });

    it("batch inserts multiple edges in one transaction", () => {
      const edges = Array.from({ length: 50 }, (_, i) =>
        makeEdge({ sourceId: `s${i}`, targetId: `t${i}`, kind: RelationshipKind.Imports }),
      );
      store.upsertEdges(edges);

      const count = (store as any).db
        .prepare("SELECT COUNT(*) as cnt FROM edges")
        .get().cnt;
      expect(count).toBe(50);
    });
  });

  describe("deleteEdgesByFile", () => {
    it("removes all edges originating from a file", () => {
      const edges = [
        makeEdge({ sourceId: "a", targetId: "b", filePath: "src/target.ts" }),
        makeEdge({ sourceId: "c", targetId: "d", filePath: "src/target.ts" }),
        makeEdge({ sourceId: "e", targetId: "f", filePath: "src/keep.ts" }),
      ];
      store.upsertEdges(edges);

      const deleted = store.deleteEdgesByFile("src/target.ts");
      expect(deleted).toBe(2);

      const remaining = (store as any).db.prepare("SELECT COUNT(*) as cnt FROM edges").get().cnt;
      expect(remaining).toBe(1);
    });

    it("returns 0 when no edges match", () => {
      expect(store.deleteEdgesByFile("nothing.ts")).toBe(0);
    });
  });

  // ── Metadata ──

  describe("metadata (lastIndexedSha)", () => {
    it("returns null when no SHA has been set", () => {
      expect(store.getLastIndexedSha()).toBeNull();
    });

    it("round-trips SHA correctly", () => {
      store.setLastIndexedSha("abc123def456");
      expect(store.getLastIndexedSha()).toBe("abc123def456");
    });

    it("updates SHA on subsequent calls", () => {
      store.setLastIndexedSha("first");
      store.setLastIndexedSha("second");
      expect(store.getLastIndexedSha()).toBe("second");
    });
  });

  // ── Close ──

  describe("close", () => {
    it("closes the database cleanly", () => {
      const s = new GraphStore(":memory:");
      s.close();
      // Accessing db after close should throw
      expect(() => s.getLastIndexedSha()).toThrow();
    });
  });
});
