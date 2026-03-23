/**
 * Contract tests for semantic memory recall.
 *
 * Tests that recallMemories() returns ranked results with similarity scores
 * and handles error paths with stable codes. Uses injectable mock embedding
 * provider — no live API calls.
 *
 * Slice: S03 — Persistent Memory + Git Audit
 * Task: T01 — Author memory contract tests (initially failing)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { rmSync } from "node:fs";
import { createTempGitRepo } from "../helpers/git-fixtures.js";

async function loadMemoryRecall(): Promise<Record<string, any> | null> {
  try {
    return await import("../../src/memory/recall.js");
  } catch {
    return null;
  }
}

async function loadMemoryStore(): Promise<Record<string, any> | null> {
  try {
    return await import("../../src/memory/store.js");
  } catch {
    return null;
  }
}

/** Mock embedding provider that returns deterministic vectors matching EmbeddingProvider interface */
function createMockEmbeddingProvider() {
  return {
    embedBatch: vi.fn(
      async (
        batch: Array<{ symbolId: string; text: string; filePath: string }>,
        _context: { model: string; expectedDimensions: number },
      ) =>
        batch.map((item) => {
          const len = item.text.length;
          return {
            symbolId: item.symbolId,
            embedding: [len * 0.01, len * 0.02, len * 0.03, len * 0.04],
          };
        }),
    ),
  };
}

describe("memory recall contract (T01 red-first)", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = createTempGitRepo("kata-memory-recall-");
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("exports recallMemories function", async () => {
    const mod = await loadMemoryRecall();
    expect(mod).not.toBeNull();
    expect(typeof mod!.recallMemories).toBe("function");
  });

  it("recallMemories() returns ranked MemoryRecallResult[] with similarity scores", async () => {
    const storeMod = await loadMemoryStore();
    const recallMod = await loadMemoryRecall();
    expect(storeMod).not.toBeNull();
    expect(recallMod).not.toBeNull();

    const store = storeMod!.MemoryStore
      ? new storeMod!.MemoryStore(repoDir)
      : storeMod!.createMemoryStore(repoDir);

    await store.remember({
      content: "Authentication uses JWT with RS256 algorithm",
      category: "architecture",
      tags: ["auth"],
    });
    await store.remember({
      content: "Database schema follows star pattern for analytics",
      category: "architecture",
      tags: ["database"],
    });
    await store.remember({
      content: "Auth tokens expire after 24 hours",
      category: "architecture",
      tags: ["auth", "security"],
    });

    const provider = createMockEmbeddingProvider();

    const results = await recallMod!.recallMemories({
      query: "How does authentication work?",
      store,
      embeddingProvider: provider,
      topK: 3,
    });

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(3);

    // Each result has memory entry + similarity score
    for (const r of results) {
      expect(r.memory).toBeDefined();
      expect(r.memory.id).toBeDefined();
      expect(r.memory.content).toBeDefined();
      expect(typeof r.similarity).toBe("number");
      expect(r.similarity).toBeGreaterThanOrEqual(0);
      expect(r.similarity).toBeLessThanOrEqual(1);
    }

    // Results ordered by descending similarity
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].similarity).toBeGreaterThanOrEqual(
        results[i].similarity,
      );
    }
  });

  it("empty memory store returns stable MEMORY_RECALL_EMPTY error", async () => {
    const storeMod = await loadMemoryStore();
    const recallMod = await loadMemoryRecall();
    expect(storeMod).not.toBeNull();
    expect(recallMod).not.toBeNull();

    const store = storeMod!.MemoryStore
      ? new storeMod!.MemoryStore(repoDir)
      : storeMod!.createMemoryStore(repoDir);

    const provider = createMockEmbeddingProvider();

    try {
      await recallMod!.recallMemories({
        query: "anything",
        store,
        embeddingProvider: provider,
      });
      expect.unreachable("Expected MEMORY_RECALL_EMPTY error");
    } catch (err: any) {
      expect(err.code).toBe("MEMORY_RECALL_EMPTY");
    }
  });

  it("missing OPENAI_API_KEY returns stable MEMORY_RECALL_MISSING_KEY error", async () => {
    const recallMod = await loadMemoryRecall();
    expect(recallMod).not.toBeNull();

    const storeMod = await loadMemoryStore();
    expect(storeMod).not.toBeNull();

    const store = storeMod!.MemoryStore
      ? new storeMod!.MemoryStore(repoDir)
      : storeMod!.createMemoryStore(repoDir);

    await store.remember({
      content: "Some memory",
      category: "test",
      tags: [],
    });

    // No provider passed — should detect missing key
    try {
      await recallMod!.recallMemories({
        query: "test",
        store,
        // embeddingProvider intentionally omitted
      });
      expect.unreachable("Expected MEMORY_RECALL_MISSING_KEY error");
    } catch (err: any) {
      expect(err.code).toBe("MEMORY_RECALL_MISSING_KEY");
    }
  });
});
