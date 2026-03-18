import { DEFAULT_CONFIG, type Config, type SemanticPhase } from "../types.js";
import {
  type EmbedSummariesBatchedInput,
  type EmbedSummariesBatchedResult,
  type EmbeddingProvider,
  type EmbeddingProviderRequest,
  type EmbeddingProviderResponse,
  SemanticDomainError,
  type SemanticDomainErrorCode,
} from "./contracts.js";

interface EmbeddingErrorMappingContext {
  provider: "openai";
  phase: SemanticPhase;
}

interface OpenAIEmbeddingProviderOptions {
  apiKey?: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function chunk<T>(items: T[], chunkSize: number): T[][] {
  const size = Math.max(1, chunkSize);
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function mapOpenAIStatusErrorCode(
  status: number,
): { code: SemanticDomainErrorCode; retryable: boolean } {
  if (status === 401 || status === 403) {
    return {
      code: "SEMANTIC_OPENAI_AUTH",
      retryable: false,
    };
  }

  if (status === 429) {
    return {
      code: "SEMANTIC_OPENAI_RATE_LIMIT",
      retryable: true,
    };
  }

  if (status >= 500) {
    return {
      code: "SEMANTIC_OPENAI_PROVIDER_UNAVAILABLE",
      retryable: true,
    };
  }

  return {
    code: "SEMANTIC_OPENAI_PROVIDER_UNAVAILABLE",
    retryable: false,
  };
}

export function mapEmbeddingProviderError(
  error: unknown,
  context: EmbeddingErrorMappingContext,
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
    lowered.includes("openai_api_key") ||
    lowered.includes("missing key") ||
    lowered.includes("api key")
  ) {
    return new SemanticDomainError("OpenAI API key is not configured", {
      code: "SEMANTIC_OPENAI_MISSING_KEY",
      provider: context.provider,
      phase: context.phase,
      retryable: false,
      status,
      cause: error,
      partialWritesCommitted: false,
    });
  }

  if (
    status === 401 ||
    status === 403 ||
    lowered.includes("invalid_api_key") ||
    lowered.includes("authentication")
  ) {
    return new SemanticDomainError("OpenAI authentication failed", {
      code: "SEMANTIC_OPENAI_AUTH",
      provider: context.provider,
      phase: context.phase,
      retryable: false,
      status,
      cause: error,
      partialWritesCommitted: false,
    });
  }

  if (status === 429 || lowered.includes("rate limit")) {
    return new SemanticDomainError("OpenAI rate limit exceeded", {
      code: "SEMANTIC_OPENAI_RATE_LIMIT",
      provider: context.provider,
      phase: context.phase,
      retryable: true,
      status,
      cause: error,
      partialWritesCommitted: false,
    });
  }

  if (
    (typeof status === "number" && status >= 500) ||
    lowered.includes("unavailable") ||
    lowered.includes("timeout") ||
    lowered.includes("econn") ||
    lowered.includes("enotfound")
  ) {
    return new SemanticDomainError("OpenAI provider unavailable", {
      code: "SEMANTIC_OPENAI_PROVIDER_UNAVAILABLE",
      provider: context.provider,
      phase: context.phase,
      retryable: true,
      status,
      cause: error,
      partialWritesCommitted: false,
    });
  }

  return new SemanticDomainError("OpenAI embedding request failed", {
    code: "SEMANTIC_OPENAI_PROVIDER_UNAVAILABLE",
    provider: context.provider,
    phase: context.phase,
    retryable: false,
    status,
    cause: error,
    partialWritesCommitted: false,
  });
}

export function createOpenAIEmbeddingProvider(
  options: OpenAIEmbeddingProviderOptions,
): EmbeddingProvider {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async embedBatch(
      batch: EmbeddingProviderRequest[],
      context: { model: string; expectedDimensions: number },
    ): Promise<EmbeddingProviderResponse[]> {
      if (batch.length === 0) {
        return [];
      }

      const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new SemanticDomainError("OPENAI_API_KEY is not set", {
          code: "SEMANTIC_OPENAI_MISSING_KEY",
          provider: "openai",
          phase: "embedding",
          retryable: false,
          partialWritesCommitted: false,
        });
      }

      const endpoint = `${options.baseUrl ?? "https://api.openai.com"}/v1/embeddings`;
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: context.model,
          input: batch.map((item) => item.text),
          encoding_format: "float",
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        const statusMapping = mapOpenAIStatusErrorCode(response.status);
        throw new SemanticDomainError(
          `OpenAI embedding request failed (${response.status}): ${body}`,
          {
            code: statusMapping.code,
            provider: "openai",
            phase: "embedding",
            retryable: statusMapping.retryable,
            status: response.status,
            partialWritesCommitted: false,
          },
        );
      }

