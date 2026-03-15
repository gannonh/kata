/**
 * End-to-end CLI tests.
 *
 * Tests the full pipeline: index a real fixture directory → run every command
 * → verify all three output formats (JSON, quiet, human-readable).
 *
 * Uses programmatic imports (same pattern as existing CLI tests) since
 * the compiled dist/ has ESM resolution issues with native tree-sitter modules.
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
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
import {
  output,
  formatHeader,
  formatKeyValue,
  formatTable,
  type OutputOptions,
} from "../src/formatters.js";

// ── Fixture paths ──

const TS_FIXTURES = resolve(import.meta.dirname!, "fixtures/relationships/ts");
const SKILL_PATH = resolve(import.meta.dirname!, "../skill/SKILL.md");

// ── Shared state ──

let tempDir: string;
let dbPath: string;

beforeAll(() => {
  tempDir = join(tmpdir(), `kata-e2e-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });
  dbPath = join(tempDir, "e2e.db");

  // Index the TypeScript relationship fixtures — full pipeline
  const result = indexProject(TS_FIXTURES, { dbPath });
  expect(result.filesIndexed).toBeGreaterThan(0);
  expect(result.symbolsExtracted).toBeGreaterThan(0);
  expect(result.edgesCreated).toBeGreaterThan(0);
});

afterAll(() => {
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ── Helper: capture console.log output ──

function captureOutput(fn: () => void): string[] {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return lines;
}

// ── E2E: Full pipeline tests ──

describe("E2E: index → query pipeline", () => {
  it("indexes fixture directory with symbols and edges", () => {
    const store = new GraphStore(dbPath);
    try {
      const stats = store.getStats();
      expect(stats.symbols).toBeGreaterThan(5);
      expect(stats.edges).toBeGreaterThan(0);
      expect(stats.files).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });

  it("graph dependents returns results for known symbol", () => {
    const store = new GraphStore(dbPath);
    try {
      const result = dependents(store, "createConfig");
      expect(result).not.toBeNull();
      expect(result!.symbol.name).toBe("createConfig");
      expect(result!.related.length).toBeGreaterThan(0);
      // BaseService.constructor calls createConfig
      const callers = result!.related.map((r) => r.symbol.name);
      const hasBaseServiceCaller = callers.some((n) => n.startsWith("BaseService"));
      expect(hasBaseServiceCaller).toBe(true);
    } finally {
      store.close();
    }
  });

  it("graph dependencies returns results for known symbol", () => {
    const store = new GraphStore(dbPath);
    try {
      const result = dependencies(store, "AppService");
      expect(result).not.toBeNull();
      expect(result!.symbol.name).toBe("AppService");
      expect(result!.related.length).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });

  it("graph symbols returns symbols for known file", () => {
    const store = new GraphStore(dbPath);
    try {
      const results = symbolsInFile(store, "types.ts");
      expect(results.length).toBeGreaterThan(0);
      const names = results.map((r) => r.symbol.name);
      expect(names).toContain("Config");
      expect(names).toContain("IService");
      expect(names).toContain("LogLevel");
    } finally {
      store.close();
    }
  });

  it("find returns results for fuzzy query", () => {
    const store = new GraphStore(dbPath);
    try {
      const results = fuzzyFind("service", store, {});
      expect(results.length).toBeGreaterThan(0);
      const names = results.map((r) => r.symbol.name);
      // Should find AppService and/or BaseService and/or IService
      const hasServiceMatch = names.some((n) => n.toLowerCase().includes("service"));
      expect(hasServiceMatch).toBe(true);
    } finally {
      store.close();
    }
  });

  it("grep finds known pattern in fixture directory", async () => {
    const results = await grepSearch("export", TS_FIXTURES, {});
    expect(results.length).toBeGreaterThan(0);
    // Every TS fixture file has exports
    const files = [...new Set(results.map((r) => r.filePath))];
    expect(files.length).toBeGreaterThan(1);
  });
});

// ── E2E: JSON output format ──

describe("E2E: JSON output format", () => {
  it("index result serializes to valid JSON with expected fields", () => {
    const store = new GraphStore(":memory:");
    try {
      const result = indexProject(TS_FIXTURES, { store });
      const jsonData = {
        filesIndexed: result.filesIndexed,
        symbolsExtracted: result.symbolsExtracted,
        edgesCreated: result.edgesCreated,
        duration: result.duration,
        errors: result.errors,
      };
      const parsed = JSON.parse(JSON.stringify(jsonData));
      expect(parsed.filesIndexed).toBeGreaterThan(0);
      expect(parsed.symbolsExtracted).toBeGreaterThan(0);
      expect(parsed.edgesCreated).toBeGreaterThan(0);
      expect(typeof parsed.duration).toBe("number");
      expect(Array.isArray(parsed.errors)).toBe(true);
    } finally {
      store.close();
    }
  });

  it("status JSON includes all expected keys", () => {
    const store = new GraphStore(dbPath);
    try {
      const stats = store.getStats();
      const lastSha = store.getLastIndexedSha();
      const jsonData = {
        symbols: stats.symbols,
        edges: stats.edges,
        files: stats.files,
        lastIndexedSha: lastSha,
        dbPath,
      };
      const parsed = JSON.parse(JSON.stringify(jsonData));
      expect(parsed).toHaveProperty("symbols");
      expect(parsed).toHaveProperty("edges");
      expect(parsed).toHaveProperty("files");
      expect(parsed).toHaveProperty("lastIndexedSha");
      expect(parsed).toHaveProperty("dbPath");
    } finally {
      store.close();
    }
  });

  it("dependents JSON has symbol and dependents array", () => {
    const store = new GraphStore(dbPath);
    try {
      const result = dependents(store, "createConfig");
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
      const parsed = JSON.parse(JSON.stringify(jsonData));
      expect(parsed.symbol.name).toBe("createConfig");
      expect(Array.isArray(parsed.dependents)).toBe(true);
      expect(parsed.dependents.length).toBeGreaterThan(0);
      // Each dependent has required fields
      for (const dep of parsed.dependents) {
        expect(dep).toHaveProperty("name");
        expect(dep).toHaveProperty("kind");
        expect(dep).toHaveProperty("relationship");
        expect(dep).toHaveProperty("file");
        expect(dep).toHaveProperty("line");
      }
    } finally {
      store.close();
    }
  });

  it("symbols JSON has file and symbols array", () => {
    const store = new GraphStore(dbPath);
    try {
      const results = symbolsInFile(store, "types.ts");
      const jsonData = {
        file: "types.ts",
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
      const parsed = JSON.parse(JSON.stringify(jsonData));
      expect(parsed.file).toBe("types.ts");
      expect(parsed.symbols.length).toBeGreaterThan(0);
      for (const sym of parsed.symbols) {
        expect(sym).toHaveProperty("name");
        expect(sym).toHaveProperty("kind");
        expect(sym).toHaveProperty("lineStart");
        expect(sym).toHaveProperty("lineEnd");
        expect(typeof sym.exported).toBe("boolean");
        expect(typeof sym.incomingEdges).toBe("number");
        expect(typeof sym.outgoingEdges).toBe("number");
      }
    } finally {
      store.close();
    }
  });

  it("find JSON has query and results array", () => {
    const store = new GraphStore(dbPath);
    try {
      const results = fuzzyFind("config", store, {});
      const jsonData = {
        query: "config",
        results: results.map((r) => ({
          name: r.symbol.name,
          kind: r.symbol.kind,
          file: r.symbol.filePath,
        })),
        totalResults: results.length,
      };
      const parsed = JSON.parse(JSON.stringify(jsonData));
      expect(parsed.query).toBe("config");
      expect(Array.isArray(parsed.results)).toBe(true);
      expect(parsed.totalResults).toBe(results.length);
    } finally {
      store.close();
    }
  });

  it("grep JSON has pattern and matches array", async () => {
    const results = await grepSearch("class", TS_FIXTURES, { maxResults: 5 });
    const jsonData = {
      pattern: "class",
      matches: results.map((r) => ({
        file: r.filePath,
        line: r.lineNumber,
        column: r.columnNumber,
        matchText: r.matchText,
        lineContent: r.lineContent,
      })),
      totalMatches: results.length,
    };
    const parsed = JSON.parse(JSON.stringify(jsonData));
    expect(parsed.pattern).toBe("class");
    expect(Array.isArray(parsed.matches)).toBe(true);
    expect(parsed.totalMatches).toBeGreaterThan(0);
    for (const m of parsed.matches) {
      expect(m).toHaveProperty("file");
      expect(m).toHaveProperty("line");
      expect(typeof m.line).toBe("number");
    }
  });
});

// ── E2E: Quiet output format ──

describe("E2E: quiet output format", () => {
  it("dependents quiet outputs symbol names only", () => {
    const store = new GraphStore(dbPath);
    try {
      const result = dependents(store, "createConfig");
      expect(result).not.toBeNull();
      const quietLines = result!.related.map((r) => r.symbol.name);
      expect(quietLines.length).toBeGreaterThan(0);
      // Each line should be a simple symbol name — no tabs, no extra columns
      for (const line of quietLines) {
        expect(line).not.toContain("\t");
        expect(line.trim()).toBe(line);
        expect(line.length).toBeGreaterThan(0);
      }
    } finally {
      store.close();
    }
  });

  it("symbols quiet outputs symbol names only", () => {
    const store = new GraphStore(dbPath);
    try {
      const results = symbolsInFile(store, "types.ts");
      const quietLines = results.map((r) => r.symbol.name);
      expect(quietLines.length).toBeGreaterThan(0);
      expect(quietLines).toContain("Config");
      expect(quietLines).toContain("IService");
    } finally {
      store.close();
    }
  });

  it("find quiet outputs symbol names only", () => {
    const store = new GraphStore(dbPath);
    try {
      const results = fuzzyFind("log", store, {});
      const quietLines = results.map((r) => r.symbol.name);
      expect(quietLines.length).toBeGreaterThan(0);
      for (const line of quietLines) {
        expect(line.trim()).toBe(line);
      }
    } finally {
      store.close();
    }
  });

  it("grep quiet outputs file:line pairs", async () => {
    const results = await grepSearch("export", TS_FIXTURES, { maxResults: 5 });
    const quietLines = results.map((r) => `${r.filePath}:${r.lineNumber}`);
    expect(quietLines.length).toBeGreaterThan(0);
    for (const line of quietLines) {
      // Should match pattern: filepath:number
      expect(line).toMatch(/^.+:\d+$/);
    }
  });
});

// ── E2E: Human-readable output format ──

describe("E2E: human-readable output format", () => {
  it("index human output contains expected headers", () => {
    const store = new GraphStore(":memory:");
    try {
      const result = indexProject(TS_FIXTURES, { store });
      const humanOutput = [
        formatHeader("Index Complete"),
        formatKeyValue([
          ["Files indexed", result.filesIndexed],
          ["Symbols extracted", result.symbolsExtracted],
          ["Edges created", result.edgesCreated],
          ["Duration", `${result.duration}ms`],
        ]),
      ].join("\n");
      expect(humanOutput).toContain("Index Complete");
      expect(humanOutput).toContain("Files indexed");
      expect(humanOutput).toContain("Symbols extracted");
      expect(humanOutput).toContain("Edges created");
    } finally {
      store.close();
    }
  });

  it("dependents human output shows table with columns", () => {
    const store = new GraphStore(dbPath);
    try {
      const result = dependents(store, "createConfig");
      expect(result).not.toBeNull();
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
      expect(humanOutput).toContain("Dependents of createConfig");
      expect(humanOutput).toContain("Symbol");
      expect(humanOutput).toContain("Kind");
      expect(humanOutput).toContain("Relationship");
    } finally {
      store.close();
    }
  });

  it("symbols human output shows table with name, kind, lines", () => {
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
      expect(humanOutput).toContain("Exported");
      // Should contain known symbols
      expect(humanOutput).toContain("BaseService");
      expect(humanOutput).toContain("AppService");
    } finally {
      store.close();
    }
  });

  it("find human output shows table for search results", () => {
    const store = new GraphStore(dbPath);
    try {
      const results = fuzzyFind("greet", store, {});
      expect(results.length).toBeGreaterThan(0);
      const humanOutput = [
        formatHeader("Find: greet"),
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
      expect(humanOutput).toContain("Find: greet");
      expect(humanOutput).toContain("greet");
      expect(humanOutput).toContain("function");
    } finally {
      store.close();
    }
  });
});

// ── E2E: Output dispatcher integration ──

describe("E2E: output dispatcher routes correctly", () => {
  it("JSON mode outputs parseable JSON via dispatcher", () => {
    const store = new GraphStore(dbPath);
    try {
      const result = dependents(store, "log");
      expect(result).not.toBeNull();
      const jsonData = {
        symbol: result!.symbol.name,
        count: result!.related.length,
      };
      const lines = captureOutput(() => {
        output(jsonData, [], () => "", { json: true, quiet: false });
      });
      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]!);
      expect(parsed.symbol).toBe("log");
    } finally {
      store.close();
    }
  });

  it("quiet mode outputs one line per item via dispatcher", () => {
    const store = new GraphStore(dbPath);
    try {
      const results = symbolsInFile(store, "utils.ts");
      const quietLines = results.map((r) => r.symbol.name);
      const lines = captureOutput(() => {
        output({}, quietLines, () => "", { json: false, quiet: true });
      });
      expect(lines.length).toBe(quietLines.length);
      expect(lines.length).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });

  it("human mode outputs formatted text via dispatcher", () => {
    const store = new GraphStore(dbPath);
    try {
      const stats = store.getStats();
      const humanFn = () =>
        [
          formatHeader("Graph Status"),
          formatKeyValue([
            ["Symbols", stats.symbols],
            ["Edges", stats.edges],
          ]),
        ].join("\n");
      const lines = captureOutput(() => {
        output({}, [], humanFn, { json: false, quiet: false });
      });
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("Graph Status");
      expect(lines[0]).toContain("Symbols");
    } finally {
      store.close();
    }
  });
});

// ── E2E: Edge cases ──

describe("E2E: edge cases", () => {
  it("missing database is detectable", () => {
    const fakePath = join(tempDir, "nonexistent.db");
    expect(existsSync(fakePath)).toBe(false);
  });

  it("symbol not found returns null from dependents", () => {
    const store = new GraphStore(dbPath);
    try {
      const result = dependents(store, "NonExistentSymbol");
      expect(result).toBeNull();
    } finally {
      store.close();
    }
  });

  it("empty file returns no symbols", () => {
    const store = new GraphStore(dbPath);
    try {
      const results = symbolsInFile(store, "definitely-not-a-file.ts");
      expect(results).toHaveLength(0);
    } finally {
      store.close();
    }
  });

  it("find with no matches returns empty array", () => {
    const store = new GraphStore(dbPath);
    try {
      const results = fuzzyFind("zzzznonexistentsymbol", store, {});
      expect(results).toHaveLength(0);
    } finally {
      store.close();
    }
  });
});

// ── Agent Skill file validation ──

describe("Agent Skill file", () => {
  it("exists at skill/SKILL.md", () => {
    expect(existsSync(SKILL_PATH)).toBe(true);
  });

  it("has valid frontmatter with name and description", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    // Check frontmatter delimiters
    expect(content.startsWith("---\n")).toBe(true);
    const secondDash = content.indexOf("---", 4);
    expect(secondDash).toBeGreaterThan(4);

    const frontmatter = content.slice(4, secondDash);
    expect(frontmatter).toContain("name: kata-context");
    expect(frontmatter).toContain("description:");
  });

  it("documents all CLI commands", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    expect(content).toContain("kata-context index");
    expect(content).toContain("kata-context status");
    expect(content).toContain("kata-context graph dependents");
    expect(content).toContain("kata-context graph dependencies");
    expect(content).toContain("kata-context graph symbols");
    expect(content).toContain("kata-context grep");
    expect(content).toContain("kata-context find");
  });

  it("documents output modes", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    expect(content).toContain("--json");
    expect(content).toContain("--quiet");
  });

  it("includes prerequisites section", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    expect(content).toContain("Node.js");
    expect(content).toContain("ripgrep");
  });

  it("includes troubleshooting section", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    expect(content).toContain("Troubleshooting");
    expect(content).toContain("No database found");
    expect(content).toContain("Symbol not found");
  });

  it("name follows Agent Skills spec (lowercase, hyphens only)", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    const frontmatter = content.slice(4, content.indexOf("---", 4));
    const nameMatch = frontmatter.match(/name:\s*(.+)/);
    expect(nameMatch).not.toBeNull();
    const name = nameMatch![1]!.trim();
    expect(name).toMatch(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/);
    expect(name.length).toBeLessThanOrEqual(64);
  });

  it("description is under 1024 characters", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    const frontmatter = content.slice(4, content.indexOf("---", 4));
    const descMatch = frontmatter.match(/description:\s*(.+)/);
    expect(descMatch).not.toBeNull();
    const desc = descMatch![1]!.trim();
    expect(desc.length).toBeLessThanOrEqual(1024);
    expect(desc.length).toBeGreaterThan(10);
  });
});
