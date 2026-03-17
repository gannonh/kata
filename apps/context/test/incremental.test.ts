/**
 * Tests for incremental indexing: git diff integration, path selection,
 * delete-then-insert, SHA behavior, and edge cases.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  indexProject,
  getCurrentSha,
  getChangedFiles,
  type FileChange,
  type IndexResult,
} from "../src/indexer.js";
import { GraphStore } from "../src/graph/store.js";
import {
  createTempGitRepo,
  commitFile,
  deleteAndCommit,
  renameAndCommit,
  headSha,
} from "./helpers/git-fixtures.js";

// ── Sample TypeScript source files ──

const TS_UTILS = `
export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}
`;

const TS_UTILS_V2 = `
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

const TS_SERVICE = `
import { add } from './utils';

export class Calculator {
  compute(a: number, b: number): number {
    return add(a, b);
  }
}
`;

const PY_HELPER = `
def greet(name: str) -> str:
    """Greet someone by name."""
    return f"Hello, {name}!"

class Greeter:
    def __init__(self, prefix: str):
        self.prefix = prefix

    def greet(self, name: str) -> str:
        return f"{self.prefix} {name}!"
`;

// ── Tests: getCurrentSha ──

describe("getCurrentSha", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = createTempGitRepo();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("returns the current HEAD SHA for a git repo", () => {
    const sha = getCurrentSha(repoDir);
    expect(sha).toBeTruthy();
    expect(sha!.length).toBe(40); // full SHA
    expect(/^[0-9a-f]{40}$/.test(sha!)).toBe(true);
  });

  it("returns null for a non-git directory", () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), "kata-nongit-"));
    try {
      const sha = getCurrentSha(nonGitDir);
      expect(sha).toBeNull();
    } finally {
      rmSync(nonGitDir, { recursive: true, force: true });
    }
  });
});

// ── Tests: getChangedFiles ──

describe("getChangedFiles", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = createTempGitRepo();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("detects added files", () => {
    const baseSha = headSha(repoDir);
    commitFile(repoDir, "utils.ts", TS_UTILS, "add utils");

    const changes = getChangedFiles(repoDir, baseSha);
    expect(changes).not.toBeNull();
    expect(changes!.length).toBe(1);
    expect(changes![0]).toEqual({ status: "added", filePath: "utils.ts" });
  });

  it("detects modified files", () => {
    commitFile(repoDir, "utils.ts", TS_UTILS, "add utils");
    const baseSha = headSha(repoDir);
    commitFile(repoDir, "utils.ts", TS_UTILS_V2, "modify utils");

    const changes = getChangedFiles(repoDir, baseSha);
    expect(changes).not.toBeNull();
    expect(changes!.length).toBe(1);
    expect(changes![0]).toEqual({ status: "modified", filePath: "utils.ts" });
  });

  it("detects deleted files", () => {
    commitFile(repoDir, "utils.ts", TS_UTILS, "add utils");
    const baseSha = headSha(repoDir);
    deleteAndCommit(repoDir, "utils.ts", "delete utils");

    const changes = getChangedFiles(repoDir, baseSha);
    expect(changes).not.toBeNull();
    expect(changes!.length).toBe(1);
    expect(changes![0]).toEqual({ status: "deleted", filePath: "utils.ts" });
  });

  it("detects renamed files", () => {
    commitFile(repoDir, "old-name.ts", TS_UTILS, "add old-name");
    const baseSha = headSha(repoDir);
    renameAndCommit(repoDir, "old-name.ts", "new-name.ts", "rename");

    const changes = getChangedFiles(repoDir, baseSha);
    expect(changes).not.toBeNull();
    expect(changes!.length).toBe(1);
    expect(changes![0].status).toBe("renamed");
    expect(changes![0].filePath).toBe("new-name.ts");
    expect(changes![0].oldPath).toBe("old-name.ts");
  });

  it("detects multiple changes", () => {
    commitFile(repoDir, "a.ts", TS_UTILS, "add a");
    commitFile(repoDir, "b.ts", TS_SERVICE, "add b");
    const baseSha = headSha(repoDir);

    commitFile(repoDir, "a.ts", TS_UTILS_V2, "modify a");
    commitFile(repoDir, "c.py", PY_HELPER, "add c");
    deleteAndCommit(repoDir, "b.ts", "delete b");

    const changes = getChangedFiles(repoDir, baseSha);
    expect(changes).not.toBeNull();
    expect(changes!.length).toBe(3);

    const statuses = new Set(changes!.map((c) => `${c.status}:${c.filePath}`));
    expect(statuses.has("modified:a.ts")).toBe(true);
    expect(statuses.has("added:c.py")).toBe(true);
    expect(statuses.has("deleted:b.ts")).toBe(true);
  });

  it("returns empty array when no changes", () => {
    commitFile(repoDir, "utils.ts", TS_UTILS, "add utils");
    const sha = headSha(repoDir);

    const changes = getChangedFiles(repoDir, sha);
    expect(changes).not.toBeNull();
    expect(changes!.length).toBe(0);
  });

  it("returns null for invalid SHA", () => {
    const changes = getChangedFiles(repoDir, "0000000000000000000000000000000000000000");
    expect(changes).toBeNull();
  });
});

// ── Tests: indexProject incremental path selection ──

describe("indexProject — path selection", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = createTempGitRepo();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("first index is always full and stores SHA", () => {
    commitFile(repoDir, "utils.ts", TS_UTILS, "add utils");

    const store = new GraphStore(":memory:");
    try {
      const result = indexProject(repoDir, { store });

      expect(result.incremental).toBe(false);
      expect(result.filesIndexed).toBe(1);
      expect(result.symbolsExtracted).toBeGreaterThan(0);

      // SHA should be stored
      const storedSha = store.getLastIndexedSha();
      expect(storedSha).toBeTruthy();
      expect(storedSha).toBe(headSha(repoDir));
    } finally {
      store.close();
    }
  });

  it("second index with changes uses incremental path", () => {
    commitFile(repoDir, "utils.ts", TS_UTILS, "add utils");

    const store = new GraphStore(":memory:");
    try {
      // First: full index
      const result1 = indexProject(repoDir, { store });
      expect(result1.incremental).toBe(false);

      // Add a new file
      commitFile(repoDir, "service.ts", TS_SERVICE, "add service");

      // Second: incremental
      const result2 = indexProject(repoDir, { store });
      expect(result2.incremental).toBe(true);
      expect(result2.changedFiles).toBe(1);
    } finally {
      store.close();
    }
  });

  it("second index with no changes returns immediately", () => {
    commitFile(repoDir, "utils.ts", TS_UTILS, "add utils");

    const store = new GraphStore(":memory:");
    try {
      indexProject(repoDir, { store });

      // No changes
      const result2 = indexProject(repoDir, { store });
      expect(result2.incremental).toBe(true);
      expect(result2.changedFiles).toBe(0);
      expect(result2.filesIndexed).toBe(0);
    } finally {
      store.close();
    }
  });

  it("full option forces full index even with existing SHA", () => {
    commitFile(repoDir, "utils.ts", TS_UTILS, "add utils");

    const store = new GraphStore(":memory:");
    try {
      // First: full index
      indexProject(repoDir, { store });

      // Second: force full
      const result2 = indexProject(repoDir, { store, full: true });
      expect(result2.incremental).toBe(false);
      expect(result2.filesIndexed).toBe(1);
    } finally {
      store.close();
    }
  });

  it("non-git directory always does full index", () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), "kata-nongit-"));
    try {
      writeFileSync(join(nonGitDir, "utils.ts"), TS_UTILS, "utf-8");

      const store = new GraphStore(":memory:");
      try {
        const result = indexProject(nonGitDir, { store });
        expect(result.incremental).toBe(false);
        expect(result.filesIndexed).toBe(1);

        // SHA should NOT be stored (no git)
        expect(store.getLastIndexedSha()).toBeNull();
      } finally {
        store.close();
      }
    } finally {
      rmSync(nonGitDir, { recursive: true, force: true });
    }
  });
});

// ── Tests: incremental change handling ──

describe("indexProject — incremental change handling", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = createTempGitRepo();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("modified file: old symbols replaced, new symbols present", () => {
    commitFile(repoDir, "utils.ts", TS_UTILS, "add utils");

    const store = new GraphStore(":memory:");
    try {
      indexProject(repoDir, { store });

      const symbolsBefore = store.getSymbolsByFile("utils.ts");
      const hasMultiply = symbolsBefore.some((s) => s.name === "multiply");
      expect(hasMultiply).toBe(false);

      // Modify: add multiply function
      commitFile(repoDir, "utils.ts", TS_UTILS_V2, "add multiply");

      const result = indexProject(repoDir, { store });
      expect(result.incremental).toBe(true);

      const symbolsAfter = store.getSymbolsByFile("utils.ts");
      const hasMultiplyAfter = symbolsAfter.some((s) => s.name === "multiply");
      expect(hasMultiplyAfter).toBe(true);

      // add and subtract should still be there
      expect(symbolsAfter.some((s) => s.name === "add")).toBe(true);
      expect(symbolsAfter.some((s) => s.name === "subtract")).toBe(true);
    } finally {
      store.close();
    }
  });

  it("added file: new symbols appear in graph", () => {
    commitFile(repoDir, "utils.ts", TS_UTILS, "add utils");

    const store = new GraphStore(":memory:");
    try {
      indexProject(repoDir, { store });

      // Add a Python file
      commitFile(repoDir, "helper.py", PY_HELPER, "add helper");

      const result = indexProject(repoDir, { store });
      expect(result.incremental).toBe(true);
      expect(result.changedFiles).toBe(1);

      const pySymbols = store.getSymbolsByFile("helper.py");
      expect(pySymbols.length).toBeGreaterThan(0);
      expect(pySymbols.some((s) => s.name === "greet")).toBe(true);

      // Original TS symbols still present
      const tsSymbols = store.getSymbolsByFile("utils.ts");
      expect(tsSymbols.some((s) => s.name === "add")).toBe(true);
    } finally {
      store.close();
    }
  });

  it("deleted file: symbols and edges removed from graph", () => {
    commitFile(repoDir, "utils.ts", TS_UTILS, "add utils");
    commitFile(repoDir, "service.ts", TS_SERVICE, "add service");

    const store = new GraphStore(":memory:");
    try {
      indexProject(repoDir, { store });

      // Verify service.ts symbols exist
      const serviceSymbols = store.getSymbolsByFile("service.ts");
      expect(serviceSymbols.length).toBeGreaterThan(0);

      // Delete service.ts
      deleteAndCommit(repoDir, "service.ts", "delete service");

      const result = indexProject(repoDir, { store });
      expect(result.incremental).toBe(true);
      expect(result.deletedFiles).toBe(1);

      // Service symbols gone
      const serviceSymbolsAfter = store.getSymbolsByFile("service.ts");
      expect(serviceSymbolsAfter.length).toBe(0);

      // Utils symbols still present
      const utilsSymbols = store.getSymbolsByFile("utils.ts");
      expect(utilsSymbols.some((s) => s.name === "add")).toBe(true);
    } finally {
      store.close();
    }
  });

  it("renamed file: old path gone, new path has symbols", () => {
    commitFile(repoDir, "old-utils.ts", TS_UTILS, "add old-utils");

    const store = new GraphStore(":memory:");
    try {
      indexProject(repoDir, { store });

      const oldSymbols = store.getSymbolsByFile("old-utils.ts");
      expect(oldSymbols.length).toBeGreaterThan(0);

      // Rename
      renameAndCommit(repoDir, "old-utils.ts", "new-utils.ts", "rename");

      const result = indexProject(repoDir, { store });
      expect(result.incremental).toBe(true);

      // Old path should be empty
      const oldSymbolsAfter = store.getSymbolsByFile("old-utils.ts");
      expect(oldSymbolsAfter.length).toBe(0);

      // New path should have symbols
      const newSymbols = store.getSymbolsByFile("new-utils.ts");
      expect(newSymbols.length).toBeGreaterThan(0);
      expect(newSymbols.some((s) => s.name === "add")).toBe(true);
    } finally {
      store.close();
    }
  });
});

// ── Tests: SHA persistence ──

describe("indexProject — SHA persistence", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = createTempGitRepo();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("full index stores SHA", () => {
    commitFile(repoDir, "utils.ts", TS_UTILS, "add utils");

    const store = new GraphStore(":memory:");
    try {
      expect(store.getLastIndexedSha()).toBeNull();

      indexProject(repoDir, { store });

      const storedSha = store.getLastIndexedSha();
      expect(storedSha).toBe(headSha(repoDir));
    } finally {
      store.close();
    }
  });

  it("incremental index updates SHA to current HEAD", () => {
    commitFile(repoDir, "utils.ts", TS_UTILS, "add utils");

    const store = new GraphStore(":memory:");
    try {
      indexProject(repoDir, { store });
      const sha1 = store.getLastIndexedSha();

      commitFile(repoDir, "service.ts", TS_SERVICE, "add service");
      const expectedSha2 = headSha(repoDir);

      indexProject(repoDir, { store });
      const sha2 = store.getLastIndexedSha();

      expect(sha2).toBe(expectedSha2);
      expect(sha2).not.toBe(sha1);
    } finally {
      store.close();
    }
  });

  it("force-full index updates SHA", () => {
    commitFile(repoDir, "utils.ts", TS_UTILS, "add utils");

    const store = new GraphStore(":memory:");
    try {
      indexProject(repoDir, { store });
      const sha1 = store.getLastIndexedSha();

      commitFile(repoDir, "service.ts", TS_SERVICE, "add service");

      indexProject(repoDir, { store, full: true });
      const sha2 = store.getLastIndexedSha();

      expect(sha2).toBe(headSha(repoDir));
      expect(sha2).not.toBe(sha1);
    } finally {
      store.close();
    }
  });

  it("no-change incremental run still advances SHA if HEAD moved", () => {
    commitFile(repoDir, "utils.ts", TS_UTILS, "add utils");

    const store = new GraphStore(":memory:");
    try {
      indexProject(repoDir, { store });

      // Non-code commit (e.g. README change)
      commitFile(repoDir, "README.md", "# Hello", "docs update");
      const newHead = headSha(repoDir);

      const result = indexProject(repoDir, { store });
      expect(result.incremental).toBe(true);
      expect(result.changedFiles).toBe(1); // README.md appears as added
      expect(store.getLastIndexedSha()).toBe(newHead);
    } finally {
      store.close();
    }
  });
});

// ── Tests: unsupported file filtering ──

describe("indexProject — unsupported file filtering", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = createTempGitRepo();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("incremental mode skips unsupported added files", () => {
    commitFile(repoDir, "utils.ts", TS_UTILS, "add utils");

    const store = new GraphStore(":memory:");
    try {
      indexProject(repoDir, { store });

      // Add a markdown file — should not be parsed
      commitFile(repoDir, "docs.md", "# Documentation", "add docs");

      const result = indexProject(repoDir, { store });
      expect(result.incremental).toBe(true);
      // changedFiles counts all git changes, but filesIndexed counts only parsed files
      expect(result.changedFiles).toBe(1);
      expect(result.filesIndexed).toBe(0); // .md is not supported
    } finally {
      store.close();
    }
  });
});

// ── Tests: edge cases ──

describe("indexProject — incremental edge cases", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = createTempGitRepo();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("handles multiple file changes in one incremental pass", () => {
    commitFile(repoDir, "a.ts", TS_UTILS, "add a");
    commitFile(repoDir, "b.ts", TS_SERVICE, "add b");
    commitFile(repoDir, "c.py", PY_HELPER, "add c");

    const store = new GraphStore(":memory:");
    try {
      indexProject(repoDir, { store });

      const statsBefore = store.getStats();
      expect(statsBefore.symbols).toBeGreaterThan(0);

      // Modify a, delete b, add d
      commitFile(repoDir, "a.ts", TS_UTILS_V2, "modify a");
      deleteAndCommit(repoDir, "b.ts", "delete b");
      commitFile(repoDir, "d.ts", 'export function double(n: number): number { return n * 2; }', "add d");

      const result = indexProject(repoDir, { store });
      expect(result.incremental).toBe(true);
      expect(result.changedFiles).toBe(3);

      // b.ts symbols gone
      expect(store.getSymbolsByFile("b.ts").length).toBe(0);

      // a.ts has multiply now
      const aSymbols = store.getSymbolsByFile("a.ts");
      expect(aSymbols.some((s) => s.name === "multiply")).toBe(true);

      // d.ts exists
      const dSymbols = store.getSymbolsByFile("d.ts");
      expect(dSymbols.length).toBeGreaterThan(0);

      // c.py untouched
      const cSymbols = store.getSymbolsByFile("c.py");
      expect(cSymbols.length).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });
});
