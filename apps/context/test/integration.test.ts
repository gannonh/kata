import { describe, it, expect, vi } from "vitest";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { discoverFiles } from "../src/discovery.js";
import { parseFile, parseFiles } from "../src/parser/index.js";
import { detectLanguage, isSupportedFile } from "../src/parser/languages.js";
import { DEFAULT_CONFIG } from "../src/types.js";
import { SymbolKind } from "../src/types.js";
import type { Config } from "../src/types.js";

const FIXTURES = join(import.meta.dirname, "fixtures", "mixed");

function configWith(overrides: Partial<Config> = {}): Config {
  return { ...structuredClone(DEFAULT_CONFIG), ...overrides };
}

// ── Language registry tests ──

describe("language registry", () => {
  it("detects typescript from .ts extension", () => {
    expect(detectLanguage("src/utils.ts")).toBe("typescript");
  });

  it("detects typescript from .tsx extension", () => {
    expect(detectLanguage("components/App.tsx")).toBe("typescript");
  });

  it("detects python from .py extension", () => {
    expect(detectLanguage("scripts/main.py")).toBe("python");
  });

  it("returns null for unknown extensions", () => {
    expect(detectLanguage("readme.md")).toBeNull();
    expect(detectLanguage("data.json")).toBeNull();
    expect(detectLanguage("style.css")).toBeNull();
  });

  it("isSupportedFile checks correctly", () => {
    expect(isSupportedFile("file.ts")).toBe(true);
    expect(isSupportedFile("file.py")).toBe(true);
    expect(isSupportedFile("file.md")).toBe(false);
  });
});

// ── parseFile orchestrator tests ──

describe("parseFile", () => {
  it("dispatches TypeScript files to the TS parser", () => {
    const result = parseFile("utils.ts", {
      source: 'export function greet(name: string): string { return `Hello, ${name}!`; }',
    });
    expect(result.language).toBe("typescript");
    expect(result.symbols.length).toBeGreaterThan(0);
    expect(result.symbols[0].name).toBe("greet");
  });

  it("dispatches Python files to the Python parser", () => {
    const result = parseFile("helper.py", {
      source: 'def calculate(x: int, y: int) -> int:\n    """Add two numbers."""\n    return x + y\n',
    });
    expect(result.language).toBe("python");
    expect(result.symbols.length).toBeGreaterThan(0);
    expect(result.symbols[0].name).toBe("calculate");
  });

  it("throws for unsupported file types", () => {
    expect(() => parseFile("readme.md", { source: "# Hello" })).toThrow(
      "Unsupported file type",
    );
  });

  it("reads from disk when source is not provided", () => {
    const result = parseFile("utils.ts", { rootPath: FIXTURES });
    expect(result.language).toBe("typescript");
    expect(result.symbols.length).toBeGreaterThan(0);
    const names = result.symbols.map((s) => s.name);
    expect(names).toContain("greet");
    expect(names).toContain("sum");
    expect(names).toContain("Config");
  });

  it("parses a fixture Python file from disk", () => {
    const result = parseFile("helpers.py", { rootPath: FIXTURES });
    expect(result.language).toBe("python");
    const names = result.symbols.map((s) => s.name);
    expect(names).toContain("calculate_average");
    expect(names).toContain("DataProcessor");
  });

  it("parses an empty file without crashing", () => {
    const result = parseFile("empty.ts", { rootPath: FIXTURES });
    expect(result.language).toBe("typescript");
    expect(result.symbols).toEqual([]);
  });

  it("parses a file with syntax errors without crashing", () => {
    // tree-sitter is error-tolerant — it will parse what it can
    const result = parseFile("syntax-error.ts", { rootPath: FIXTURES });
    expect(result.language).toBe("typescript");
    // May or may not extract symbols — the point is it doesn't throw
  });
});

// ── parseFiles batch tests ──

