/**
 * End-to-end integration tests for S05: Incremental Indexing.
 *
 * Creates real temporary git repos, runs full and incremental indexing,
 * and validates:
 *   1. CLI --full flag forces full re-index
 *   2. Incremental graph correctness equals full re-index on same state
 *   3. Add/modify/delete/rename handling is correct end-to-end
 *   4. Single-file incremental performance < 2s
 *   5. SHA persistence across both paths
 */

import { rmSync } from "node:fs";
import { indexProject, type IndexResult } from "../src/indexer.js";
import { GraphStore } from "../src/graph/store.js";
import {
  createTempGitRepo,
  commitFile,
  deleteAndCommit,
  renameAndCommit,
  headSha,
} from "./helpers/git-fixtures.js";

// ── Snapshot helpers ──

/** Extract a sorted set of all symbol names from a GraphStore. */
function allSymbolNames(store: GraphStore): string[] {
  const stats = store.getStats();
  // Use the FTS search with a wildcard to get all — or use raw SQL via the store
  // We'll use the store's internal db if possible, but safer to rely on existing APIs
  // symbolsInFile won't help (we need all files). Use findSymbols or direct query.
  // GraphStore exposes db as a property — let's do a direct query.
  const rows = (store as any).db
    .prepare("SELECT name, kind, file_path, line_start FROM symbols ORDER BY name, file_path")
    .all() as Array<{ name: string; kind: string; file_path: string; line_start: number }>;
  return rows.map(
    (r) => `${r.name}:${r.kind}:${r.file_path}:${r.line_start}`,
  );
}

/** Extract a sorted set of all edges from a GraphStore. */
function allEdges(store: GraphStore): string[] {
  const rows = (store as any).db
    .prepare(
      `SELECT s.name as source_name, s.file_path as source_file,
              t.name as target_name, t.file_path as target_file,
              e.kind
       FROM edges e
       JOIN symbols s ON e.source_id = s.id
       JOIN symbols t ON e.target_id = t.id
       ORDER BY source_name, target_name, e.kind`,
    )
    .all() as Array<{
    source_name: string;
    source_file: string;
    target_name: string;
    target_file: string;
    kind: string;
  }>;
  return rows.map(
    (r) =>
      `${r.source_name}(${r.source_file})-[${r.kind}]->${r.target_name}(${r.target_file})`,
  );
}

// ── Fixture content ──

const UTILS_TS = `
export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}
`;

const UTILS_V2_TS = `
export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
`;

const SERVICE_TS = `
import { add } from './utils';

export class Calculator {
  compute(a: number, b: number): number {
    return add(a, b);
  }
}
`;

const HELPER_PY = `
def greet(name: str) -> str:
    """Greet someone by name."""
    return f"Hello, {name}!"

class Greeter:
    def __init__(self, prefix: str):
        self.prefix = prefix

    def greet(self, name: str) -> str:
        return f"{self.prefix} {name}!"
`;

const EXTRA_TS = `
export interface Config {
  debug: boolean;
  port: number;
}

export function createConfig(debug: boolean): Config {
  return { debug, port: 3000 };
}
`;

// ── Tests ──

