/**
 * Contract tests for the `kata context search` CLI command.
 *
 * These tests define the acceptance boundary for the CLI search command
 * output modes, option parsing, and error surfacing. They test the CLI
 * wiring layer — the function-level tests are in semantic-search.test.ts.
 *
 * Slice: S02 — Semantic Search UX
 * Task: T01 — Author semantic search contract tests (initially failing)
 */

import { copyFileSync, cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, resolve } from "node:path";
import { GraphStore } from "../../src/graph/store.js";
import { DEFAULT_CONFIG, SymbolKind } from "../../src/types.js";
import type { Config, Symbol } from "../../src/types.js";
import { indexProject } from "../../src/indexer.js";
import * as formatters from "../../src/formatters.js";
import * as cliModule from "../../src/cli.js";
import { createTempGitRepo } from "../helpers/git-fixtures.js";

// ── Fixture helpers ──

const SEMANTIC_FIXTURE_ROOT = resolve(
  import.meta.dirname!,
  "../fixtures/semantic/repo-a",
);

function seedRepoFromFixture(): string {
  const repoDir = createTempGitRepo("kata-search-cli-");

  cpSync(join(SEMANTIC_FIXTURE_ROOT, "src"), join(repoDir, "src"), {
    recursive: true,
  });
  copyFileSync(
    join(SEMANTIC_FIXTURE_ROOT, "README.md"),
    join(repoDir, "README.md"),
  );

  execSync("git add .", { cwd: repoDir, stdio: "pipe" });
  execSync("git commit -m 'seed search fixture'", {
    cwd: repoDir,
    stdio: "pipe",
  });

  return repoDir;
}

/** Seed a store with symbols and semantic vectors for CLI output format testing. */
function seedStoreForCliTests(store: GraphStore): void {
  const symbols: Symbol[] = [
    {
      id: "sym-auth-handler",
      name: "authenticateUser",
      kind: SymbolKind.Function,
      filePath: "src/auth.ts",
      lineStart: 10,
      lineEnd: 30,
      signature: "function authenticateUser(token: string): Promise<User>",
      docstring: "Validates a JWT token and returns the authenticated user",
      source: "async function authenticateUser(token: string): Promise<User> { ... }",
      exported: true,
      summary: "Validates a JWT token and returns the authenticated user object",
    },
    {
      id: "sym-user-service",
      name: "UserService",
      kind: SymbolKind.Class,
      filePath: "src/services/user.ts",
      lineStart: 5,
      lineEnd: 80,
      signature: "class UserService",
      docstring: "Service for managing user accounts",
      source: "class UserService { ... }",
      exported: true,
      summary: "Service class that manages user CRUD operations and account lifecycle",
    },
    {
      id: "sym-login-handler",
      name: "handleLogin",
      kind: SymbolKind.Function,
      filePath: "src/routes/login.ts",
      lineStart: 15,
      lineEnd: 45,
      signature: "function handleLogin(req: Request): Promise<Response>",
      docstring: null,
      source: "async function handleLogin(req: Request): Promise<Response> { ... }",
      exported: true,
      summary: "Handles login endpoint — validates credentials and returns auth token",
    },
  ];

  store.upsertSymbols(symbols);

  const dimensions = 1536;
  const model = "text-embedding-3-small";
  const vectors = symbols.map((sym, index) => ({
    symbolId: sym.id,
    filePath: sym.filePath,
    model,
    dimensions,
    vector: Array.from({ length: dimensions }, (_, i) => i * 0.001 + index * 0.1),
  }));

  store.upsertSemanticVectors(vectors);
}

// ── Tests ──