describe("parseFiles", () => {
  it("parses multiple files and returns results for each", () => {
    const results = parseFiles(["utils.ts", "helpers.py"], FIXTURES);
    expect(results).toHaveLength(2);
    expect(results[0].filePath).toBe("utils.ts");
    expect(results[0].parsed).not.toBeNull();
    expect(results[1].filePath).toBe("helpers.py");
    expect(results[1].parsed).not.toBeNull();
  });

  it("gracefully handles unparseable files in batch", () => {
    // Spy on console.error to suppress warning output in test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const results = parseFiles(
      ["utils.ts", "nonexistent.ts", "helpers.py"],
      FIXTURES,
    );
    expect(results).toHaveLength(3);

    // utils.ts — success
    expect(results[0].parsed).not.toBeNull();
    expect(results[0].error).toBeUndefined();

    // nonexistent.ts — error (file doesn't exist)
    expect(results[1].parsed).toBeNull();
    expect(results[1].error).toBeDefined();

    // helpers.py — success
    expect(results[2].parsed).not.toBeNull();
    expect(results[2].error).toBeUndefined();

    // Console warning was emitted
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy.mock.calls[0][0]).toContain("nonexistent.ts");
    consoleSpy.mockRestore();
  });

  it("returns empty array for empty input", () => {
    const results = parseFiles([], FIXTURES);
    expect(results).toEqual([]);
  });
});

// ── End-to-end: discover + parse ──

describe("end-to-end: discoverFiles + parseFiles", () => {
  it("discovers and parses all files in the mixed fixture directory", () => {
    const files = discoverFiles(FIXTURES, configWith());
    const results = parseFiles(files, FIXTURES);

    // All files have results
    expect(results.length).toBe(files.length);

    // Collect all successful parses
    const parsed = results.filter((r) => r.parsed !== null);
    expect(parsed.length).toBeGreaterThanOrEqual(5); // at least 5 parseable files

    // Collect all symbols across all files
    const allSymbols = parsed.flatMap((r) => r.parsed!.symbols);

    // Check known TypeScript symbols
    const symbolNames = allSymbols.map((s) => s.name);
    expect(symbolNames).toContain("greet"); // utils.ts
    expect(symbolNames).toContain("sum"); // utils.ts
    expect(symbolNames).toContain("Config"); // utils.ts interface
    expect(symbolNames).toContain("UserService"); // service.ts
    expect(symbolNames).toContain("UserService.createUser"); // service.ts method
    expect(symbolNames).toContain("UserService.getUser"); // service.ts method
    expect(symbolNames).toContain("UserId"); // service.ts type alias
    expect(symbolNames).toContain("Status"); // nested/deep.ts enum
    expect(symbolNames).toContain("getStatus"); // nested/deep.ts function

    // Check known Python symbols
    expect(symbolNames).toContain("calculate_average"); // helpers.py
    expect(symbolNames).toContain("DataProcessor"); // helpers.py
    expect(symbolNames).toContain("DataProcessor.process"); // helpers.py method
    expect(symbolNames).toContain("DataProcessor.validate"); // helpers.py static
    expect(symbolNames).toContain("BaseModel"); // nested/models.py
    expect(symbolNames).toContain("UserModel"); // nested/models.py
    expect(symbolNames).toContain("UserModel.to_dict"); // nested/models.py method

    // Check symbol kinds
    const functions = allSymbols.filter((s) => s.kind === SymbolKind.Function);
    const classes = allSymbols.filter((s) => s.kind === SymbolKind.Class);
    const methods = allSymbols.filter((s) => s.kind === SymbolKind.Method);
    const interfaces = allSymbols.filter(
      (s) => s.kind === SymbolKind.Interface,
    );
    const enums = allSymbols.filter((s) => s.kind === SymbolKind.Enum);
    const typeAliases = allSymbols.filter(
      (s) => s.kind === SymbolKind.TypeAlias,
    );

    expect(functions.length).toBeGreaterThanOrEqual(4); // greet, sum, calculate_average, getStatus
    expect(classes.length).toBeGreaterThanOrEqual(4); // UserService, DataProcessor, BaseModel, UserModel
    expect(methods.length).toBeGreaterThanOrEqual(5); // various class methods
    expect(interfaces.length).toBeGreaterThanOrEqual(1); // Config
    expect(enums.length).toBeGreaterThanOrEqual(1); // Status
    expect(typeAliases.length).toBeGreaterThanOrEqual(1); // UserId
  });

  it("each parsed file has correct language assignment", () => {
    const files = discoverFiles(FIXTURES, configWith());
    const results = parseFiles(files, FIXTURES);

    for (const result of results) {
      if (!result.parsed) continue;
      if (result.filePath.endsWith(".ts") || result.filePath.endsWith(".tsx")) {
        expect(result.parsed.language).toBe("typescript");
      } else if (result.filePath.endsWith(".py")) {
        expect(result.parsed.language).toBe("python");
      }
    }
  });

  it("all symbols have required metadata fields", () => {
    const files = discoverFiles(FIXTURES, configWith());
    const results = parseFiles(files, FIXTURES);
    const allSymbols = results
      .filter((r) => r.parsed !== null)
      .flatMap((r) => r.parsed!.symbols);

    for (const sym of allSymbols) {
      expect(sym.id).toBeDefined();
      expect(sym.id).toHaveLength(16); // SHA-256 truncated to 16 hex chars
      expect(sym.name).toBeDefined();
      expect(sym.name.length).toBeGreaterThan(0);
      expect(sym.kind).toBeDefined();
      expect(sym.filePath).toBeDefined();
      expect(sym.lineStart).toBeGreaterThan(0);
      expect(sym.lineEnd).toBeGreaterThanOrEqual(sym.lineStart);
      expect(sym.source).toBeDefined();
      expect(sym.source.length).toBeGreaterThan(0);
      expect(typeof sym.exported).toBe("boolean");
    }
  });

  it("produces deterministic results across runs", () => {
    const files = discoverFiles(FIXTURES, configWith());
    const results1 = parseFiles(files, FIXTURES);
    const results2 = parseFiles(files, FIXTURES);

    // Same file count
    expect(results1.length).toBe(results2.length);

    // Same symbols with same IDs
    const ids1 = results1
      .filter((r) => r.parsed)
      .flatMap((r) => r.parsed!.symbols.map((s) => s.id))
      .sort();
    const ids2 = results2
      .filter((r) => r.parsed)
      .flatMap((r) => r.parsed!.symbols.map((s) => s.id))
      .sort();
    expect(ids1).toEqual(ids2);
  });

  it("works with language filter — typescript only", () => {
    const files = discoverFiles(
      FIXTURES,
      configWith({ languages: ["typescript"] }),
    );
    const results = parseFiles(files, FIXTURES);

    const allSymbols = results
      .filter((r) => r.parsed !== null)
      .flatMap((r) => r.parsed!.symbols);

    // Should have TypeScript symbols but no Python ones
    const symbolNames = allSymbols.map((s) => s.name);
    expect(symbolNames).toContain("greet");
    expect(symbolNames).not.toContain("calculate_average");
    expect(symbolNames).not.toContain("DataProcessor");
  });
});