describe("E2E Integration: --full flag", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = createTempGitRepo();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("--full forces full index even when previous SHA exists", () => {
    // Setup: create a file, do initial full index
    commitFile(repoDir, "utils.ts", UTILS_TS, "add utils");

    const store = new GraphStore(":memory:");
    try {
      const first = indexProject(repoDir, { store });
      expect(first.incremental).toBe(false);
      expect(first.filesIndexed).toBeGreaterThan(0);

      // SHA is now stored — without --full, next index would be incremental
      // Modify a file and commit
      commitFile(repoDir, "utils.ts", UTILS_V2_TS, "update utils");

      // Without full: should be incremental
      const incResult = indexProject(repoDir, { store });
      expect(incResult.incremental).toBe(true);

      // Now force full: should be full despite having stored SHA
      commitFile(repoDir, "utils.ts", UTILS_TS, "revert utils");
      const fullResult = indexProject(repoDir, { store, full: true });
      expect(fullResult.incremental).toBe(false);
      expect(fullResult.filesIndexed).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });

  it("--full re-indexes all files, not just changed ones", () => {
    commitFile(repoDir, "utils.ts", UTILS_TS, "add utils");
    commitFile(repoDir, "service.ts", SERVICE_TS, "add service");

    const store = new GraphStore(":memory:");
    try {
      // Initial full index
      const first = indexProject(repoDir, { store });
      expect(first.incremental).toBe(false);
      expect(first.filesIndexed).toBe(2);

      // Only modify one file
      commitFile(repoDir, "utils.ts", UTILS_V2_TS, "update utils");

      // Incremental would only process the changed file
      // But with --full, both files should be re-indexed
      const fullResult = indexProject(repoDir, { store, full: true });
      expect(fullResult.incremental).toBe(false);
      expect(fullResult.filesIndexed).toBe(2); // both files, not just changed one
    } finally {
      store.close();
    }
  });
});

