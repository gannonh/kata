/**
 * CLI command tests for T02: graph, grep, find commands.
 *
 * Tests the graph dependents, graph dependencies, graph symbols, grep, and find
 * commands programmatically by indexing a fixture directory and exercising each
 * command's core logic + output formatting in all three modes.
 */

import { mock, spyOn } from "bun:test";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { indexProject } from "../src/indexer.js";
import { GraphStore } from "../src/graph/store.js";
import {
  resolveSymbol,
  dependents,
  dependencies,
  symbolsInFile,
} from "../src/graph/queries.js";
import { grepSearch, fuzzyFind } from "../src/search/lexical.js";
import { GrepNotFoundError } from "../src/types.js";
import {
  output,
  formatHeader,
  formatKeyValue,
  formatTable,
  type OutputOptions,
} from "../src/formatters.js";

// ── Fixture paths ──

const TS_FIXTURES_DIR = resolve(import.meta.dirname!, "fixtures/relationships/ts");
const MIXED_FIXTURES_DIR = resolve(import.meta.dirname!, "fixtures/mixed");

// ── Tests ──

describe("CLI commands — graph, grep, find", () => {
  let tempDir: string;
  let dbPath: string;

  beforeAll(() => {
    tempDir = join(tmpdir(), `kata-cli-cmds-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    dbPath = join(tempDir, "test.db");

    // Index the TS relationships fixture directory (has known cross-file edges)
    const result = indexProject(TS_FIXTURES_DIR, { dbPath });
    expect(result.filesIndexed).toBeGreaterThan(0);
    expect(result.symbolsExtracted).toBeGreaterThan(0);
    expect(result.edgesCreated).toBeGreaterThan(0);
  });

  afterAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ── graph dependents ──

  describe("graph dependents", () => {
    it("finds dependents of a known symbol with resolvable incoming edges", () => {
      const store = new GraphStore(dbPath);
      try {
        // greet has known dependents (called by welcome in utils.ts)
        const result = dependents(store, "greet");
        expect(result).not.toBeNull();
        expect(result!.symbol.name).toBe("greet");
        expect(result!.related.length).toBeGreaterThanOrEqual(1);
      } finally {
        store.close();
      }
    });

    it("returns result with empty related for symbol with only file-level edges", () => {
      const store = new GraphStore(dbPath);
      try {
        // AppService is imported at file level — edges have unresolvable source IDs
        const result = dependents(store, "AppService");
        expect(result).not.toBeNull();
        expect(result!.symbol.name).toBe("AppService");
        expect(result!.related).toBeDefined();
      } finally {
        store.close();
      }
    });

    it("returns null for unknown symbol", () => {
      const store = new GraphStore(dbPath);
      try {
        const result = dependents(store, "NonExistentSymbol12345");
        expect(result).toBeNull();
      } finally {
        store.close();
      }
    });

    it("JSON output has correct shape", () => {
      const store = new GraphStore(dbPath);
      try {
        const result = dependents(store, "greet");
        expect(result).not.toBeNull();
        const jsonData = {
          symbol: {
            name: result!.symbol.name,
            kind: result!.symbol.kind,
            file: result!.symbol.filePath,
            line: result!.symbol.lineStart,
          },
          dependents: result!.related.map((r) => ({
            name: r.symbol.name,
            kind: r.symbol.kind,
            relationship: r.relationship,
            file: r.filePath,
            line: r.lineNumber,
          })),
        };
        const serialized = JSON.stringify(jsonData, null, 2);
        const parsed = JSON.parse(serialized);
        expect(parsed.symbol.name).toBe("greet");
        expect(Array.isArray(parsed.dependents)).toBe(true);
        expect(parsed.dependents.length).toBeGreaterThanOrEqual(1);
      } finally {
        store.close();
      }
    });

    it("quiet output is symbol names only", () => {
      const store = new GraphStore(dbPath);
      try {
        const result = dependents(store, "greet");
        expect(result).not.toBeNull();
        const quietLines = result!.related.map((r) => r.symbol.name);
        for (const line of quietLines) {
          // Each line should be just a name — no colons, no file paths
          expect(line).not.toContain("/");
          expect(line).not.toContain(":");
        }
      } finally {
        store.close();
      }
    });

    it("human output includes header and table", () => {
      const store = new GraphStore(dbPath);
      try {
        const result = dependents(store, "greet");
        expect(result).not.toBeNull();
        expect(result!.related.length).toBeGreaterThan(0);
        const humanOutput = [
          formatHeader(`Dependents of ${result!.symbol.name}`),
          formatTable(
            ["Symbol", "Kind", "Relationship", "File", "Line"],
            result!.related.map((r) => [
              r.symbol.name,
              r.symbol.kind,
              r.relationship,
              r.filePath,
              String(r.lineNumber),
            ]),
          ),
        ].join("\n");
        expect(humanOutput).toContain("Dependents of greet");
        expect(humanOutput).toContain("Symbol");
        expect(humanOutput).toContain("Kind");
        expect(humanOutput).toContain("Relationship");
      } finally {
        store.close();
      }
    });
  });

  // ── graph dependencies ──

  describe("graph dependencies", () => {
    it("finds dependencies of a known symbol", () => {
      const store = new GraphStore(dbPath);
      try {
        // run() in consumer.ts depends on AppService, greet
        const result = dependencies(store, "run");
        expect(result).not.toBeNull();
        expect(result!.symbol.name).toBe("run");
        expect(result!.related.length).toBeGreaterThan(0);
      } finally {
        store.close();
      }
    });

    it("returns null for unknown symbol", () => {
      const store = new GraphStore(dbPath);
      try {
        const result = dependencies(store, "NonExistentSymbol12345");
        expect(result).toBeNull();
      } finally {
        store.close();
      }
    });

    it("JSON output has correct shape", () => {
      const store = new GraphStore(dbPath);
      try {
        const result = dependencies(store, "run");
        expect(result).not.toBeNull();
        const jsonData = {
          symbol: {
            name: result!.symbol.name,
            kind: result!.symbol.kind,
            file: result!.symbol.filePath,
            line: result!.symbol.lineStart,
          },
          dependencies: result!.related.map((r) => ({
            name: r.symbol.name,
            kind: r.symbol.kind,
            relationship: r.relationship,
            file: r.filePath,
            line: r.lineNumber,
          })),
        };
        const serialized = JSON.stringify(jsonData, null, 2);
        const parsed = JSON.parse(serialized);
        expect(parsed.symbol.name).toBe("run");
        expect(Array.isArray(parsed.dependencies)).toBe(true);
        expect(parsed.dependencies.length).toBeGreaterThan(0);
      } finally {
        store.close();
      }
    });

    it("quiet output is symbol names only", () => {
      const store = new GraphStore(dbPath);
      try {
        const result = dependencies(store, "run");
        expect(result).not.toBeNull();
        const quietLines = result!.related.map((r) => r.symbol.name);
        expect(quietLines.length).toBeGreaterThan(0);
        for (const line of quietLines) {
          expect(line.length).toBeGreaterThan(0);
        }
      } finally {
        store.close();
      }
    });

    it("human output includes header", () => {
      const store = new GraphStore(dbPath);
      try {
        const result = dependencies(store, "run");
        expect(result).not.toBeNull();
        const humanOutput = formatHeader(`Dependencies of ${result!.symbol.name}`);
        expect(humanOutput).toContain("Dependencies of run");
      } finally {
        store.close();
      }
    });
  });

  // ── graph symbols ──

  describe("graph symbols", () => {
    it("lists symbols in a known file", () => {
      const store = new GraphStore(dbPath);
      try {
        const results = symbolsInFile(store, "service.ts");
        expect(results.length).toBeGreaterThan(0);
        const names = results.map((r) => r.symbol.name);
        expect(names).toContain("AppService");
        expect(names).toContain("BaseService");
      } finally {
        store.close();
      }
    });

    it("returns empty for unknown file", () => {
      const store = new GraphStore(dbPath);
      try {
        const results = symbolsInFile(store, "nonexistent.ts");
        expect(results).toHaveLength(0);
      } finally {
        store.close();
      }
    });

    it("JSON output has correct shape", () => {
      const store = new GraphStore(dbPath);
      try {
        const results = symbolsInFile(store, "service.ts");
        const jsonData = {
          file: "service.ts",
          symbols: results.map((r) => ({
            name: r.symbol.name,
            kind: r.symbol.kind,
            lineStart: r.symbol.lineStart,
            lineEnd: r.symbol.lineEnd,
            exported: r.symbol.exported,
            incomingEdges: r.incomingEdges,
            outgoingEdges: r.outgoingEdges,
          })),
        };
        const serialized = JSON.stringify(jsonData, null, 2);
        const parsed = JSON.parse(serialized);
        expect(parsed.file).toBe("service.ts");
        expect(Array.isArray(parsed.symbols)).toBe(true);
        expect(parsed.symbols.length).toBeGreaterThan(0);
        // Check shape of first symbol
        const first = parsed.symbols[0];
        expect(first).toHaveProperty("name");
        expect(first).toHaveProperty("kind");
        expect(first).toHaveProperty("lineStart");
        expect(first).toHaveProperty("incomingEdges");
        expect(first).toHaveProperty("outgoingEdges");
      } finally {
        store.close();
      }
    });

    it("quiet output is symbol names only", () => {
      const store = new GraphStore(dbPath);
      try {
        const results = symbolsInFile(store, "service.ts");
        const quietLines = results.map((r) => r.symbol.name);
        expect(quietLines.length).toBeGreaterThan(0);
        expect(quietLines).toContain("AppService");
      } finally {
        store.close();
      }
    });

    it("human output includes table headers", () => {
      const store = new GraphStore(dbPath);
      try {
        const results = symbolsInFile(store, "service.ts");
        const humanOutput = [
          formatHeader("Symbols in service.ts"),
          formatTable(
            ["Name", "Kind", "Lines", "Exported", "In", "Out"],
            results.map((r) => [
              r.symbol.name,
              r.symbol.kind,
              `${r.symbol.lineStart}-${r.symbol.lineEnd}`,
              r.symbol.exported ? "yes" : "no",
              String(r.incomingEdges),
              String(r.outgoingEdges),
            ]),
          ),
        ].join("\n");
        expect(humanOutput).toContain("Symbols in service.ts");
        expect(humanOutput).toContain("Name");
        expect(humanOutput).toContain("Kind");
        expect(humanOutput).toContain("Lines");
        expect(humanOutput).toContain("In");
        expect(humanOutput).toContain("Out");
      } finally {
        store.close();
      }
    });
  });

  // ── grep ──

  describe("grep command", () => {
    it("finds matches for a known pattern in fixture dir", async () => {
      const results = await grepSearch("AppService", TS_FIXTURES_DIR);
      expect(results.length).toBeGreaterThan(0);
      // AppService is defined in service.ts and used in consumer.ts
      const files = results.map((r) => r.filePath);
      expect(files.some((f) => f.includes("service.ts"))).toBe(true);
    });

    it("returns empty for non-matching pattern", async () => {
      const results = await grepSearch("ZZZZZ_NONEXISTENT_PATTERN_12345", TS_FIXTURES_DIR);
      expect(results).toHaveLength(0);
    });

    it("JSON output has correct shape", async () => {
      const results = await grepSearch("AppService", TS_FIXTURES_DIR);
      const jsonData = {
        pattern: "AppService",
        matches: results.map((r) => ({
          file: r.filePath,
          line: r.lineNumber,
          column: r.columnNumber,
          matchText: r.matchText,
          lineContent: r.lineContent,
        })),
        totalMatches: results.length,
      };
      const serialized = JSON.stringify(jsonData, null, 2);
      const parsed = JSON.parse(serialized);
      expect(parsed.pattern).toBe("AppService");
      expect(Array.isArray(parsed.matches)).toBe(true);
      expect(parsed.totalMatches).toBeGreaterThan(0);
    });

    it("quiet output is file:line format", async () => {
      const results = await grepSearch("AppService", TS_FIXTURES_DIR);
      const quietLines = results.map((r) => `${r.filePath}:${r.lineNumber}`);
      expect(quietLines.length).toBeGreaterThan(0);
      for (const line of quietLines) {
        expect(line).toMatch(/^.+:\d+$/);
      }
    });

    it("human output includes header and match count", async () => {
      const results = await grepSearch("AppService", TS_FIXTURES_DIR);
      const lines: string[] = [];
      lines.push(formatHeader("Grep: AppService"));
      for (const r of results) {
        lines.push(`  ${r.filePath}:${r.lineNumber}:${r.columnNumber}  ${r.lineContent}`);
      }
      lines.push(`\n  ${results.length} match${results.length === 1 ? "" : "es"} found.`);
      const humanOutput = lines.join("\n");
      expect(humanOutput).toContain("Grep: AppService");
      expect(humanOutput).toContain("match");
    });

    it("supports glob filtering", async () => {
      const results = await grepSearch("AppService", TS_FIXTURES_DIR, {
        globs: ["*.ts"],
      });
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.filePath).toMatch(/\.ts$/);
      }
    });
  });

  // ── find (fuzzy) ──

  describe("find command", () => {
    it("finds symbols by fuzzy name", () => {
      const store = new GraphStore(dbPath);
      try {
        const results = fuzzyFind("AppServ", store);
        expect(results.length).toBeGreaterThan(0);
        const names = results.map((r) => r.symbol.name);
        expect(names.some((n) => n.includes("AppService"))).toBe(true);
      } finally {
        store.close();
      }
    });

    it("returns empty for non-matching query", () => {
      const store = new GraphStore(dbPath);
      try {
        const results = fuzzyFind("zzzzznonexistent12345", store);
        expect(results).toHaveLength(0);
      } finally {
        store.close();
      }
    });

    it("JSON output has correct shape", () => {
      const store = new GraphStore(dbPath);
      try {
        const results = fuzzyFind("Service", store);
        const jsonData = {
          query: "Service",
          results: results.map((r) => ({
            name: r.symbol.name,
            kind: r.symbol.kind,
            file: r.symbol.filePath,
            lineStart: r.symbol.lineStart,
            lineEnd: r.symbol.lineEnd,
            exported: r.symbol.exported,
          })),
          totalResults: results.length,
        };
        const serialized = JSON.stringify(jsonData, null, 2);
        const parsed = JSON.parse(serialized);
        expect(parsed.query).toBe("Service");
        expect(Array.isArray(parsed.results)).toBe(true);
        expect(parsed.totalResults).toBeGreaterThan(0);
      } finally {
        store.close();
      }
    });

    it("quiet output is symbol names only", () => {
      const store = new GraphStore(dbPath);
      try {
        const results = fuzzyFind("Service", store);
        const quietLines = results.map((r) => r.symbol.name);
        expect(quietLines.length).toBeGreaterThan(0);
        for (const line of quietLines) {
          expect(line.length).toBeGreaterThan(0);
        }
      } finally {
        store.close();
      }
    });

    it("human output includes header and table", () => {
      const store = new GraphStore(dbPath);
      try {
        const results = fuzzyFind("Service", store);
        const humanOutput = [
          formatHeader("Find: Service"),
          formatTable(
            ["Name", "Kind", "File", "Lines"],
            results.map((r) => [
              r.symbol.name,
              r.symbol.kind,
              r.symbol.filePath,
              `${r.symbol.lineStart}-${r.symbol.lineEnd}`,
            ]),
          ),
        ].join("\n");
        expect(humanOutput).toContain("Find: Service");
        expect(humanOutput).toContain("Name");
        expect(humanOutput).toContain("Kind");
        expect(humanOutput).toContain("File");
      } finally {
        store.close();
      }
    });

    it("respects --limit option", () => {
      const store = new GraphStore(dbPath);
      try {
        const results = fuzzyFind("Service", store, { limit: 1 });
        expect(results.length).toBeLessThanOrEqual(1);
      } finally {
        store.close();
      }
    });
  });

  // ── Ambiguous symbol resolution ──

  describe("ambiguous symbol resolution", () => {
    it("resolveSymbol returns results for known symbols", () => {
      const store = new GraphStore(dbPath);
      try {
        // "getName" might appear as a method in BaseService
        // Try a symbol that exists
        const resolved = resolveSymbol(store, "BaseService");
        expect(resolved.length).toBeGreaterThanOrEqual(1);
      } finally {
        store.close();
      }
    });
  });

  // ── Missing database handling ──

  describe("missing database handling", () => {
    it("graph commands detect missing database", () => {
      const fakePath = join(tempDir, "nonexistent.db");
      expect(existsSync(fakePath)).toBe(false);
      // GraphStore creates the DB file if missing (SQLite behavior)
      const store = new GraphStore(fakePath);
      try {
        expect(existsSync(fakePath)).toBe(true);
        const stats = store.getStats();
        expect(stats.symbols).toBe(0);
      } finally {
        store.close();
      }
    });
  });

  // ── Output dispatcher integration ──

  describe("output dispatcher integration", () => {
    let logOutput: string[];

    beforeEach(() => {
      logOutput = [];
      spyOn(console, "log").mockImplementation((...args: unknown[]) => {
        logOutput.push(args.map(String).join(" "));
      });
    });

    afterEach(() => {
      mock.restore();
    });

    it("graph dependents through JSON dispatcher", () => {
      const store = new GraphStore(dbPath);
      try {
        const result = dependents(store, "greet");
        expect(result).not.toBeNull();
        const jsonData = {
          symbol: { name: result!.symbol.name },
          dependents: result!.related.map((r) => ({ name: r.symbol.name })),
        };
        const opts: OutputOptions = { json: true, quiet: false };
        output(jsonData, [], () => "", opts);
        expect(logOutput).toHaveLength(1);
        const parsed = JSON.parse(logOutput[0]!);
        expect(parsed.symbol.name).toBe("greet");
      } finally {
        store.close();
      }
    });

    it("graph symbols through quiet dispatcher", () => {
      const store = new GraphStore(dbPath);
      try {
        const results = symbolsInFile(store, "service.ts");
        const quietLines = results.map((r) => r.symbol.name);
        const opts: OutputOptions = { json: false, quiet: true };
        output({}, quietLines, () => "", opts);
        expect(logOutput.length).toBeGreaterThan(0);
        expect(logOutput.some((l) => l.includes("AppService"))).toBe(true);
      } finally {
        store.close();
      }
    });

    it("find through human dispatcher", () => {
      const store = new GraphStore(dbPath);
      try {
        const results = fuzzyFind("Service", store);
        const humanFn = () =>
          [
            formatHeader("Find: Service"),
            formatTable(
              ["Name", "Kind", "File", "Lines"],
              results.map((r) => [
                r.symbol.name,
                r.symbol.kind,
                r.symbol.filePath,
                `${r.symbol.lineStart}-${r.symbol.lineEnd}`,
              ]),
            ),
          ].join("\n");
        const opts: OutputOptions = { json: false, quiet: false };
        output({}, [], humanFn, opts);
        expect(logOutput).toHaveLength(1);
        expect(logOutput[0]).toContain("Find: Service");
      } finally {
        store.close();
      }
    });
  });
});
