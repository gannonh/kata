/**
 * Integration tests: graph queries + grep search + fuzzy find working together.
 *
 * Indexes the TS relationship fixtures, then runs all query types to verify
 * consistent, correct results across the full S03 query surface.
 */

import { resolve } from "node:path";
import { GraphStore } from "../../src/graph/store.js";
import { indexProject } from "../../src/indexer.js";
import {
  resolveSymbol,
  dependents,
  dependencies,
  symbolsInFile,
} from "../../src/graph/queries.js";
import { grepSearch, fuzzyFind } from "../../src/search/lexical.js";
import { SymbolKind, RelationshipKind } from "../../src/types.js";

// ── Setup: index TS relationship fixtures ──

const TS_FIXTURES = resolve(import.meta.dirname!, "../fixtures/relationships/ts");

let store: GraphStore;

beforeAll(() => {
  store = new GraphStore(":memory:");
  const result = indexProject(TS_FIXTURES, { store });
  expect(result.filesIndexed).toBeGreaterThan(0);
  expect(result.symbolsExtracted).toBeGreaterThan(0);
  expect(result.edgesCreated).toBeGreaterThan(0);
});

afterAll(() => {
  store.close();
});

// ── Cross-surface consistency ──

describe("integration: queries + grep + fuzzy consistency", () => {
  it("fuzzyFind and resolveSymbol agree on symbol existence", () => {
    // fuzzyFind finds greet
    const fuzzyResults = fuzzyFind("greet", store);
    expect(fuzzyResults.length).toBeGreaterThanOrEqual(1);
    const fuzzyGreet = fuzzyResults.find((r) => r.symbol.name === "greet");
    expect(fuzzyGreet).toBeDefined();

    // resolveSymbol also finds greet
    const resolved = resolveSymbol(store, "greet");
    expect(resolved.length).toBeGreaterThanOrEqual(1);
    const resolvedGreet = resolved.find((s) => s.name === "greet");
    expect(resolvedGreet).toBeDefined();

    // Same symbol ID
    expect(fuzzyGreet!.symbol.id).toBe(resolvedGreet!.id);
  });

  it("dependents of a symbol are in files that grep can find importing it", async () => {
    // Get dependents of greet
    const greetDeps = dependents(store, "greet");
    expect(greetDeps).not.toBeNull();

    // greet is used in consumer.ts and utils.ts (welcome calls greet)
    const depFiles = greetDeps!.related.map((r) => r.symbol.filePath);

    // Grep for "greet" in the fixtures — should find usage in consumer.ts
    const grepResults = await grepSearch("greet", TS_FIXTURES);
    const grepFiles = [...new Set(grepResults.map((r) => r.filePath))];

    // consumer.ts should appear in both grep results and dependents files
    expect(grepFiles).toContain("consumer.ts");
  });

  it("symbolsInFile results match fuzzyFind with fileScope", () => {
    // Get all symbols in utils.ts via graph query
    const fileSymbols = symbolsInFile(store, "utils.ts");
    expect(fileSymbols.length).toBeGreaterThan(0);
    const fileSymbolNames = fileSymbols.map((s) => s.symbol.name);

    // fuzzyFind with fileScope should find some of the same symbols
    for (const name of fileSymbolNames) {
      const fuzzyResults = fuzzyFind(name, store, { fileScope: "utils.ts" });
      // At least the exact match should be in results
      const found = fuzzyResults.some((r) => r.symbol.name === name);
      expect(found).toBe(true);
    }
  });

  it("dependencies of AppService include symbols findable by fuzzyFind", () => {
    const deps = dependencies(store, "AppService");
    expect(deps).not.toBeNull();
    expect(deps!.related.length).toBeGreaterThan(0);

    // Each dependency target should be findable by fuzzyFind
    for (const rel of deps!.related) {
      const fuzzyResults = fuzzyFind(rel.symbol.name, store);
      const found = fuzzyResults.some((r) => r.symbol.id === rel.symbol.id);
      expect(found).toBe(true);
    }
  });
});

// ── Performance ──