describe("E2E Integration: incremental graph correctness", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = createTempGitRepo();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("incremental result graph equals full re-index graph after modify", () => {
    // Build up a repo with multiple files
    commitFile(repoDir, "utils.ts", UTILS_TS, "add utils");
    commitFile(repoDir, "service.ts", SERVICE_TS, "add service");

    // --- Incremental path ---
    const incStore = new GraphStore(":memory:");
    try {
      // Full baseline
      indexProject(repoDir, { store: incStore });

      // Modify one file
      commitFile(repoDir, "utils.ts", UTILS_V2_TS, "update utils");

      // Incremental update
      const incResult = indexProject(repoDir, { store: incStore });
      expect(incResult.incremental).toBe(true);

      const incSymbols = allSymbolNames(incStore);
      const incEdges = allEdges(incStore);

      // --- Full re-index path (from scratch on the same final state) ---
      const fullStore = new GraphStore(":memory:");
      try {
        const fullResult = indexProject(repoDir, {
          store: fullStore,
          full: true,
        });
        expect(fullResult.incremental).toBe(false);

        const fullSymbols = allSymbolNames(fullStore);
        const fullEdges = allEdges(fullStore);

        // Compare symbol sets
        expect(incSymbols).toEqual(fullSymbols);
        // Compare edge sets
        expect(incEdges).toEqual(fullEdges);
      } finally {
        fullStore.close();
      }
    } finally {
      incStore.close();
    }
  });

  it("incremental result graph equals full re-index after add", () => {
    commitFile(repoDir, "utils.ts", UTILS_TS, "add utils");

    const incStore = new GraphStore(":memory:");
    try {
      indexProject(repoDir, { store: incStore });

      // Add a new file
      commitFile(repoDir, "extra.ts", EXTRA_TS, "add extra");

      const incResult = indexProject(repoDir, { store: incStore });
      expect(incResult.incremental).toBe(true);

      const incSymbols = allSymbolNames(incStore);
      const incEdges = allEdges(incStore);

      const fullStore = new GraphStore(":memory:");
      try {
        indexProject(repoDir, { store: fullStore, full: true });
        const fullSymbols = allSymbolNames(fullStore);
        const fullEdges = allEdges(fullStore);

        expect(incSymbols).toEqual(fullSymbols);
        expect(incEdges).toEqual(fullEdges);
      } finally {
        fullStore.close();
      }
    } finally {
      incStore.close();
    }
  });

  it("incremental result graph equals full re-index after delete", () => {
    commitFile(repoDir, "utils.ts", UTILS_TS, "add utils");
    commitFile(repoDir, "extra.ts", EXTRA_TS, "add extra");

    const incStore = new GraphStore(":memory:");
    try {
      indexProject(repoDir, { store: incStore });

      // Delete one file
      deleteAndCommit(repoDir, "extra.ts", "delete extra");

      const incResult = indexProject(repoDir, { store: incStore });
      expect(incResult.incremental).toBe(true);

      const incSymbols = allSymbolNames(incStore);
      const incEdges = allEdges(incStore);

      const fullStore = new GraphStore(":memory:");
      try {
        indexProject(repoDir, { store: fullStore, full: true });
        const fullSymbols = allSymbolNames(fullStore);
        const fullEdges = allEdges(fullStore);

        expect(incSymbols).toEqual(fullSymbols);
        expect(incEdges).toEqual(fullEdges);
      } finally {
        fullStore.close();
      }
    } finally {
      incStore.close();
    }
  });

  it("incremental result graph equals full re-index after rename", () => {
    commitFile(repoDir, "old-utils.ts", UTILS_TS, "add old-utils");
    commitFile(repoDir, "service.ts", SERVICE_TS, "add service");

    const incStore = new GraphStore(":memory:");
    try {
      indexProject(repoDir, { store: incStore });

      // Rename
      renameAndCommit(repoDir, "old-utils.ts", "utils.ts", "rename utils");

      const incResult = indexProject(repoDir, { store: incStore });
      expect(incResult.incremental).toBe(true);

      const incSymbols = allSymbolNames(incStore);

      // Verify old path symbols are gone
      const oldPathSymbols = incSymbols.filter((s) =>
        s.includes("old-utils.ts"),
      );
      expect(oldPathSymbols).toHaveLength(0);

      // Verify new path symbols exist
      const newPathSymbols = incSymbols.filter((s) => s.includes("utils.ts"));
      expect(newPathSymbols.length).toBeGreaterThan(0);

      const fullStore = new GraphStore(":memory:");
      try {
        indexProject(repoDir, { store: fullStore, full: true });
        const fullSymbols = allSymbolNames(fullStore);

        expect(incSymbols).toEqual(fullSymbols);
      } finally {
        fullStore.close();
      }
    } finally {
      incStore.close();
    }
  });

  it("incremental result graph equals full re-index after multi-change", () => {
    commitFile(repoDir, "utils.ts", UTILS_TS, "add utils");
    commitFile(repoDir, "service.ts", SERVICE_TS, "add service");
    commitFile(repoDir, "extra.ts", EXTRA_TS, "add extra");

    const incStore = new GraphStore(":memory:");
    try {
      indexProject(repoDir, { store: incStore });

      // Multiple changes: modify one, delete another, add a new one
      commitFile(repoDir, "utils.ts", UTILS_V2_TS, "update utils");
      deleteAndCommit(repoDir, "extra.ts", "delete extra");
      commitFile(repoDir, "helper.py", HELPER_PY, "add helper");

      const incResult = indexProject(repoDir, { store: incStore });
      expect(incResult.incremental).toBe(true);

      const incSymbols = allSymbolNames(incStore);
      const incEdges = allEdges(incStore);

      const fullStore = new GraphStore(":memory:");
      try {
        indexProject(repoDir, { store: fullStore, full: true });
        const fullSymbols = allSymbolNames(fullStore);
        const fullEdges = allEdges(fullStore);

        expect(incSymbols).toEqual(fullSymbols);
        expect(incEdges).toEqual(fullEdges);
      } finally {
        fullStore.close();
      }
    } finally {
      incStore.close();
    }
  });
});