// ── S01 boundary map contract verification ──

describe("S01 boundary map contract", () => {
  it("parseFile returns ParsedFile with correct shape", () => {
    const result = parseFile("test.ts", {
      source: "export function hello(): void {}",
    });
    expect(result).toHaveProperty("filePath");
    expect(result).toHaveProperty("language");
    expect(result).toHaveProperty("symbols");
    expect(result).toHaveProperty("relationships");
    expect(Array.isArray(result.symbols)).toBe(true);
    expect(Array.isArray(result.relationships)).toBe(true);
  });

  it("Symbol has all required fields for graph insertion", () => {
    const result = parseFile("test.ts", {
      source:
        '/** A greeting */\nexport function greet(name: string): string { return `Hello, ${name}!`; }',
    });
    const sym = result.symbols[0];

    // These fields are required by S02 → GraphStore.upsertSymbols()
    expect(sym.id).toBeDefined();
    expect(sym.name).toBe("greet");
    expect(sym.kind).toBe(SymbolKind.Function);
    expect(sym.filePath).toBe("test.ts");
    expect(sym.lineStart).toBeGreaterThan(0);
    expect(sym.lineEnd).toBeGreaterThanOrEqual(sym.lineStart);
    expect(sym.signature).toContain("function greet");
    expect(sym.docstring).toBe("A greeting");
    expect(sym.source).toBeDefined();
    expect(sym.exported).toBe(true);
  });

  it("all types are importable from types.ts", async () => {
    // Dynamic import to verify the module exports
    const types = await import("../src/types.js");
    expect(types.SymbolKind).toBeDefined();
    expect(types.RelationshipKind).toBeDefined();
    expect(types.DEFAULT_CONFIG).toBeDefined();
    expect(types.DEFAULT_EXCLUDES).toBeDefined();
  });

  it("config loader is importable and works", async () => {
    const { loadConfig } = await import("../src/config.js");
    const tmp = mkdtempSync(join(tmpdir(), "kata-boundary-"));
    const config = loadConfig(tmp);
    expect(config.languages).toBeDefined();
    expect(config.excludes).toBeDefined();
    expect(config.summaryThreshold).toBeDefined();
  });
});
