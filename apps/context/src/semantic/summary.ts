import { createHash } from "node:crypto";
import type { Config, Symbol, SemanticPhase } from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";
import {
  type SummarizeEligibleSymbolsInput,
  type SummarizeEligibleSymbolsResult,
  type SummaryCacheEntry,
  type SummaryProvider,
  type SummaryProviderRequest,
  type SummaryProviderResponse,
  SemanticDomainError,
  type SemanticDomainErrorCode,
} from "./contracts.js";

interface SummaryErrorMappingContext {
  provider: "anthropic";
  phase: SemanticPhase;
}

interface AnthropicSummaryProviderOptions {
  model: string;
  maxTokens: number;
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_SUMMARY_BATCH_SIZE = 25;

function sourceHash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function chunk<T>(items: T[], chunkSize: number): T[][] {
  const size = Math.max(1, chunkSize);
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function normalizeSummaryText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function mapSummaryStatusErrorCode(
  status: number,
): { code: SemanticDomainErrorCode; retryable: boolean } {
  if (status === 401 || status === 403) {
    return {
      code: "SEMANTIC_ANTHROPIC_AUTH",
      retryable: false,
    };
  }

  if (status === 429) {
    return {
      code: "SEMANTIC_ANTHROPIC_RATE_LIMIT",
      retryable: true,
    };
  }

  if (status >= 500) {
    return {
      code: "SEMANTIC_ANTHROPIC_PROVIDER_UNAVAILABLE",
      retryable: true,
    };
  }

  return {
    code: "SEMANTIC_ANTHROPIC_PROVIDER_UNAVAILABLE",
    retryable: false,
  };
}

export function mapSummaryProviderError(
  error: unknown,
  context: SummaryErrorMappingContext,
): SemanticDomainError {
  if (error instanceof SemanticDomainError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const lowered = message.toLowerCase();

  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : undefined;

  if (
    lowered.includes("anthropic_api_key") ||
    lowered.includes("api key") ||
    lowered.includes("missing key")
  ) {
    return new SemanticDomainError("Anthropic API key is not configured", {
      code: "SEMANTIC_ANTHROPIC_MISSING_KEY",
      provider: context.provider,
      phase: context.phase,
      retryable: false,
      status,
      cause: error,
    });
  }

  if (
    status === 401 ||
    status === 403 ||
    lowered.includes("invalid api key") ||
    lowered.includes("authentication")
  ) {
    return new SemanticDomainError("Anthropic authentication failed", {
      code: "SEMANTIC_ANTHROPIC_AUTH",
      provider: context.provider,
      phase: context.phase,
      retryable: false,
      status,
      cause: error,
    });
  }

  if (status === 429 || lowered.includes("rate limit")) {
    return new SemanticDomainError("Anthropic rate limit exceeded", {
      code: "SEMANTIC_ANTHROPIC_RATE_LIMIT",
      provider: context.provider,
      phase: context.phase,
      retryable: true,
      status,
      cause: error,
    });
  }

  if (
    (typeof status === "number" && status >= 500) ||
    lowered.includes("unavailable") ||
    lowered.includes("timeout") ||
    lowered.includes("econn") ||
    lowered.includes("enotfound")
  ) {
    return new SemanticDomainError("Anthropic provider unavailable", {
      code: "SEMANTIC_ANTHROPIC_PROVIDER_UNAVAILABLE",
      provider: context.provider,
      phase: context.phase,
      retryable: true,
      status,
      cause: error,
    });
  }

  return new SemanticDomainError("Anthropic summary request failed", {
    code: "SEMANTIC_ANTHROPIC_PROVIDER_UNAVAILABLE",
    provider: context.provider,
    phase: context.phase,
    retryable: false,
    status,
    cause: error,
  });
}

export function createAnthropicSummaryProvider(
  options: AnthropicSummaryProviderOptions,
): SummaryProvider {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async summarizeBatch(items: SummaryProviderRequest[]): Promise<SummaryProviderResponse[]> {
      if (items.length === 0) {
        return [];
      }

      const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new SemanticDomainError("ANTHROPIC_API_KEY is not set", {
          code: "SEMANTIC_ANTHROPIC_MISSING_KEY",
          provider: "anthropic",
          phase: "summary",
          retryable: false,
        });
      }

      const endpoint = `${options.baseUrl ?? "https://api.anthropic.com"}/v1/messages`;

      const results: SummaryProviderResponse[] = [];
      for (const item of items) {
        const requestBody = {
          model: options.model,
          max_tokens: options.maxTokens,
          messages: [
            {
              role: "user",
              content:
                "Summarize the following code symbol in one concise sentence for semantic retrieval. " +
                "Return plain text only with no markdown.\n\n" +
                `Symbol: ${item.name}\n` +
                `Kind: ${item.kind}\n` +
                `File: ${item.filePath}\n` +
                `Signature: ${item.signature ?? "unknown"}\n` +
                `Docstring: ${item.docstring ?? "none"}\n` +
                `Source:\n${item.source}`,
            },
          ],
        };

        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const body = await response.text();
          const statusMapping = mapSummaryStatusErrorCode(response.status);
          throw new SemanticDomainError(
            `Anthropic summary request failed (${response.status}): ${body}`,
            {
              code: statusMapping.code,
              provider: "anthropic",
              phase: "summary",
              retryable: statusMapping.retryable,
              status: response.status,
            },
          );
        }

        const payload = (await response.json()) as {
          content?: Array<{ type?: string; text?: string }>;
        };

        const text =
          payload.content?.find((entry) => entry.type === "text")?.text ?? "";
        const normalized = normalizeSummaryText(text);
        results.push({
          symbolId: item.symbolId,
          summary: normalized || `Summary unavailable for ${item.name}`,
        });
      }

      return results;
    },
  };
}

