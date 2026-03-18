import { createHash } from "node:crypto";
import { SymbolKind } from "../../src/types.js";
import type { Symbol } from "../../src/types.js";

function makeSymbol(overrides: Partial<Symbol> & { id: string; name: string; source: string }): Symbol {
  return {
    id: overrides.id,
    name: overrides.name,
    kind: overrides.kind ?? SymbolKind.Function,
    filePath: overrides.filePath ?? "src/auth.ts",
    lineStart: overrides.lineStart ?? 1,
    lineEnd: overrides.lineEnd ?? 12,
    signature: overrides.signature ?? `function ${overrides.name}(): void`,
    docstring: overrides.docstring ?? null,
    source: overrides.source,
    exported: overrides.exported ?? true,
    summary: overrides.summary,
    lastIndexedAt: overrides.lastIndexedAt,
    gitSha: overrides.gitSha,
  };
}

function sourceHash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

async function loadSummaryModule(): Promise<Record<string, any> | null> {
  try {
    return await import("../../src/semantic/summary.js");
  } catch {
    return null;
  }
}

describe("summary pipeline contract (T01 red-first)", () => {
  it("exports summary eligibility + orchestration functions", async () => {
    const mod = await loadSummaryModule();
    expect(mod).not.toBeNull();
    expect(typeof mod!.shouldSummarizeSymbol).toBe("function");
    expect(typeof mod!.summarizeEligibleSymbols).toBe("function");
  });

  it("skips symbols at or below the summary threshold", async () => {
    const mod = await loadSummaryModule();
    expect(mod).not.toBeNull();

    const shortSymbol = makeSymbol({
      id: "short-1",
      name: "smallHelper",
      source: `export function smallHelper() {\n  return true;\n}`,
      lineStart: 1,
      lineEnd: 2,
    });

    const shouldSummarize = mod!.shouldSummarizeSymbol(shortSymbol, 5);
    expect(shouldSummarize).toBe(false);
  });

  it("reuses cached summary when source hash is unchanged", async () => {
    const mod = await loadSummaryModule();
    expect(mod).not.toBeNull();

    const symbol = makeSymbol({
      id: "sym-cache-1",
      name: "parseAuthHeader",
      source: `export function parseAuthHeader(header: string | undefined) {\n  if (!header) return null;\n  return header;\n}`,
    });

    const provider = {
      summarizeBatch: vi.fn(async () => {
        throw new Error("provider should not be called when cache is valid");
      }),
    };

    const cachedSummary = {
      symbolId: symbol.id,
      sourceHash: sourceHash(symbol.source),
      summary: "Parses and normalizes auth headers.",
    };

    const result = await mod!.summarizeEligibleSymbols({
      symbols: [symbol],
      summaryThreshold: 3,
      cache: new Map([[symbol.id, cachedSummary]]),
      provider,
    });

    expect(provider.summarizeBatch).toHaveBeenCalledTimes(0);
    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0]).toMatchObject({
      symbolId: symbol.id,
      summary: "Parses and normalizes auth headers.",
      cached: true,
    });
  });

  it("invalidates cache and regenerates summary when source changes", async () => {
    const mod = await loadSummaryModule();
    expect(mod).not.toBeNull();

    const symbol = makeSymbol({
      id: "sym-cache-2",
      name: "routeProjectRequest",
      source: `export function routeProjectRequest(input: { projectId: string }) {\n  if (!input.projectId) return \"forbidden\";\n  return \"ok\";\n}`,
    });

    const provider = {
      summarizeBatch: vi.fn(async (items: Array<{ symbolId: string }>) =>
        items.map((item) => ({
          symbolId: item.symbolId,
          summary: "Routes project requests after validating access.",
        })),
      ),
    };

    const staleCache = {
      symbolId: symbol.id,
      sourceHash: sourceHash("old source"),
      summary: "Old stale summary",
    };

    const result = await mod!.summarizeEligibleSymbols({
      symbols: [symbol],
      summaryThreshold: 3,
      cache: new Map([[symbol.id, staleCache]]),
      provider,
    });

    expect(provider.summarizeBatch).toHaveBeenCalledTimes(1);
    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0]).toMatchObject({
      symbolId: symbol.id,
      summary: "Routes project requests after validating access.",
      cached: false,
    });
    expect(result.summaries[0].sourceHash).toBe(sourceHash(symbol.source));
  });
});
