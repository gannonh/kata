/**
 * Combined retrieval orchestrator — runs structural, semantic, and memory
 * strategies in parallel, deduplicates, reranks, and assembles a budgeted
 * context bundle.
 *
 * Slice: S04 — T03
 */

import type { GraphStore } from "../graph/store.js";
import type { Config } from "../types.js";
import type { MemoryStore } from "../memory/store.js";
import type { EmbeddingProvider } from "../semantic/contracts.js";
import { dependents } from "../graph/queries.js";
import { semanticSearch } from "../search/semantic.js";
import { recallMemories } from "../memory/recall.js";
import { rerankResults } from "./reranker.js";
import { assembleBudget, estimateTokens } from "./budget.js";
import type {
  CombinedRetrievalResult,
  CombinedRetrievalOptions,
  RetrievalItem,
  RetrievalStrategy,
  StrategyDiagnostic,
  RetrievalDiagnostics,
} from "./types.js";
import { DEFAULT_RANKING_WEIGHTS } from "./types.js";
import type { SymbolKind } from "../types.js";

const DEFAULT_BUDGET = 4000;
const DEFAULT_TOP_K = 20;

export interface CombinedRetrievalInput {
  query: string;
  store: GraphStore;
  memoryStore?: MemoryStore;
  config: Config;
  embeddingProvider?: EmbeddingProvider;
  options?: CombinedRetrievalOptions;
}

/**
 * Run combined retrieval: structural + semantic + memory in parallel.
 */
export async function combinedRetrieval(
  input: CombinedRetrievalInput,
): Promise<CombinedRetrievalResult> {
  const totalStart = performance.now();
  const { query, store, memoryStore, config, embeddingProvider, options } = input;
  const budget = options?.budget ?? DEFAULT_BUDGET;
  const topK = options?.topK ?? DEFAULT_TOP_K;
  const weights = { ...DEFAULT_RANKING_WEIGHTS, ...options?.weights };

  const kinds = options?.kinds && options.kinds.length > 0 ? options.kinds : undefined;

  // Run all three strategies in parallel
  const [structuralResult, semanticResult, memoryResult] = await Promise.allSettled([
    runStructural(query, store, topK, kinds),
    runSemantic(query, store, config, topK, embeddingProvider, kinds),
    runMemory(query, memoryStore, embeddingProvider, store, topK),
  ]);

  // Collect items and diagnostics
  const allItems: RetrievalItem[] = [];
  const perStrategy: Record<RetrievalStrategy, StrategyDiagnostic> = {
    structural: extractDiagnostic(structuralResult),
    semantic: extractDiagnostic(semanticResult),
    memory: extractDiagnostic(memoryResult),
  };

  if (structuralResult.status === "fulfilled") {
    allItems.push(...structuralResult.value.items);
    perStrategy.structural.hits = structuralResult.value.items.length;
  }
  if (semanticResult.status === "fulfilled") {
    allItems.push(...semanticResult.value.items);
    perStrategy.semantic.hits = semanticResult.value.items.length;
  }
  if (memoryResult.status === "fulfilled") {
    allItems.push(...memoryResult.value.items);
    perStrategy.memory.hits = memoryResult.value.items.length;
  }

  // Deduplicate by ID (keep highest-scoring)
  const deduped = deduplicateById(allItems);

  // Rerank
  const reranked = rerankResults(deduped, weights);

  // Budget assembly
  const assembled = assembleBudget(reranked, budget);

  const totalTimeMs = Math.round(performance.now() - totalStart);

  const diagnostics: RetrievalDiagnostics = {
    perStrategy,
    budgetUsed: assembled.budgetUsed,
    budgetTotal: assembled.budgetTotal,
    totalTimeMs,
  };

  return {
    items: assembled.items,
    diagnostics,
  };
}

// ── Strategy runners ──

interface StrategyResult {
  items: RetrievalItem[];
  timeMs: number;
}

