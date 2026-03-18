async function loadEmbeddingModule(): Promise<Record<string, any> | null> {
  try {
    return await import("../../src/semantic/embedding.js");
  } catch {
    return null;
  }
}

describe("embedding pipeline contract (T01 red-first)", () => {
  it("exports batch embedding orchestrator + error mapper", async () => {
    const mod = await loadEmbeddingModule();
    expect(mod).not.toBeNull();
    expect(typeof mod!.embedSummariesBatched).toBe("function");
    expect(typeof mod!.mapEmbeddingProviderError).toBe("function");
  });

  it("batches embedding requests and keeps model/dimension metadata stable", async () => {
    const mod = await loadEmbeddingModule();
    expect(mod).not.toBeNull();

    const provider = {
      embedBatch: vi.fn(async (batch: Array<{ symbolId: string }>) =>
        batch.map((item, index) => ({
          symbolId: item.symbolId,
          embedding: [index + 0.1, index + 0.2, index + 0.3, index + 0.4],
        })),
      ),
    };

    const summaries = [
      { symbolId: "sym-1", summary: "Summary 1", filePath: "src/auth.ts" },
      { symbolId: "sym-2", summary: "Summary 2", filePath: "src/auth.ts" },
      { symbolId: "sym-3", summary: "Summary 3", filePath: "src/router.ts" },
      { symbolId: "sym-4", summary: "Summary 4", filePath: "src/router.ts" },
      { symbolId: "sym-5", summary: "Summary 5", filePath: "src/router.ts" },
    ];

    const result = await mod!.embedSummariesBatched({
      summaries,
      model: "text-embedding-3-small",
      batchSize: 2,
      expectedDimensions: 4,
      provider,
    });

    expect(provider.embedBatch).toHaveBeenCalledTimes(3);
    expect(result.vectors).toHaveLength(5);
    expect(result.vectors[0]).toMatchObject({
      symbolId: "sym-1",
      model: "text-embedding-3-small",
      dimensions: 4,
    });
  });

  it("maps missing-key/auth/rate-limit/provider failures to stable semantic codes", async () => {
    const mod = await loadEmbeddingModule();
    expect(mod).not.toBeNull();

    const missingKeyError = mod!.mapEmbeddingProviderError(
      new Error("OPENAI_API_KEY is not set"),
      { provider: "openai", phase: "embedding" },
    );
    expect(missingKeyError).toMatchObject({
      code: "SEMANTIC_OPENAI_MISSING_KEY",
      phase: "embedding",
      retryable: false,
    });

    const authError = mod!.mapEmbeddingProviderError(
      Object.assign(new Error("401 invalid_api_key"), { status: 401 }),
      { provider: "openai", phase: "embedding" },
    );
    expect(authError).toMatchObject({
      code: "SEMANTIC_OPENAI_AUTH",
      retryable: false,
    });

    const rateLimitError = mod!.mapEmbeddingProviderError(
      Object.assign(new Error("429 rate limit exceeded"), { status: 429 }),
      { provider: "openai", phase: "embedding" },
    );
    expect(rateLimitError).toMatchObject({
      code: "SEMANTIC_OPENAI_RATE_LIMIT",
      retryable: true,
    });

    const providerDown = mod!.mapEmbeddingProviderError(
      Object.assign(new Error("503 upstream unavailable"), { status: 503 }),
      { provider: "openai", phase: "embedding" },
    );
    expect(providerDown).toMatchObject({
      code: "SEMANTIC_OPENAI_PROVIDER_UNAVAILABLE",
      retryable: true,
    });
  });

  it("fails the entire write set on partial batch errors (no partial commits)", async () => {
    const mod = await loadEmbeddingModule();
    expect(mod).not.toBeNull();

    const provider = {
      embedBatch: vi
        .fn()
        .mockResolvedValueOnce([
          { symbolId: "sym-1", embedding: [0.1, 0.2, 0.3, 0.4] },
          { symbolId: "sym-2", embedding: [0.2, 0.3, 0.4, 0.5] },
        ])
        .mockRejectedValueOnce(Object.assign(new Error("429 rate limit"), { status: 429 })),
    };

    await expect(
      mod!.embedSummariesBatched({
        summaries: [
          { symbolId: "sym-1", summary: "s1", filePath: "src/a.ts" },
          { symbolId: "sym-2", summary: "s2", filePath: "src/a.ts" },
          { symbolId: "sym-3", summary: "s3", filePath: "src/b.ts" },
        ],
        model: "text-embedding-3-small",
        batchSize: 2,
        expectedDimensions: 4,
        provider,
      }),
    ).rejects.toMatchObject({
      code: "SEMANTIC_OPENAI_RATE_LIMIT",
      phase: "embedding",
      retryable: true,
      partialWritesCommitted: false,
    });
  });
});