describe("E2E Integration: add/delete graph correctness", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = createTempGitRepo();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("added file symbols appear in graph after incremental run", () => {
    commitFile(repoDir, "utils.ts", UTILS_TS, "add utils");

    const store = new GraphStore(":memory:");
    try {
      indexProject(repoDir, { store });

      // Verify only utils symbols
      const beforeSymbols = allSymbolNames(store);
      expect(beforeSymbols.some((s) => s.startsWith("add:"))).toBe(true);
      expect(beforeSymbols.some((s) => s.startsWith("Config:"))).toBe(false);

      // Add a new file
      commitFile(repoDir, "extra.ts", EXTRA_TS, "add extra");
      const result = indexProject(repoDir, { store });
      expect(result.incremental).toBe(true);

      // Now Config and createConfig should be present
      const afterSymbols = allSymbolNames(store);
      expect(afterSymbols.some((s) => s.startsWith("Config:"))).toBe(true);
      expect(
        afterSymbols.some((s) => s.startsWith("createConfig:")),
      ).toBe(true);
    } finally {
      store.close();
    }
  });

  it("deleted file symbols and edges are absent after incremental run", () => {
    commitFile(repoDir, "utils.ts", UTILS_TS, "add utils");
    commitFile(repoDir, "extra.ts", EXTRA_TS, "add extra");

    const store = new GraphStore(":memory:");
    try {
      indexProject(repoDir, { store });

      // Verify extra symbols exist
      const beforeSymbols = allSymbolNames(store);
      expect(beforeSymbols.some((s) => s.startsWith("Config:"))).toBe(true);

      // Delete extra.ts
      deleteAndCommit(repoDir, "extra.ts", "delete extra");
      const result = indexProject(repoDir, { store });
      expect(result.incremental).toBe(true);

      // Config and createConfig should be gone
      const afterSymbols = allSymbolNames(store);
      expect(afterSymbols.some((s) => s.includes("extra.ts"))).toBe(false);
      // utils symbols should still be there
      expect(afterSymbols.some((s) => s.startsWith("add:"))).toBe(true);
    } finally {
      store.close();
    }
  });
});

describe("E2E Integration: SHA persistence", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = createTempGitRepo();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("full index stores baseline SHA required for incremental", () => {
    commitFile(repoDir, "utils.ts", UTILS_TS, "add utils");

    const store = new GraphStore(":memory:");
    try {
      // No SHA before first index
      expect(store.getLastIndexedSha()).toBeNull();

      indexProject(repoDir, { store });

      // SHA should be stored
      const sha = store.getLastIndexedSha();
      expect(sha).toBeTruthy();
      expect(sha!.length).toBe(40);
      expect(sha).toBe(headSha(repoDir));
    } finally {
      store.close();
    }
  });

  it("incremental index updates SHA to current HEAD", () => {
    commitFile(repoDir, "utils.ts", UTILS_TS, "add utils");

    const store = new GraphStore(":memory:");
    try {
      indexProject(repoDir, { store });
      const firstSha = store.getLastIndexedSha();

      commitFile(repoDir, "utils.ts", UTILS_V2_TS, "update utils");
      indexProject(repoDir, { store });
      const secondSha = store.getLastIndexedSha();

      expect(secondSha).not.toBe(firstSha);
      expect(secondSha).toBe(headSha(repoDir));
    } finally {
      store.close();
    }
  });

  it("--full index also updates SHA", () => {
    commitFile(repoDir, "utils.ts", UTILS_TS, "add utils");

    const store = new GraphStore(":memory:");
    try {
      indexProject(repoDir, { store });
      const firstSha = store.getLastIndexedSha();

      commitFile(repoDir, "utils.ts", UTILS_V2_TS, "update utils");
      indexProject(repoDir, { store, full: true });
      const secondSha = store.getLastIndexedSha();

      expect(secondSha).not.toBe(firstSha);
      expect(secondSha).toBe(headSha(repoDir));
    } finally {
      store.close();
    }
  });
});