function createDefaultSummaryProvider(): SummaryProvider {
  return createAnthropicSummaryProvider({
    model: DEFAULT_CONFIG.providers.anthropic.model,
    maxTokens: DEFAULT_CONFIG.providers.anthropic.maxTokens,
  });
}

export function createSummaryProviderFromConfig(config: Config): SummaryProvider {
  return createAnthropicSummaryProvider({
    model: config.providers.anthropic.model,
    maxTokens: config.providers.anthropic.maxTokens,
  });
}

export function shouldSummarizeSymbol(
  symbol: Symbol,
  summaryThreshold: number,
): boolean {
  if (!symbol.source.trim()) {
    return false;
  }

  const logicalLineCount =
    symbol.lineEnd >= symbol.lineStart
      ? symbol.lineEnd - symbol.lineStart + 1
      : symbol.source.split(/\r?\n/).length;

  return logicalLineCount > summaryThreshold;
}

export async function summarizeEligibleSymbols(
  input: SummarizeEligibleSymbolsInput,
): Promise<SummarizeEligibleSymbolsResult> {
  const cache = input.cache ?? new Map<string, SummaryCacheEntry>();
  const provider = input.provider ?? createDefaultSummaryProvider();
  const batchSize = input.batchSize ?? DEFAULT_SUMMARY_BATCH_SIZE;

  const summaries: SummarizeEligibleSymbolsResult["summaries"] = [];
  const queued: SummaryProviderRequest[] = [];
  const requestedSourceHashes = new Map<string, string>();

  let skipped = 0;
  let reusedFromCache = 0;

  for (const symbol of input.symbols) {
    if (!shouldSummarizeSymbol(symbol, input.summaryThreshold)) {
      skipped += 1;
      continue;
    }

    const currentHash = sourceHash(symbol.source);
    const cached = cache.get(symbol.id);

    if (cached && cached.sourceHash === currentHash) {
      summaries.push({
        symbolId: symbol.id,
        filePath: symbol.filePath,
        sourceHash: cached.sourceHash,
        summary: cached.summary,
        cached: true,
      });
      reusedFromCache += 1;
      continue;
    }

    queued.push({
      symbolId: symbol.id,
      name: symbol.name,
      kind: symbol.kind,
      signature: symbol.signature,
      docstring: symbol.docstring,
      source: symbol.source,
      filePath: symbol.filePath,
    });
    requestedSourceHashes.set(symbol.id, currentHash);
  }

  if (queued.length === 0) {
    return {
      summaries,
      generated: 0,
      reusedFromCache,
      skipped,
    };
  }

  const generatedRecords = new Map<string, SummarizeEligibleSymbolsResult["summaries"][number]>();

  for (const batch of chunk(queued, batchSize)) {
    let generated;
    try {
      generated = await provider.summarizeBatch(batch);
    } catch (error) {
      throw mapSummaryProviderError(error, {
        provider: "anthropic",
        phase: "summary",
      });
    }

    const batchById = new Map(generated.map((item) => [item.symbolId, item.summary]));

    for (const request of batch) {
      const summaryText = batchById.get(request.symbolId);
      if (!summaryText) {
        throw new SemanticDomainError(
          `Summary provider omitted symbol ${request.symbolId}`,
          {
            code: "SEMANTIC_ANTHROPIC_PROVIDER_UNAVAILABLE",
            provider: "anthropic",
            phase: "summary",
            retryable: false,
          },
        );
      }

      const normalized = normalizeSummaryText(summaryText);
      const hash = requestedSourceHashes.get(request.symbolId)!;
      const record = {
        symbolId: request.symbolId,
        filePath: request.filePath,
        sourceHash: hash,
        summary: normalized,
        cached: false,
      };

      generatedRecords.set(request.symbolId, record);
      cache.set(request.symbolId, {
        symbolId: request.symbolId,
        sourceHash: hash,
        summary: normalized,
      });
    }
  }

  // Keep output order deterministic relative to input symbol order.
  for (const symbol of input.symbols) {
    const generated = generatedRecords.get(symbol.id);
    if (generated) {
      summaries.push(generated);
    }
  }

  return {
    summaries,
    generated: generatedRecords.size,
    reusedFromCache,
    skipped,
  };
}
