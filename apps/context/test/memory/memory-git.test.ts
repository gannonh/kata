/**
 * Contract tests for memory git audit trail.
 *
 * Tests that every memory mutation (remember, forget, consolidate) produces
 * a git commit with a deterministic message format. Uses temp git repos.
 *
 * Slice: S03 — Persistent Memory + Git Audit
 * Task: T01 — Author memory contract tests (initially failing)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTempGitRepo } from "../helpers/git-fixtures.js";

async function loadMemoryStore(): Promise<Record<string, any> | null> {
  try {
    return await import("../../src/memory/store.js");
  } catch {
    return null;
  }
}

function getLastCommitMessage(repoDir: string): string {
  return execSync("git log -1 --format=%s", {
    cwd: repoDir,
    encoding: "utf-8",
  }).trim();
}

function getCommitCount(repoDir: string): number {
  return parseInt(
    execSync("git rev-list --count HEAD", {
      cwd: repoDir,
      encoding: "utf-8",
    }).trim(),
    10,
  );
}

describe("memory git audit contract (T01 red-first)", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = createTempGitRepo("kata-memory-git-");
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("remember() produces a git commit with correct message format", async () => {
    const mod = await loadMemoryStore();
    expect(mod).not.toBeNull();

    const store = mod!.MemoryStore
      ? new mod!.MemoryStore(repoDir)
      : mod!.createMemoryStore(repoDir);

    const beforeCount = getCommitCount(repoDir);

    await store.remember({
      content: "The API uses rate limiting with 100 req/min",
      category: "architecture",
      tags: ["api"],
    });

    const afterCount = getCommitCount(repoDir);
    expect(afterCount).toBe(beforeCount + 1);

    const msg = getLastCommitMessage(repoDir);
    expect(msg).toMatch(/^kata-context: remember — /);
    expect(msg).toContain("The API uses rate limiting");
  });

  it("forget() produces a git commit with correct message format", async () => {
    const mod = await loadMemoryStore();
    expect(mod).not.toBeNull();

    const store = mod!.MemoryStore
      ? new mod!.MemoryStore(repoDir)
      : mod!.createMemoryStore(repoDir);

    const entry = await store.remember({
      content: "Temporary fact",
      category: "temp",
      tags: [],
    });

    await store.forget(entry.id);

    const msg = getLastCommitMessage(repoDir);
    expect(msg).toBe(`kata-context: forget — ${entry.id}`);
  });

  it("consolidate() produces a git commit with correct message format", async () => {
    const mod = await loadMemoryStore();
    expect(mod).not.toBeNull();

    const store = mod!.MemoryStore
      ? new mod!.MemoryStore(repoDir)
      : mod!.createMemoryStore(repoDir);

    const e1 = await store.remember({
      content: "Fact one",
      category: "design",
      tags: ["a"],
    });
    const e2 = await store.remember({
      content: "Fact two",
      category: "design",
      tags: ["b"],
    });

    await store.consolidate({
      memoryIds: [e1.id, e2.id],
      mergedContent: "Consolidated fact from one and two",
      category: "design",
      tags: ["a", "b"],
    });

    const msg = getLastCommitMessage(repoDir);
    expect(msg).toMatch(/^kata-context: consolidate — merged 2 memories$/);
  });

  it("non-git directory returns stable MEMORY_GIT_NOT_REPO error code", async () => {
    const mod = await loadMemoryStore();
    expect(mod).not.toBeNull();

    const nonGitDir = mkdtempSync(join(tmpdir(), "kata-no-git-"));

    const store = mod!.MemoryStore
      ? new mod!.MemoryStore(nonGitDir)
      : mod!.createMemoryStore(nonGitDir);

    try {
      await store.remember({
        content: "Should fail with git error",
        category: "test",
        tags: [],
      });
      // If no error thrown, the store may return an error result
      expect.unreachable("Expected an error for non-git directory");
    } catch (err: any) {
      expect(err.code).toBe("MEMORY_GIT_NOT_REPO");
    } finally {
      rmSync(nonGitDir, { recursive: true, force: true });
    }
  });
});
