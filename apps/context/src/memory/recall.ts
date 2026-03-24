/**
 * Semantic memory recall — embed a query and search memory vectors.
 *
 * Slice: S03 — Persistent Memory + Git Audit
 * Task: T03 — Implement semantic recall + consolidate
 */

import type { MemoryStore } from "./store.js";
import type { MemoryEntry } from "./types.js";
import { MemoryError, MEMORY_ERROR_CODES } from "./types.js";
import type { EmbeddingProvider } from "../semantic/contracts.js";
import { getDefaultEmbeddingModel } from "../semantic/embedding.js";
import type { GraphStore } from "../graph/store.js";

export interface MemoryRecallResult {
  memory: MemoryEntry;
  similarity: number;
  distance: number;
}

export interface MemoryRecallOptions {
  query: string;
  store: MemoryStore;
  embeddingProvider?: EmbeddingProvider;
  graphStore?: GraphStore;
  topK?: number;
}

const MEMORY_SYMBOL_PREFIX = "memory:";

/**
 * Recall memories semantically: embed the query and find nearest memory vectors.
 *
 * @throws MemoryError with code MEMORY_RECALL_EMPTY when store has no memories
 * @throws MemoryError with code MEMORY_RECALL_MISSING_KEY when no provider and no API key
 */
export async function recallMemories(
  options: MemoryRecallOptions,
): Promise<MemoryRecallResult[]> {
  const { query, store, topK = 10 } = options;

  // Check if store has any memories
  const allMemories = await store.list();
  if (allMemories.length === 0) {
    throw new MemoryError(MEMORY_ERROR_CODES.MEMORY_RECALL_EMPTY, "No memories stored");
  }

  // Resolve embedding provider
  const provider = options.embeddingProvider;
  if (!provider) {
    if (!process.env.OPENAI_API_KEY) {
      throw new MemoryError(
        MEMORY_ERROR_CODES.MEMORY_RECALL_MISSING_KEY,
        "OPENAI_API_KEY is required for semantic recall when no embeddingProvider is supplied",
      );
    }
    const { createOpenAIEmbeddingProvider } = await import(
      "../semantic/embedding.js"
    );
    const realProvider = createOpenAIEmbeddingProvider({
      model: getDefaultEmbeddingModel(),
    });
    return recallWithProvider(query, store, realProvider, topK, allMemories, options.graphStore);
  }

  return recallWithProvider(query, store, provider, topK, allMemories, options.graphStore);
}

async function recallWithProvider(
  query: string,
  store: MemoryStore,
  provider: EmbeddingProvider,
  topK: number,
  allMemories: MemoryEntry[],
  graphStore?: GraphStore,
): Promise<MemoryRecallResult[]> {
  const model = getDefaultEmbeddingModel();

  // If graphStore available with memory vectors, use it
  if (graphStore) {
    const count = graphStore.countSemanticVectors();
    if (count > 0) {
      return recallViaGraphStore(query, store, provider, graphStore, model, topK, allMemories);
    }
  }

  // Brute-force: embed all memories + query, compute distances in-memory
  return recallBruteForce(query, store, provider, model, topK, allMemories);
}

/**
 * Recall using GraphStore's querySemanticNearest, filtering to memory: namespace.
 */
async function recallViaGraphStore(
  query: string,
  store: MemoryStore,
  provider: EmbeddingProvider,
  graphStore: GraphStore,
  model: string,
  topK: number,
  _allMemories: MemoryEntry[],
): Promise<MemoryRecallResult[]> {
  // Embed the query with dimensions matching stored vectors
  // Over-fetch then filter by memory: prefix (plan step 4b)
  const overFetchK = Math.max(topK * 5, 50);

  // First, figure out dimensions from a probe embed
  const probeResp = await provider.embedBatch(
    [{ symbolId: "probe", text: query, filePath: "<query>" }],
    { model, expectedDimensions: 0 }, // mock providers ignore this
  );
  const queryVector = probeResp[0]!.embedding;

  const results = graphStore.querySemanticNearest({
    queryVector,
    topK: overFetchK,
    model,
  });

  // Post-filter to memory namespace
  const memoryResults = results.filter((r) =>
    r.symbolId.startsWith(MEMORY_SYMBOL_PREFIX),
  );

  const hydrated: MemoryRecallResult[] = [];
  for (const result of memoryResults.slice(0, topK)) {
    const memId = result.symbolId.slice(MEMORY_SYMBOL_PREFIX.length);
    const entry = await store.get(memId);
    if (entry) {
      hydrated.push({
        memory: entry,
        similarity: 1 / (1 + result.distance),
        distance: result.distance,
      });
    }
  }

  return hydrated;
}

/**
 * Brute-force recall: embed all memories + query, compute distances in-memory.
 */
async function recallBruteForce(
  query: string,
  _store: MemoryStore,
  provider: EmbeddingProvider,
  model: string,
  topK: number,
  allMemories: MemoryEntry[],
): Promise<MemoryRecallResult[]> {
  const batch = [
    ...allMemories.map((m) => ({
      symbolId: `${MEMORY_SYMBOL_PREFIX}${m.id}`,
      text: m.content,
      filePath: "<memory>",
    })),
    { symbolId: "query", text: query, filePath: "<query>" },
  ];

  // Use 0 for expectedDimensions — mock providers don't validate
  const responses = await provider.embedBatch(batch, {
    model,
    expectedDimensions: 0,
  });

  const queryEmbedding = responses[responses.length - 1]!.embedding;
  const memoryEmbeddings = responses.slice(0, -1);

  const scored: MemoryRecallResult[] = [];
  for (let i = 0; i < memoryEmbeddings.length; i++) {
    const distance = computeL2Distance(queryEmbedding, memoryEmbeddings[i]!.embedding);
    scored.push({
      memory: allMemories[i]!,
      similarity: 1 / (1 + distance),
      distance,
    });
  }

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK);
}

function computeL2Distance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Embedding dimension mismatch: ${a.length} vs ${b.length}`,
    );
  }
  let sum = 0;
  const len = a.length;
  for (let i = 0; i < len; i++) {
    const diff = a[i]! - b[i]!;
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Embed a memory entry for storage in the GraphStore with memory: namespace.
 */
export async function embedMemoryForStorage(
  entry: MemoryEntry,
  provider: EmbeddingProvider,
  model: string,
  dimensions: number,
): Promise<{
  symbolId: string;
  filePath: string;
  model: string;
  dimensions: number;
  vector: number[];
}> {
  const resp = await provider.embedBatch(
    [{ symbolId: `${MEMORY_SYMBOL_PREFIX}${entry.id}`, text: entry.content, filePath: "<memory>" }],
    { model, expectedDimensions: dimensions },
  );
  return {
    symbolId: `${MEMORY_SYMBOL_PREFIX}${entry.id}`,
    filePath: "<memory>",
    model,
    dimensions,
    vector: resp[0]!.embedding,
  };
}
