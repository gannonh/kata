/**
 * Contract tests for semanticSearch() function.
 *
 * These tests define the acceptance boundary for the semantic search function
 * before implementation exists. They use injectable provider doubles — no live
 * OpenAI calls. Each test should fail for missing implementation, not harness errors.
 *
 * Slice: S02 — Semantic Search UX
 * Task: T01 — Author semantic search contract tests (initially failing)
 */

import { GraphStore } from "../../src/graph/store.js";
import { DEFAULT_CONFIG, SymbolKind } from "../../src/types.js";
import type { Config, SemanticQueryResult, Symbol } from "../../src/types.js";
import { SemanticDomainError } from "../../src/semantic/contracts.js";
import type { EmbeddingProvider, EmbeddingProviderRequest, EmbeddingProviderResponse } from "../../src/semantic/contracts.js";

// ── Test helpers ──

/** Create a minimal mock embedding provider that returns deterministic vectors. */
function createMockEmbeddingProvider(
  vectorMap?: Map<string, number[]>,
): EmbeddingProvider {
  const defaultVector = Array.from({ length: 1536 }, (_, i) => i * 0.001);
  return {
    async embedBatch(
      batch: EmbeddingProviderRequest[],
      _context: { model: string; expectedDimensions: number },
    ): Promise<EmbeddingProviderResponse[]> {
      return batch.map((item) => ({
        symbolId: item.symbolId,
        embedding: vectorMap?.get(item.symbolId) ?? defaultVector,
      }));
    },
  };
}

/** Seed a store with symbols and semantic vectors for testing. */
function seedStoreWithSemanticData(
  store: GraphStore,
  options?: { model?: string; dimensions?: number },
): { symbols: Symbol[] } {
  const model = options?.model ?? "text-embedding-3-small";
  const dimensions = options?.dimensions ?? 1536;

  const symbols: Symbol[] = [
    {
      id: "sym-auth-handler",
      name: "authenticateUser",
      kind: SymbolKind.Function,
      filePath: "src/auth.ts",
      lineStart: 10,
      lineEnd: 30,
      signature: "function authenticateUser(token: string): Promise<User>",
      docstring: "Validates a JWT token and returns the authenticated user",
      source: "async function authenticateUser(token: string): Promise<User> { ... }",
      exported: true,
      summary: "Validates a JWT token and returns the authenticated user object",
    },
    {
      id: "sym-user-service",
      name: "UserService",
      kind: SymbolKind.Class,
      filePath: "src/services/user.ts",
      lineStart: 5,
      lineEnd: 80,
      signature: "class UserService",
      docstring: "Service for managing user accounts",
      source: "class UserService { ... }",
      exported: true,
      summary: "Service class that manages user CRUD operations and account lifecycle",
    },
    {
      id: "sym-login-handler",
      name: "handleLogin",
      kind: SymbolKind.Function,
      filePath: "src/routes/login.ts",
      lineStart: 15,
      lineEnd: 45,
      signature: "function handleLogin(req: Request): Promise<Response>",
      docstring: null,
      source: "async function handleLogin(req: Request): Promise<Response> { ... }",
      exported: true,
      summary: "Handles login endpoint — validates credentials and returns auth token",
    },
  ];

  // Upsert symbols
  store.upsertSymbols(symbols);

  // Create deterministic vectors with different distances from a "query" vector
  // Lower distance = more similar
  const vectors = symbols.map((sym, index) => ({
    symbolId: sym.id,
    filePath: sym.filePath,
    model,
    dimensions,
    // Create vectors with increasing L2 distance from a reference point
    vector: Array.from({ length: dimensions }, (_, i) => i * 0.001 + index * 0.1),
  }));

  store.upsertSemanticVectors(vectors);

  return { symbols };
}

/** Create a config with optional overrides. */
function makeConfig(overrides?: Partial<Config>): Config {
  return { ...DEFAULT_CONFIG, ...overrides };
}

// ── Tests ──

