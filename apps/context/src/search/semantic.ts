/**
 * Semantic search: vector-based similarity search on symbol embeddings.
 *
 * Embeds a natural-language query via the configured OpenAI provider,
 * runs nearest-neighbor retrieval against the stored vectors, and
 * returns hydrated results with similarity scores.
 *
 * Slice: S02 — Semantic Search UX
 */

import type { GraphStore } from "../graph/store.js";
import type { Config, SemanticSearchOptions, SemanticSearchResult } from "../types.js";
import { SemanticDomainError } from "../semantic/contracts.js";
import type { SemanticDomainErrorCode } from "../semantic/contracts.js";
import { createOpenAIEmbeddingProvider, embedQuery } from "../semantic/embedding.js";

/** Default topK when not specified by the caller. */
const DEFAULT_TOP_K = 10;

/** Over-fetch multiplier when kind filter is active. */
const KIND_FILTER_OVERFETCH_MULTIPLIER = 3;

/**
 * Search for symbols semantically similar to a natural-language query.
 *
 * Flow:
 *   1. Read stored model/dimension invariant from the graph store.
 *   2. Validate that semantic vectors exist (non-empty index).
 *   3. Validate model consistency (config vs stored invariant).
 *   4. Embed the query text using the OpenAI provider.
 *   5. Run nearest-neighbor search against stored vectors.
 *   6. Hydrate each result with full symbol metadata.
 *   7. Apply optional kind filter.
 *   8. Convert L2 distance to similarity score.
 *   9. Return sorted results.
 *
 * @param query - Natural-language search query
 * @param store - GraphStore with indexed semantic vectors
 * @param config - Configuration with provider settings
 * @param options - Optional search options (topK, kind filter, fileScope)
 * @returns Ranked semantic search results with hydrated symbol metadata
 *
 * @throws SemanticDomainError with code:
 *   - SEMANTIC_SEARCH_EMPTY_INDEX — no vectors in store
 *   - SEMANTIC_SEARCH_MODEL_MISMATCH — config model differs from stored invariant
 *   - SEMANTIC_OPENAI_MISSING_KEY — OPENAI_API_KEY not set
 *   - SEMANTIC_OPENAI_AUTH — authentication failure
 *   - SEMANTIC_OPENAI_RATE_LIMIT — rate limit hit
 *   - SEMANTIC_OPENAI_PROVIDER_UNAVAILABLE — provider unreachable
 */
export async function semanticSearch(
  query: string,
  store: GraphStore,
  config: Config,
  options?: SemanticSearchOptions,
): Promise<SemanticSearchResult[]> {
  const topK = options?.topK ?? DEFAULT_TOP_K;
  const kindFilter = options?.kind;

  // ── 1. Check for empty index ──
  const vectorCount = store.countSemanticVectors();
  if (vectorCount === 0) {
    throw new SemanticDomainError(
      "No semantic vectors indexed. Run `kata context index` first.",
      {
        code: "SEMANTIC_SEARCH_EMPTY_INDEX" as SemanticDomainErrorCode,
        provider: "openai",
        phase: "query",
        retryable: false,
        partialWritesCommitted: false,
      },
    );
  }

  // ── 2. Read stored invariant ──
  const invariant = store.getSemanticVectorInvariant();
  if (!invariant) {
    // Vectors exist but invariant is missing — inconsistent state
    throw new SemanticDomainError(
      "Semantic vectors exist but model invariant is missing. Re-index with `kata context index --full`.",
      {
        code: "SEMANTIC_SEARCH_EMPTY_INDEX" as SemanticDomainErrorCode,
        provider: "openai",
        phase: "query",
        retryable: false,
        partialWritesCommitted: false,
      },
    );
  }

  // ── 3. Validate model consistency ──
  const configModel = config.providers.openai.model;
  if (configModel !== invariant.model) {
    throw new SemanticDomainError(
      `Model mismatch: config specifies "${configModel}" but index was built with "${invariant.model}". Re-index with \`kata context index --full\` to align.`,
      {
        code: "SEMANTIC_SEARCH_MODEL_MISMATCH" as SemanticDomainErrorCode,
        provider: "openai",
        phase: "query",
        retryable: false,
        partialWritesCommitted: false,
      },
    );
  }

  // ── 4. Embed the query ──
  const provider = options?.provider ?? createOpenAIEmbeddingProvider({
    model: invariant.model,
  });

  const queryVector = await embedQuery(
    query,
    provider,
    invariant.model,
    invariant.dimensions,
  );

  // ── 5. Query nearest neighbors ──
  // Over-fetch when kind filter is active to compensate for post-filter reduction
  const fetchK = kindFilter
    ? topK * KIND_FILTER_OVERFETCH_MULTIPLIER
    : topK;

  const nearestResults = store.querySemanticNearest({
    queryVector,
    topK: fetchK,
    model: invariant.model,
  });

  // ── 6. Hydrate results with full symbol metadata ──
  const hydrated: SemanticSearchResult[] = [];

  for (const result of nearestResults) {
    const symbol = store.getSymbol(result.symbolId);

    // Skip orphan vectors (symbolId without matching symbol row)
    if (!symbol) {
      continue;
    }

    // Apply kind filter
    if (kindFilter && symbol.kind !== kindFilter) {
      continue;
    }

    // Convert L2 distance to similarity score: 1 / (1 + distance)
    const score = 1 / (1 + result.distance);

    hydrated.push({
      symbol,
      distance: result.distance,
      score,
    });
  }

  // ── 7. Trim to requested topK (may have over-fetched) ──
  return hydrated.slice(0, topK);
}