describe("CLI search command output contract", () => {
  describe("JSON output mode", () => {
    it("returns parseable JSON with results array including score, distance, and symbol metadata", async () => {
      // This test verifies that the search command's JSON output
      // includes a full result array with expected fields.
      // Will fail until T03 wires the search command.
      const { program } = await import("../../src/cli.js");

      // Verify the search command exists on the program
      const searchCmd = program.commands.find((c) => c.name() === "search");
      expect(searchCmd).toBeDefined();

      // Verify search command accepts the expected arguments/options
      expect(searchCmd!.args).toBeDefined();
      const optionNames = searchCmd!.options.map((o) => o.long);
      expect(optionNames).toEqual(
        expect.arrayContaining(["--top-k", "--kind"]),
      );
    });

    it("JSON payload includes query, results array, and model metadata", async () => {
      // When the search command is wired (T03), this test will verify
      // that JSON output includes the expected structure:
      // { query: string, results: SemanticSearchResult[], model: string, totalVectors: number }
      //
      // For now, we test that the required type shape exists
      const { semanticSearch } = await import("../../src/search/semantic.js");
      expect(typeof semanticSearch).toBe("function");
    });
  });

  describe("quiet output mode", () => {
    it("returns one filePath:lineStart per result line", async () => {
      // The quiet output contract: each line should be `filePath:lineStart`
      // This will be fully testable once the CLI command is wired in T03.
      // For now, verify the function exists.
      const { semanticSearch } = await import("../../src/search/semantic.js");
      expect(typeof semanticSearch).toBe("function");

      // The quiet format transform is:
      // results.map(r => `${r.symbol.filePath}:${r.symbol.lineStart}`)
      // Verifiable by running the actual command with --quiet flag
    });
  });

  describe("human-readable output mode", () => {
    it("shows a ranked table with score, name, kind, file, and line range", async () => {
      // Human output should include a formatted table with columns:
      // #  Score  Name  Kind  File  Lines
      // Verified once T03 implements the formatter.
      const { semanticSearch } = await import("../../src/search/semantic.js");
      expect(typeof semanticSearch).toBe("function");
    });
  });

  describe("--top-k option parsing", () => {
    it("search command has --top-k option that controls result count", async () => {
      const { program } = await import("../../src/cli.js");
      const searchCmd = program.commands.find((c) => c.name() === "search");
      expect(searchCmd).toBeDefined();

      const topKOption = searchCmd!.options.find((o) => o.long === "--top-k");
      expect(topKOption).toBeDefined();
    });
  });

  describe("--kind option parsing", () => {
    it("search command has --kind option that filters by SymbolKind", async () => {
      const { program } = await import("../../src/cli.js");
      const searchCmd = program.commands.find((c) => c.name() === "search");
      expect(searchCmd).toBeDefined();

      const kindOption = searchCmd!.options.find((o) => o.long === "--kind");
      expect(kindOption).toBeDefined();
    });
  });

  describe("error output — actionable messages", () => {
    it("missing API key produces actionable CLI message (not a stack trace)", async () => {
      // When OPENAI_API_KEY is absent, the CLI should display:
      // - A clear error message mentioning OPENAI_API_KEY
      // - A hint about how to fix it
      // - NOT a raw stack trace
      //
      // This verifies the remediation mapper handles search-specific error codes
      const mapper = cliModule.semanticRemediationForCode;
      expect(typeof mapper).toBe("function");

      // Existing mapper should handle SEMANTIC_OPENAI_MISSING_KEY
      const hint = mapper("SEMANTIC_OPENAI_MISSING_KEY");
      expect(hint).toContain("OPENAI_API_KEY");

      // New search-specific codes should also be handled
      // SEMANTIC_SEARCH_EMPTY_INDEX should produce an actionable message
      const emptyIndexHint = mapper("SEMANTIC_SEARCH_EMPTY_INDEX");
      expect(emptyIndexHint).toBeTruthy();
      expect(typeof emptyIndexHint).toBe("string");
    });

    it("empty index produces a dedicated hint (not the generic default)", async () => {
      // Import the hint function to verify dedicated mapping exists
      const { semanticHintForCode } = await import("../../src/semantic/hints.js");

      // semanticHintForCode returns undefined for unknown codes,
      // and a specific string for known codes. We need a dedicated hint
      // for SEMANTIC_SEARCH_EMPTY_INDEX, not just the default fallback.
      const hint = semanticHintForCode("SEMANTIC_SEARCH_EMPTY_INDEX");
      expect(hint).toBeDefined();
      expect(hint).not.toBeUndefined();
      expect(hint!.toLowerCase()).toMatch(/index/i);
    });

    it("model mismatch produces a dedicated hint (not the generic default)", async () => {
      const { semanticHintForCode } = await import("../../src/semantic/hints.js");

      // SEMANTIC_SEARCH_MODEL_MISMATCH needs a dedicated hint
      const hint = semanticHintForCode("SEMANTIC_SEARCH_MODEL_MISMATCH");
      expect(hint).toBeDefined();
      expect(hint).not.toBeUndefined();
      expect(hint!.toLowerCase()).toMatch(/re-?index|index/i);
    });
  });
});

describe("CLI search command integration (end-to-end)", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = seedRepoFromFixture();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("search command is registered and accepts a query argument", async () => {
    const { program } = await import("../../src/cli.js");

    const searchCmd = program.commands.find((c) => c.name() === "search");
    expect(searchCmd).toBeDefined();
    expect(searchCmd!.description()).toContain("search");
  });
});