describe("semanticSearch() function contract", () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  describe("happy path — ranked results with hydrated metadata", () => {
    it("returns SemanticSearchResult[] with symbol name, kind, filePath, lineStart, lineEnd, distance, and score", async () => {
      seedStoreWithSemanticData(store);
      const config = makeConfig();

      // Import the function under test — will fail until T02 implements it
      const { semanticSearch } = await import("../../src/search/semantic.js");

      const results = await semanticSearch("authentication handling", store, config, {
        topK: 10,
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      // Each result should have full hydrated symbol metadata + score data
      for (const result of results) {
        expect(result.symbol).toBeDefined();
        expect(typeof result.symbol.name).toBe("string");
        expect(typeof result.symbol.kind).toBe("string");
        expect(typeof result.symbol.filePath).toBe("string");
        expect(typeof result.symbol.lineStart).toBe("number");
        expect(typeof result.symbol.lineEnd).toBe("number");
        expect(typeof result.distance).toBe("number");
        expect(typeof result.score).toBe("number");
        expect(result.distance).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    });

    it("returns results ordered by ascending L2 distance (most similar first)", async () => {
      seedStoreWithSemanticData(store);
      const config = makeConfig();

      const { semanticSearch } = await import("../../src/search/semantic.js");

      const results = await semanticSearch("authentication handling", store, config, {
        topK: 10,
      });

      expect(results.length).toBeGreaterThanOrEqual(2);

      // Verify ascending distance order
      for (let i = 1; i < results.length; i++) {
        expect(results[i]!.distance).toBeGreaterThanOrEqual(results[i - 1]!.distance);
      }
    });

    it("respects topK limit on result count", async () => {
      seedStoreWithSemanticData(store);
      const config = makeConfig();

      const { semanticSearch } = await import("../../src/search/semantic.js");

      const results = await semanticSearch("authentication handling", store, config, {
        topK: 1,
      });

      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe("kind filter", () => {
    it("reduces results to only symbols of the specified kind", async () => {
      seedStoreWithSemanticData(store);
      const config = makeConfig();

      const { semanticSearch } = await import("../../src/search/semantic.js");

      const results = await semanticSearch("authentication handling", store, config, {
        topK: 10,
        kind: SymbolKind.Function,
      });

      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result.symbol.kind).toBe(SymbolKind.Function);
      }
    });

    it("returns empty array when kind filter matches no results", async () => {
      seedStoreWithSemanticData(store);
      const config = makeConfig();

      const { semanticSearch } = await import("../../src/search/semantic.js");

      // SymbolKind.Enum won't match any seeded symbols
      const results = await semanticSearch("authentication handling", store, config, {
        topK: 10,
        kind: SymbolKind.Enum,
      });

      expect(results).toEqual([]);
    });
  });

  describe("orphan symbol tolerance", () => {
    it("skips results where symbolId has no matching symbol in store (orphan vector)", async () => {
      seedStoreWithSemanticData(store);
      const config = makeConfig();

      // Manually insert an orphan vector (symbolId not in symbols table)
      store.upsertSemanticVectors([
        {
          symbolId: "orphan-id-does-not-exist",
          filePath: "src/deleted.ts",
          model: "text-embedding-3-small",
          dimensions: 1536,
          vector: Array.from({ length: 1536 }, () => 0),
        },
      ]);

      const { semanticSearch } = await import("../../src/search/semantic.js");

      const results = await semanticSearch("authentication handling", store, config, {
        topK: 10,
      });

      // Should return results but none should have orphan-id
      for (const result of results) {
        expect(result.symbol.id).not.toBe("orphan-id-does-not-exist");
      }

      // Should still return the valid symbols
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("error paths — typed errors with stable codes", () => {
    it("throws SEMANTIC_SEARCH_EMPTY_INDEX when countSemanticVectors === 0", async () => {
      // Empty store — no semantic vectors seeded
      const config = makeConfig();

      const { semanticSearch } = await import("../../src/search/semantic.js");

      await expect(
        semanticSearch("authentication handling", store, config),
      ).rejects.toThrow(SemanticDomainError);

      try {
        await semanticSearch("authentication handling", store, config);
      } catch (err) {
        expect(err).toBeInstanceOf(SemanticDomainError);
        expect((err as SemanticDomainError).code).toBe("SEMANTIC_SEARCH_EMPTY_INDEX");
      }
    });

    it("throws SEMANTIC_OPENAI_MISSING_KEY when OPENAI_API_KEY is not set", async () => {
      seedStoreWithSemanticData(store);
      const config = makeConfig();

      // Remove API key from environment
      const previousKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        const { semanticSearch } = await import("../../src/search/semantic.js");

        await expect(
          semanticSearch("authentication handling", store, config),
        ).rejects.toThrow(SemanticDomainError);

        try {
          await semanticSearch("authentication handling", store, config);
        } catch (err) {
          expect(err).toBeInstanceOf(SemanticDomainError);
          expect((err as SemanticDomainError).code).toBe("SEMANTIC_OPENAI_MISSING_KEY");
        }
      } finally {
        if (previousKey !== undefined) {
          process.env.OPENAI_API_KEY = previousKey;
        }
      }
    });

    it("throws SEMANTIC_SEARCH_MODEL_MISMATCH when config model differs from stored invariant", async () => {
      // Seed with model "text-embedding-3-small"
      seedStoreWithSemanticData(store, { model: "text-embedding-3-small" });

      // Config uses a different model
      const config = makeConfig({
        providers: {
          ...DEFAULT_CONFIG.providers,
          openai: { ...DEFAULT_CONFIG.providers.openai, model: "text-embedding-3-large" },
        },
      });

      const { semanticSearch } = await import("../../src/search/semantic.js");

      await expect(
        semanticSearch("authentication handling", store, config),
      ).rejects.toThrow(SemanticDomainError);

      try {
        await semanticSearch("authentication handling", store, config);
      } catch (err) {
        expect(err).toBeInstanceOf(SemanticDomainError);
        expect((err as SemanticDomainError).code).toBe("SEMANTIC_SEARCH_MODEL_MISMATCH");
      }
    });
  });
});
