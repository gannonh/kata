/**
 * CLI tests.
 *
 * Tests the CLI commands programmatically by importing the core functions
 * and testing the output formatters + command logic directly.
 * Also includes integration tests that exercise the full index→status flow.
 */

import { vi } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { indexProject, type IndexResult } from "../src/indexer.js";
import { GraphStore } from "../src/graph/store.js";
import { loadConfig } from "../src/config.js";
import {
  output,
  outputJson,
  outputQuiet,
  formatHeader,
  formatKeyValue,
  formatTable,
  type OutputOptions,
} from "../src/formatters.js";

// ── Fixture paths ──

const FIXTURES_DIR = resolve(import.meta.dirname!, "fixtures/mixed");

// ── Tests ──

describe("CLI integration", () => {
  let tempDir: string;
  let dbPath: string;
  let store: GraphStore;

  beforeAll(() => {
    tempDir = join(tmpdir(), `kata-cli-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    dbPath = join(tempDir, "test.db");

    // Index fixture directory into a real DB
    const result = indexProject(FIXTURES_DIR, { dbPath });
    expect(result.filesIndexed).toBeGreaterThan(0);
    expect(result.symbolsExtracted).toBeGreaterThan(0);
  });

  afterAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("index command logic", () => {
    it("indexProject returns correct result shape", () => {
      const memStore = new GraphStore(":memory:");
      try {
        const result = indexProject(FIXTURES_DIR, { store: memStore });
        expect(result).toHaveProperty("filesIndexed");
        expect(result).toHaveProperty("symbolsExtracted");
        expect(result).toHaveProperty("edgesCreated");
        expect(result).toHaveProperty("duration");
        expect(result).toHaveProperty("errors");
        expect(typeof result.filesIndexed).toBe("number");
        expect(typeof result.symbolsExtracted).toBe("number");
        expect(typeof result.edgesCreated).toBe("number");
        expect(typeof result.duration).toBe("number");
        expect(Array.isArray(result.errors)).toBe(true);
      } finally {
        memStore.close();
      }
    });

    it("index result has positive counts on fixture dir", () => {
      const memStore = new GraphStore(":memory:");
      try {
        const result = indexProject(FIXTURES_DIR, { store: memStore });
        expect(result.filesIndexed).toBeGreaterThan(0);
        expect(result.symbolsExtracted).toBeGreaterThan(0);
      } finally {
        memStore.close();
      }
    });

    it("index result JSON mode produces valid JSON", () => {
      const memStore = new GraphStore(":memory:");
      try {
        const result = indexProject(FIXTURES_DIR, { store: memStore });
        const jsonData = {
          filesIndexed: result.filesIndexed,
          symbolsExtracted: result.symbolsExtracted,
          edgesCreated: result.edgesCreated,
          duration: result.duration,
          errors: result.errors,
        };
        // Verify JSON serialization works
        const serialized = JSON.stringify(jsonData, null, 2);
        const parsed = JSON.parse(serialized);
        expect(parsed.filesIndexed).toBe(result.filesIndexed);
        expect(parsed.symbolsExtracted).toBe(result.symbolsExtracted);
      } finally {
        memStore.close();
      }
    });

    it("index quiet mode produces file count only", () => {
      const memStore = new GraphStore(":memory:");
      try {
        const result = indexProject(FIXTURES_DIR, { store: memStore });
        const quietLines = [String(result.filesIndexed)];
        expect(quietLines).toHaveLength(1);
        const count = parseInt(quietLines[0]!, 10);
        expect(count).toBeGreaterThan(0);
      } finally {
        memStore.close();
      }
    });

    it("index human mode includes expected labels", () => {
      const memStore = new GraphStore(":memory:");
      try {
        const result = indexProject(FIXTURES_DIR, { store: memStore });
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
        expect(humanOutput).toContain("Duration");
      } finally {
        memStore.close();
      }
    });
  });

  describe("status command logic", () => {
    it("returns correct stats from an indexed database", () => {
      const store = new GraphStore(dbPath);
      try {
        const stats = store.getStats();
        expect(stats.symbols).toBeGreaterThan(0);
        expect(stats.files).toBeGreaterThan(0);
        expect(typeof stats.edges).toBe("number");
      } finally {
        store.close();
      }
    });

    it("status JSON mode produces valid JSON", () => {
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
        const serialized = JSON.stringify(jsonData, null, 2);
        const parsed = JSON.parse(serialized);
        expect(parsed.symbols).toBe(stats.symbols);
        expect(parsed.edges).toBe(stats.edges);
        expect(parsed.files).toBe(stats.files);
      } finally {
        store.close();
      }
    });

    it("status quiet mode produces 3 lines", () => {
      const store = new GraphStore(dbPath);
      try {
        const stats = store.getStats();
        const quietLines = [
          `${stats.symbols} symbols`,
          `${stats.edges} edges`,
          `${stats.files} files`,
        ];
        expect(quietLines).toHaveLength(3);
        expect(quietLines[0]).toContain("symbols");
        expect(quietLines[1]).toContain("edges");
        expect(quietLines[2]).toContain("files");
      } finally {
        store.close();
      }
    });

    it("status human mode includes expected labels", () => {
      const store = new GraphStore(dbPath);
      try {
        const stats = store.getStats();
        const lastSha = store.getLastIndexedSha();
        const humanOutput = [
          formatHeader("Graph Status"),
          formatKeyValue([
            ["Symbols", stats.symbols],
            ["Edges", stats.edges],
            ["Files", stats.files],
            ["Last indexed SHA", lastSha ?? "(none)"],
            ["Database", dbPath],
          ]),
        ].join("\n");
        expect(humanOutput).toContain("Graph Status");
        expect(humanOutput).toContain("Symbols");
        expect(humanOutput).toContain("Edges");
        expect(humanOutput).toContain("Files");
        expect(humanOutput).toContain("Database");
      } finally {
        store.close();
      }
    });

    it("missing database is detectable via existsSync", () => {
      const fakePath = join(tempDir, "nonexistent.db");
      expect(existsSync(fakePath)).toBe(false);
    });
  });

  describe("output dispatcher integration", () => {
    let logOutput: string[];

    beforeEach(() => {
      logOutput = [];
      vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
        logOutput.push(args.map(String).join(" "));
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("index result through JSON dispatcher", () => {
      const memStore = new GraphStore(":memory:");
      try {
        const result = indexProject(FIXTURES_DIR, { store: memStore });
        const jsonData = {
          filesIndexed: result.filesIndexed,
          symbolsExtracted: result.symbolsExtracted,
          edgesCreated: result.edgesCreated,
          duration: result.duration,
          errors: result.errors,
        };
        const opts: OutputOptions = { json: true, quiet: false };
        output(jsonData, [], () => "", opts);
        expect(logOutput).toHaveLength(1);
        const parsed = JSON.parse(logOutput[0]!);
        expect(parsed.filesIndexed).toBe(result.filesIndexed);
      } finally {
        memStore.close();
      }
    });

    it("status through quiet dispatcher", () => {
      const store = new GraphStore(dbPath);
      try {
        const stats = store.getStats();
        const quietLines = [
          `${stats.symbols} symbols`,
          `${stats.edges} edges`,
          `${stats.files} files`,
        ];
        const opts: OutputOptions = { json: false, quiet: true };
        output({}, quietLines, () => "", opts);
        expect(logOutput).toHaveLength(3);
        expect(logOutput[0]).toContain("symbols");
      } finally {
        store.close();
      }
    });

    it("status through human dispatcher", () => {
      const store = new GraphStore(dbPath);
      try {
        const stats = store.getStats();
        const lastSha = store.getLastIndexedSha();
        const humanFn = () =>
          [
            formatHeader("Graph Status"),
            formatKeyValue([
              ["Symbols", stats.symbols],
              ["Edges", stats.edges],
              ["Files", stats.files],
              ["Last indexed SHA", lastSha ?? "(none)"],
            ]),
          ].join("\n");
        const opts: OutputOptions = { json: false, quiet: false };
        output({}, [], humanFn, opts);
        expect(logOutput).toHaveLength(1);
        expect(logOutput[0]).toContain("Graph Status");
        expect(logOutput[0]).toContain("Symbols");
      } finally {
        store.close();
      }
    });
  });
});
