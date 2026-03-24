/**
 * Combined retrieval type definitions for S04.
 *
 * Defines the result model, diagnostics envelope, and options
 * for the multi-strategy retrieval orchestrator.
 */

// ── Retrieval strategy ──

export type RetrievalStrategy = "structural" | "semantic" | "memory";

// ── Retrieval item ──

export interface RetrievalItem {
  /** Unique ID (symbol ID or memory ID) */
  id: string;
  /** Content text (source code or memory content) */
  content: string;
  /** Source location (e.g. "src/foo.ts:10-25") */
  source: string;
  /** Which strategy produced this item */
  provenance: RetrievalStrategy;
  /** Combined score after reranking */
  score: number;
  /** Estimated token count */
  estimatedTokens: number;
}

// ── Strategy status ──

export type StrategyStatus = "ok" | "skipped" | "failed";

export interface StrategyDiagnostic {
  status: StrategyStatus;
  hits: number;
  timeMs: number;
  error?: string;
}

// ── Diagnostics envelope ──

export interface RetrievalDiagnostics {
  perStrategy: Record<RetrievalStrategy, StrategyDiagnostic>;
  budgetUsed: number;
  budgetTotal: number;
  totalTimeMs: number;
}

// ── Combined result ──

export interface CombinedRetrievalResult {
  items: RetrievalItem[];
  diagnostics: RetrievalDiagnostics;
}

// ── Options ──

export interface RankingWeights {
  structural: number;
  semantic: number;
  recency: number;
  memory: number;
}

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  structural: 0.4,
  semantic: 0.3,
  recency: 0.15,
  memory: 0.15,
};

export interface CombinedRetrievalOptions {
  /** Token budget (default: 4000) */
  budget?: number;
  /** Max results per strategy before dedup (default: 20) */
  topK?: number;
  /** Custom ranking weights */
  weights?: Partial<RankingWeights>;
  /** Filter by symbol kind */
  kinds?: string[];
}