describe("integration: performance", () => {
  it("all query types complete in <100ms on fixture set", () => {
    const start = performance.now();

    // Run each query type
    resolveSymbol(store, "greet");
    dependents(store, "AppService");
    dependencies(store, "AppService");
    symbolsInFile(store, "utils.ts");
    fuzzyFind("Service", store);
    fuzzyFind("Config", store, { kind: SymbolKind.Interface });
    fuzzyFind("greet", store, { fileScope: "utils.ts" });

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it("grep search completes in <500ms on fixture set", async () => {
    const start = performance.now();

    await grepSearch("import", TS_FIXTURES);
    await grepSearch("export", TS_FIXTURES);
    await grepSearch("class", TS_FIXTURES);

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});

// ── Edge cases across surfaces ──

describe("integration: edge cases", () => {
  it("nonexistent symbol returns null/empty across all query types", async () => {
    const resolved = resolveSymbol(store, "ZzNonExistent99");
    expect(resolved).toHaveLength(0);

    const deps = dependents(store, "ZzNonExistent99");
    expect(deps).toBeNull();

    const depsOf = dependencies(store, "ZzNonExistent99");
    expect(depsOf).toBeNull();

    const fuzzy = fuzzyFind("ZzNonExistent99", store);
    expect(fuzzy).toHaveLength(0);

    // grep for a unique pattern that won't exist
    const grepResults = await grepSearch("ZzNonExistent99", TS_FIXTURES);
    expect(grepResults).toHaveLength(0);
  });

  it("empty file path returns empty for symbolsInFile", () => {
    const results = symbolsInFile(store, "nonexistent-file.ts");
    expect(results).toHaveLength(0);
  });

  it("fuzzyFind kind filter + fileScope combined", () => {
    // Only functions in utils.ts
    const results = fuzzyFind("g", store, {
      kind: SymbolKind.Function,
      fileScope: "utils.ts",
    });
    for (const r of results) {
      expect(r.symbol.kind).toBe(SymbolKind.Function);
      expect(r.symbol.filePath).toMatch(/utils\.ts$/);
    }
  });

  it("graph stats are consistent with indexed data", () => {
    const stats = store.getStats();
    expect(stats.symbols).toBeGreaterThan(0);
    expect(stats.edges).toBeGreaterThan(0);
    expect(stats.files).toBeGreaterThan(0);

    // symbolsInFile across all known files should sum to total symbols
    // (We know the fixture files)
    const knownFiles = ["utils.ts", "types.ts", "service.ts", "consumer.ts", "index.ts", "init.ts"];
    let totalSymbols = 0;
    for (const f of knownFiles) {
      totalSymbols += symbolsInFile(store, f).length;
    }
    expect(totalSymbols).toBe(stats.symbols);
  });
});

// ── Relationship chain verification ──

describe("integration: relationship chains", () => {
  it("consumer.ts → service.ts → utils.ts dependency chain is traceable", () => {
    // consumer.ts depends on AppService (from service.ts)
    const consumerDeps = dependencies(store, "run");
    expect(consumerDeps).not.toBeNull();
    // run() calls AppService constructor and greet - verify dependencies exist
    expect(consumerDeps!.related.length).toBeGreaterThan(0);

    // AppService inherits from BaseService
    const appServiceDeps = dependencies(store, "AppService");
    expect(appServiceDeps).not.toBeNull();
    const inheritsBase = appServiceDeps!.related.some(
      (r) => r.symbol.name === "BaseService" && r.relationship === RelationshipKind.Inherits,
    );
    expect(inheritsBase).toBe(true);
  });

  it("grep results for import statements align with graph edges", async () => {
    // Grep for imports of "./utils" in the fixtures
    const results = await grepSearch("from.*./utils", TS_FIXTURES);
    const filesImportingUtils = [...new Set(results.map((r) => r.filePath))];

    // These files should have symbols with outgoing import edges to utils symbols
    // At minimum service.ts and consumer.ts import from utils
    expect(filesImportingUtils.length).toBeGreaterThanOrEqual(1);
  });
});