      const payload = (await response.json()) as {
        data?: Array<{ index: number; embedding: number[] }>;
      };

      const output: EmbeddingProviderResponse[] = [];
      const byIndex = new Map<number, number[]>(
        (payload.data ?? []).map((entry) => [entry.index, entry.embedding]),
      );

      for (let i = 0; i < batch.length; i += 1) {
        const item = batch[i]!;
        const embedding = byIndex.get(i);
        if (!embedding) {
          throw new SemanticDomainError(
            `OpenAI response missing embedding at index ${i}`,
            {
              code: "SEMANTIC_OPENAI_PROVIDER_UNAVAILABLE",
              provider: "openai",
              phase: "embedding",
              retryable: false,
              partialWritesCommitted: false,
            },
          );
        }

        if (embedding.length !== context.expectedDimensions) {
          throw new SemanticDomainError(
            `OpenAI embedding dimensions mismatch for ${item.symbolId}: expected ${context.expectedDimensions}, received ${embedding.length}`,
            {
              code: "SEMANTIC_OPENAI_PROVIDER_UNAVAILABLE",
              provider: "openai",
              phase: "embedding",
              retryable: false,
              partialWritesCommitted: false,
            },
          );
        }

        output.push({
          symbolId: item.symbolId,
          embedding,
        });
      }

      return output;
    },
  };
}

function createDefaultEmbeddingProvider(model: string): EmbeddingProvider {
  return createOpenAIEmbeddingProvider({
    model,
  });
}

export function createEmbeddingProviderFromConfig(config: Config): EmbeddingProvider {
  return createOpenAIEmbeddingProvider({
    model: config.providers.openai.model,
  });
}

export async function embedSummariesBatched(
  input: EmbedSummariesBatchedInput,
): Promise<EmbedSummariesBatchedResult> {
  if (input.summaries.length === 0) {
    return {
      vectors: [],
      batchesProcessed: 0,
    };
  }

  const provider = input.provider ?? createDefaultEmbeddingProvider(input.model);
  const batches = chunk(input.summaries, input.batchSize);

  const vectors: EmbedSummariesBatchedResult["vectors"] = [];

  for (const batch of batches) {
    const providerInput: EmbeddingProviderRequest[] = batch.map((entry) => ({
      symbolId: entry.symbolId,
      text: entry.summary,
      filePath: entry.filePath,
    }));

    let embeddedBatch: EmbeddingProviderResponse[];
    try {
      embeddedBatch = await provider.embedBatch(providerInput, {
        model: input.model,
        expectedDimensions: input.expectedDimensions,
      });
    } catch (error) {
      const mapped = mapEmbeddingProviderError(error, {
        provider: "openai",
        phase: "embedding",
      });
      mapped.partialWritesCommitted = false;
      throw mapped;
    }

    const byId = new Map(
      embeddedBatch.map((entry) => [entry.symbolId, entry.embedding]),
    );

    for (const requested of providerInput) {
      const embedding = byId.get(requested.symbolId);
      if (!embedding) {
        throw new SemanticDomainError(
          `Embedding provider omitted symbol ${requested.symbolId}`,
          {
            code: "SEMANTIC_OPENAI_PROVIDER_UNAVAILABLE",
            provider: "openai",
            phase: "embedding",
            retryable: false,
            partialWritesCommitted: false,
          },
        );
      }

      if (embedding.length !== input.expectedDimensions) {
        throw new SemanticDomainError(
          `Embedding dimensions mismatch for ${requested.symbolId}: expected ${input.expectedDimensions}, received ${embedding.length}`,
          {
            code: "SEMANTIC_OPENAI_PROVIDER_UNAVAILABLE",
            provider: "openai",
            phase: "embedding",
            retryable: false,
            partialWritesCommitted: false,
          },
        );
      }

      vectors.push({
        symbolId: requested.symbolId,
        filePath: requested.filePath,
        model: input.model,
        dimensions: input.expectedDimensions,
        vector: embedding,
      });
    }
  }

  return {
    vectors,
    batchesProcessed: batches.length,
  };
}

export function getDefaultEmbeddingModel(): string {
  return DEFAULT_CONFIG.providers.openai.model;
}