describe("E2E Integration: performance", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = createTempGitRepo();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("single-file incremental completes within 2s", () => {
    // Create a small project with multiple files for a realistic baseline
    commitFile(repoDir, "utils.ts", UTILS_TS, "add utils");
    commitFile(repoDir, "service.ts", SERVICE_TS, "add service");
    commitFile(repoDir, "extra.ts", EXTRA_TS, "add extra");
    commitFile(repoDir, "helper.py", HELPER_PY, "add helper");

    const store = new GraphStore(":memory:");
    try {
      // Full baseline index
      indexProject(repoDir, { store });

      // Single file modification
      commitFile(repoDir, "utils.ts", UTILS_V2_TS, "update utils");

      // Measure incremental time
      const start = performance.now();
      const result = indexProject(repoDir, { store });
      const elapsed = performance.now() - start;

      expect(result.incremental).toBe(true);
      expect(result.changedFiles).toBe(1);
      expect(elapsed).toBeLessThan(2000); // < 2 seconds
    } finally {
      store.close();
    }
  });

  it("no-change incremental is near-instant", () => {
    commitFile(repoDir, "utils.ts", UTILS_TS, "add utils");
    commitFile(repoDir, "service.ts", SERVICE_TS, "add service");

    const store = new GraphStore(":memory:");
    try {
      indexProject(repoDir, { store });

      // No changes — should return immediately
      const start = performance.now();
      const result = indexProject(repoDir, { store });
      const elapsed = performance.now() - start;

      expect(result.incremental).toBe(true);
      expect(result.changedFiles).toBe(0);
      expect(result.filesIndexed).toBe(0);
      expect(elapsed).toBeLessThan(500); // Should be very fast
    } finally {
      store.close();
    }
  });
});

describe("E2E Integration: CLI --full option wiring", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = createTempGitRepo();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("indexProject full option propagates correctly", () => {
    commitFile(repoDir, "utils.ts", UTILS_TS, "add utils");

    const store = new GraphStore(":memory:");
    try {
      // First index (full, stores SHA)
      const first = indexProject(repoDir, { store });
      expect(first.incremental).toBe(false);
      expect(store.getLastIndexedSha()).toBeTruthy();

      // Default (no full option) — should be incremental since no changes
      const second = indexProject(repoDir, { store });
      expect(second.incremental).toBe(true);

      // full: true — should force full even though SHA exists
      const third = indexProject(repoDir, { store, full: true });
      expect(third.incremental).toBe(false);

      // full: false — should still be incremental
      const fourth = indexProject(repoDir, { store, full: false });
      expect(fourth.incremental).toBe(true);
    } finally {
      store.close();
    }
  });

  it("IndexResult metadata is correct for incremental runs", () => {
    commitFile(repoDir, "utils.ts", UTILS_TS, "add utils");
    commitFile(repoDir, "service.ts", SERVICE_TS, "add service");

    const store = new GraphStore(":memory:");
    try {
      const first = indexProject(repoDir, { store });
      expect(first.incremental).toBe(false);
      expect(first.changedFiles).toBeUndefined();
      expect(first.deletedFiles).toBeUndefined();

      // Modify one file
      commitFile(repoDir, "utils.ts", UTILS_V2_TS, "update utils");
      const second = indexProject(repoDir, { store });
      expect(second.incremental).toBe(true);
      expect(second.changedFiles).toBe(1);
      expect(second.deletedFiles).toBe(0);
      expect(second.filesIndexed).toBe(1); // only the modified file
    } finally {
      store.close();
    }
  });

  it("IndexResult metadata is correct for full runs", () => {
    commitFile(repoDir, "utils.ts", UTILS_TS, "add utils");
    commitFile(repoDir, "service.ts", SERVICE_TS, "add service");

    const store = new GraphStore(":memory:");
    try {
      const result = indexProject(repoDir, { store, full: true });
      expect(result.incremental).toBe(false);
      expect(result.filesIndexed).toBe(2);
      expect(result.symbolsExtracted).toBeGreaterThan(0);
      expect(result.edgesCreated).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe("number");
      expect(Array.isArray(result.errors)).toBe(true);
    } finally {
      store.close();
    }
  });
});

describe("E2E Integration: CLI Commander --full option", () => {
  it("program has --full option on index command", async () => {
    // Import the program and verify the option is registered
    const { program } = await import("../src/cli.js");
    const indexCmd = program.commands.find((c) => c.name() === "index");
    expect(indexCmd).toBeDefined();

    const options = indexCmd!.options;
    const fullOpt = options.find(
      (o) => o.long === "--full",
    );
    expect(fullOpt).toBeDefined();
    expect(fullOpt!.description).toBeTruthy();
  });
});
