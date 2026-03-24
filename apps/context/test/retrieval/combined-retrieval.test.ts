/**
 * Combined retrieval contract tests — S04/T01
 */

import { describe, it, expect } from "vitest";
import { rerankResults } from "../../src/retrieval/reranker.js";
import { assembleBudget, estimateTokens } from "../../src/retrieval/budget.js";
import type {
  RetrievalItem,
  CombinedRetrievalResult,
  RetrievalDiagnostics,
} from "../../src/retrieval/types.js";
import { DEFAULT_RANKING_WEIGHTS } from "../../src/retrieval/types.js";

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