async function runStructural(
  query: string,
  store: GraphStore,
  topK: number,
  kinds?: SymbolKind[],
): Promise<StrategyResult> {
  const start = performance.now();
  const items: RetrievalItem[] = [];

  // FTS match query to find relevant symbols; apply kind filter when provided
  // ftsSearch accepts a single kind — run once per kind when filtering, or unfiltered otherwise
  let matches;
  if (kinds && kinds.length === 1) {
    matches = store.ftsSearch(query, { limit: topK, kind: kinds[0] });
  } else {
    matches = store.ftsSearch(query, { limit: topK });
  }

  // Post-filter when multiple kinds are requested
  if (kinds && kinds.length > 1) {
    const kindSet = new Set<string>(kinds);
    matches = matches.filter((s) => kindSet.has(s.kind));
  }

  for (const sym of matches) {
    items.push({
      id: sym.id,
      content: sym.source,
      source: `${sym.filePath}:${sym.lineStart}-${sym.lineEnd}`,
      provenance: "structural",
      score: 1.0, // raw score, reranker will normalize
      estimatedTokens: estimateTokens(sym.source),
      kind: sym.kind,
    });

    // Also include direct dependents/dependencies for context
    const deps = dependents(store, sym.name);
    if (deps) {
      for (const dep of deps.related.slice(0, 3)) {
        if (!items.some((i) => i.id === dep.symbol.id)) {
          items.push({
            id: dep.symbol.id,
            content: dep.symbol.source,
            source: `${dep.symbol.filePath}:${dep.symbol.lineStart}-${dep.symbol.lineEnd}`,
            provenance: "structural",
            score: 0.5,
            estimatedTokens: estimateTokens(dep.symbol.source),
            kind: dep.symbol.kind,
          });
        }
      }
    }
  }

  return { items: items.slice(0, topK), timeMs: Math.round(performance.now() - start) };
}

async function runSemantic(
  query: string,
  store: GraphStore,
  config: Config,
  topK: number,
  provider?: EmbeddingProvider,
  kinds?: SymbolKind[],
): Promise<StrategyResult> {
  const start = performance.now();

  // Semantic search may fail (no API key, empty index) — let errors propagate
  // so extractDiagnostic() records status: "failed" correctly.
  const results = await semanticSearch(query, store, config, {
    topK,
    provider,
  });

  let filtered = results;
  if (kinds && kinds.length > 0) {
    const kindSet = new Set<string>(kinds);
    filtered = results.filter((r) => kindSet.has(r.symbol.kind));
  }

  const items: RetrievalItem[] = filtered.map((r) => ({
    id: r.symbol.id,
    content: r.symbol.source,
    source: `${r.symbol.filePath}:${r.symbol.lineStart}-${r.symbol.lineEnd}`,
    provenance: "semantic" as const,
    score: r.score,
    estimatedTokens: estimateTokens(r.symbol.source),
    kind: r.symbol.kind,
  }));

  return { items, timeMs: Math.round(performance.now() - start) };
}

async function runMemory(
  query: string,
  memoryStore?: MemoryStore,
  provider?: EmbeddingProvider,
  graphStore?: GraphStore,
  topK?: number,
): Promise<StrategyResult> {
  const start = performance.now();

  if (!memoryStore) {
    return { items: [], timeMs: 0 };
  }

  // Let unexpected errors from recallMemories propagate so extractDiagnostic()
  // can record status: "failed". The only silent-skip is when memoryStore is
  // absent (handled above).
  const results = await recallMemories({
    query,
    store: memoryStore,
    embeddingProvider: provider,
    graphStore,
    topK,
  });

  const items: RetrievalItem[] = results.map((r) => ({
    id: r.memory.id,
    content: r.memory.content,
    source: `memory:${r.memory.id}`,
    provenance: "memory" as const,
    score: r.similarity,
    estimatedTokens: estimateTokens(r.memory.content),
  }));

  return { items, timeMs: Math.round(performance.now() - start) };
}

// ── Helpers ──

function extractDiagnostic(
  result: PromiseSettledResult<StrategyResult>,
): StrategyDiagnostic {
  if (result.status === "fulfilled") {
    return {
      status: result.value.items.length === 0 && result.value.timeMs === 0 ? "skipped" : "ok",
      hits: result.value.items.length,
      timeMs: result.value.timeMs,
    };
  }
  return {
    status: "failed",
    hits: 0,
    timeMs: 0,
    error: result.reason instanceof Error ? result.reason.message : String(result.reason),
  };
}

function deduplicateById(items: RetrievalItem[]): RetrievalItem[] {
  const seen = new Map<string, RetrievalItem>();
  for (const item of items) {
    const existing = seen.get(item.id);
    if (!existing || item.score > existing.score) {
      seen.set(item.id, item);
    }
  }
  return [...seen.values()];
}
