import type { Symbol, SymbolKind, SemanticPhase } from "../types.js";

export type SemanticServiceProvider = "anthropic" | "openai";

export type SemanticDomainErrorCode =
  | "SEMANTIC_ANTHROPIC_MISSING_KEY"
  | "SEMANTIC_ANTHROPIC_AUTH"
  | "SEMANTIC_ANTHROPIC_RATE_LIMIT"
  | "SEMANTIC_ANTHROPIC_PROVIDER_UNAVAILABLE"
  | "SEMANTIC_OPENAI_MISSING_KEY"
  | "SEMANTIC_OPENAI_AUTH"
  | "SEMANTIC_OPENAI_RATE_LIMIT"
  | "SEMANTIC_OPENAI_PROVIDER_UNAVAILABLE";

export interface SemanticDomainErrorOptions {
  code: SemanticDomainErrorCode;
  provider: SemanticServiceProvider;
  phase: SemanticPhase;
  retryable: boolean;
  status?: number;
  partialWritesCommitted?: boolean;
  cause?: unknown;
}

export class SemanticDomainError extends Error {
  code: SemanticDomainErrorCode;
  provider: SemanticServiceProvider;
  phase: SemanticPhase;
  retryable: boolean;
  status?: number;
  partialWritesCommitted: boolean;

  constructor(message: string, options: SemanticDomainErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "SemanticDomainError";
    this.code = options.code;
    this.provider = options.provider;
    this.phase = options.phase;
    this.retryable = options.retryable;
    this.status = options.status;
    this.partialWritesCommitted = options.partialWritesCommitted ?? false;
  }
}

export interface SummaryProviderRequest {
  symbolId: string;
  name: string;
  kind: SymbolKind;
  signature: string | null;
  docstring: string | null;
  source: string;
  filePath: string;
}

export interface SummaryProviderResponse {
  symbolId: string;
  summary: string;
}

export interface SummaryProvider {
  summarizeBatch(
    items: SummaryProviderRequest[],
  ): Promise<SummaryProviderResponse[]>;
}

export interface SummaryCacheEntry {
  symbolId: string;
  sourceHash: string;
  summary: string;
}

export interface SymbolSummaryRecord extends SummaryCacheEntry {
  filePath: string;
  cached: boolean;
}

export interface SummarizeEligibleSymbolsInput {
  symbols: Symbol[];
  summaryThreshold: number;
  cache?: Map<string, SummaryCacheEntry>;
  provider?: SummaryProvider;
  batchSize?: number;
}

export interface SummarizeEligibleSymbolsResult {
  summaries: SymbolSummaryRecord[];
  generated: number;
  reusedFromCache: number;
  skipped: number;
}

export interface EmbeddingSourceSummary {
  symbolId: string;
  summary: string;
  filePath: string;
}

export interface EmbeddingProviderRequest {
  symbolId: string;
  text: string;
  filePath: string;
}

export interface EmbeddingProviderResponse {
  symbolId: string;
  embedding: number[];
}

export interface EmbeddingProvider {
  embedBatch(
    batch: EmbeddingProviderRequest[],
    context: { model: string; expectedDimensions: number },
  ): Promise<EmbeddingProviderResponse[]>;
}

export interface EmbeddingVectorRecord {
  symbolId: string;
  filePath: string;
  model: string;
  dimensions: number;
  vector: number[];
}

export interface EmbedSummariesBatchedInput {
  summaries: EmbeddingSourceSummary[];
  model: string;
  batchSize: number;
  expectedDimensions: number;
  provider?: EmbeddingProvider;
}

export interface EmbedSummariesBatchedResult {
  vectors: EmbeddingVectorRecord[];
  batchesProcessed: number;
}
