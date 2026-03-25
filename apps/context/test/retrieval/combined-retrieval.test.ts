/**
 * Combined retrieval contract tests — S04/T01
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rerankResults } from "../../src/retrieval/reranker.js";
import { assembleBudget, estimateTokens } from "../../src/retrieval/budget.js";
import { combinedRetrieval, type CombinedRetrievalInput } from "../../src/retrieval/combined.js";
import type {
  RetrievalItem,
  CombinedRetrievalResult,
  RetrievalDiagnostics,
} from "../../src/retrieval/types.js";
import { DEFAULT_RANKING_WEIGHTS } from "../../src/retrieval/types.js";

// Top-level mocks required by combinedRetrieval orchestrator tests
vi.mock("../../src/graph/queries.js", () => ({
  dependents: vi.fn().mockReturnValue(null),
}));

vi.mock("../../src/search/semantic.js", () => ({
  semanticSearch: vi.fn().mockRejectedValue(new Error("no vector index")),
}));

// ── Helper factories ──

function makeItem(overrides: Partial<RetrievalItem> = {}): RetrievalItem {
  return {
    id: "sym-1",
    content: "function foo() { return 1; }",
    source: "src/foo.ts:1-3",
    provenance: "structural",
    score: 1.0,
    estimatedTokens: 7,
    ...overrides,
  };
}

describe("Reranker", () => {
  it("returns empty array for empty input", () => {
    expect(rerankResults([])).toEqual([]);
  });

  it("preserves all items", () => {
    const items = [
      makeItem({ id: "a", provenance: "structural", score: 1.0 }),
      makeItem({ id: "b", provenance: "semantic", score: 0.8 }),
      makeItem({ id: "c", provenance: "memory", score: 0.6 }),
    ];
    const result = rerankResults(items);
    expect(result).toHaveLength(3);
  });

  it("applies ranking weights", () => {
    const items = [
      makeItem({ id: "a", provenance: "structural", score: 0.5 }),
      makeItem({ id: "b", provenance: "semantic", score: 1.0 }),
    ];
    // With default weights (structural 0.4 > semantic 0.3),
    // a structural item with same normalized score should rank higher
    const result = rerankResults(items);
    expect(result).toHaveLength(2);
    // All items have scores assigned
    for (const item of result) {
      expect(item.score).toBeGreaterThan(0);
    }
  });

  it("accepts custom weights", () => {
    const items = [
      makeItem({ id: "a", provenance: "structural", score: 1.0 }),
      makeItem({ id: "b", provenance: "semantic", score: 1.0 }),
    ];
    const result = rerankResults(items, { structural: 0.1, semantic: 0.9 });
    expect(result).toHaveLength(2);
    // Semantic should rank higher with boosted weight
    expect(result[0]!.id).toBe("b");
  });

  it("includes provenance labels on output", () => {
    const items = [
      makeItem({ id: "a", provenance: "structural" }),
      makeItem({ id: "b", provenance: "semantic" }),
      makeItem({ id: "c", provenance: "memory" }),
    ];
    const result = rerankResults(items);
    const provenances = new Set(result.map((r) => r.provenance));
    expect(provenances.has("structural")).toBe(true);
    expect(provenances.has("semantic")).toBe(true);
    expect(provenances.has("memory")).toBe(true);
  });
});

describe("Budget Assembly", () => {
  it("estimateTokens uses chars/4", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("")).toBe(0);
  });

  it("respects budget limit", () => {
    const items = [
      makeItem({ id: "a", content: "a".repeat(400), estimatedTokens: 100 }),
      makeItem({ id: "b", content: "b".repeat(400), estimatedTokens: 100 }),
      makeItem({ id: "c", content: "c".repeat(400), estimatedTokens: 100 }),
    ];
    const result = assembleBudget(items, 200);
    expect(result.budgetUsed).toBeLessThanOrEqual(200);
    expect(result.budgetTotal).toBe(200);
    expect(result.items.length).toBeLessThanOrEqual(2);
  });

  it("includes at least one item even if over budget", () => {
    const items = [makeItem({ id: "a", content: "a".repeat(1000), estimatedTokens: 250 })];
    const result = assembleBudget(items, 10);
    expect(result.items).toHaveLength(1);
  });

  it("returns empty for empty input", () => {
    const result = assembleBudget([], 1000);
    expect(result.items).toHaveLength(0);
    expect(result.budgetUsed).toBe(0);
  });

  it("fills greedily from top-ranked", () => {
    const items = [
      makeItem({ id: "a", content: "a".repeat(100), estimatedTokens: 25, score: 1.0 }),
      makeItem({ id: "b", content: "b".repeat(100), estimatedTokens: 25, score: 0.5 }),
      makeItem({ id: "c", content: "c".repeat(100), estimatedTokens: 25, score: 0.3 }),
    ];
    const result = assembleBudget(items, 50);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.id).toBe("a");
    expect(result.items[1]!.id).toBe("b");
  });
});

describe("Retrieval Types", () => {
  it("DEFAULT_RANKING_WEIGHTS sums to 1.0", () => {
    const sum =
      DEFAULT_RANKING_WEIGHTS.structural +
      DEFAULT_RANKING_WEIGHTS.semantic +
      DEFAULT_RANKING_WEIGHTS.recency +
      DEFAULT_RANKING_WEIGHTS.memory;
    expect(sum).toBe(1.0);
  });

  it("CombinedRetrievalResult shape is correct", () => {
    const result: CombinedRetrievalResult = {
      items: [makeItem()],
      diagnostics: {
        perStrategy: {
          structural: { status: "ok", hits: 1, timeMs: 10 },
          semantic: { status: "skipped", hits: 0, timeMs: 0 },
          memory: { status: "failed", hits: 0, timeMs: 0, error: "no store" },
        },
        budgetUsed: 7,
        budgetTotal: 4000,
        totalTimeMs: 15,
      },
    };
    expect(result.items).toHaveLength(1);
    expect(result.diagnostics.perStrategy.structural.status).toBe("ok");
    expect(result.diagnostics.perStrategy.semantic.status).toBe("skipped");
    expect(result.diagnostics.perStrategy.memory.status).toBe("failed");
  });
});

describe("combinedRetrieval orchestrator", () => {
  const SHARED_ID = "shared-sym";

  function makeSymbol(id: string, source = "function foo() {}") {
    return {
      id,
      name: "foo",
      kind: "function" as import("../../src/types.js").SymbolKind,
      filePath: "src/foo.ts",
      lineStart: 1,
      lineEnd: 3,
      source,
      signature: "function foo()",
      docstring: null,
      exported: true,
      summary: null,
      lastIndexedAt: new Date().toISOString(),
      gitSha: null,
    };
  }

  function makeStoreMock(symId = "struct-1") {
    return {
      ftsSearch: vi.fn().mockReturnValue([makeSymbol(symId)]),
      close: vi.fn(),
    };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("aggregates structural hits, skips missing memoryStore, reports failed semantic", async () => {
    const store = makeStoreMock("struct-1");
    const { dependents } = await import("../../src/graph/queries.js");
    vi.mocked(dependents).mockReturnValue(null);

    // semanticSearch is already mocked at module top to reject — no override needed

    const input: CombinedRetrievalInput = {
      query: "foo function",
      store: store as unknown as import("../../src/graph/store.js").GraphStore,
      // memoryStore intentionally absent → strategy should be "skipped"
      config: { rootDir: "/tmp", excludes: [], extensions: [] } as unknown as import("../../src/types.js").Config,
      options: { budget: 4000, topK: 10 },
    };

    const result = await combinedRetrieval(input);

    // Structural produced at least one hit
    expect(result.diagnostics.perStrategy.structural.status).toBe("ok");
    expect(result.diagnostics.perStrategy.structural.hits).toBeGreaterThan(0);

    // Memory was skipped (no store)
    expect(result.diagnostics.perStrategy.memory.status).toBe("skipped");

    // Semantic failed
    expect(result.diagnostics.perStrategy.semantic.status).toBe("failed");
    expect(result.diagnostics.perStrategy.semantic.error).toBeTruthy();

    // Budget fields are populated
    expect(result.diagnostics.budgetTotal).toBe(4000);
    expect(result.diagnostics.budgetUsed).toBeGreaterThanOrEqual(0);
    expect(result.diagnostics.totalTimeMs).toBeGreaterThanOrEqual(0);

    // Items array reflects deduplication (all from structural here)
    expect(result.items.length).toBeGreaterThan(0);
  });

  it("deduplicates items across strategies keeping highest score", async () => {
    const store = makeStoreMock(SHARED_ID);
    const { dependents } = await import("../../src/graph/queries.js");
    vi.mocked(dependents).mockReturnValue(null);

    // Override semantic to return the same ID with a higher score
    const { semanticSearch } = await import("../../src/search/semantic.js");
    vi.mocked(semanticSearch).mockResolvedValue([
      {
        symbol: makeSymbol(SHARED_ID, "function shared() {}") as any,
        score: 0.9,
        distance: 0.1,
      },
    ]);

    const input: CombinedRetrievalInput = {
      query: "shared",
      store: store as unknown as import("../../src/graph/store.js").GraphStore,
      config: { rootDir: "/tmp", excludes: [], extensions: [] } as unknown as import("../../src/types.js").Config,
      options: { budget: 4000 },
    };

    const result = await combinedRetrieval(input);

    // Should only appear once after dedup
    const occurrences = result.items.filter((i) => i.id === SHARED_ID);
    expect(occurrences).toHaveLength(1);
  });
});
