/**
 * Contract tests for MemoryStore CRUD + frontmatter round-trip.
 *
 * These tests define the acceptance boundary for R015 (memory operations)
 * before implementation exists. They should fail for missing implementation,
 * not harness errors.
 *
 * Slice: S03 — Persistent Memory + Git Audit
 * Task: T01 — Author memory contract tests (initially failing)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Dynamic import — module doesn't exist yet
async function loadMemoryStore(): Promise<Record<string, any> | null> {
  try {
    return await import("../../src/memory/store.js");
  } catch {
    return null;
  }
}

describe("MemoryStore contract (T01 red-first)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "kata-memory-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("exports MemoryStore class or factory", async () => {
    const mod = await loadMemoryStore();
    expect(mod).not.toBeNull();
    expect(
      typeof mod!.MemoryStore === "function" ||
        typeof mod!.createMemoryStore === "function",
    ).toBe(true);
  });

  it("remember() creates .kata/memory/<id>.md with YAML frontmatter", async () => {
    const mod = await loadMemoryStore();
    expect(mod).not.toBeNull();

    const store = mod!.MemoryStore
      ? new mod!.MemoryStore(tempDir)
      : mod!.createMemoryStore(tempDir);

    const entry = await store.remember({
      content: "The auth service uses JWT tokens with 24h expiry",
      category: "architecture",
      tags: ["auth", "jwt"],
      sourceRefs: ["src/auth/service.ts:42"],
    });

    expect(entry).toBeDefined();
    expect(entry.id).toBeDefined();
    expect(typeof entry.id).toBe("string");

    const filePath = join(tempDir, ".kata", "memory", `${entry.id}.md`);
    expect(existsSync(filePath)).toBe(true);

    const raw = readFileSync(filePath, "utf-8");
    expect(raw).toContain("---");
    expect(raw).toContain("id:");
    expect(raw).toContain("category: architecture");
    expect(raw).toContain("- auth");
    expect(raw).toContain("- jwt");
    expect(raw).toContain("createdAt:");
    expect(raw).toContain("sourceRefs:");
    expect(raw).toContain(
      "The auth service uses JWT tokens with 24h expiry",
    );
  });

  it("get(id) parses frontmatter and returns MemoryEntry", async () => {
    const mod = await loadMemoryStore();
    expect(mod).not.toBeNull();

    const store = mod!.MemoryStore
      ? new mod!.MemoryStore(tempDir)
      : mod!.createMemoryStore(tempDir);

    const created = await store.remember({
      content: "Database uses connection pooling with max 20 connections",
      category: "infrastructure",
      tags: ["database", "performance"],
      sourceRefs: ["src/db/pool.ts:10"],
    });

    const retrieved = await store.get(created.id);
    expect(retrieved).toBeDefined();
    expect(retrieved.id).toBe(created.id);
    expect(retrieved.content).toBe(
      "Database uses connection pooling with max 20 connections",
    );
    expect(retrieved.category).toBe("infrastructure");
    expect(retrieved.tags).toEqual(["database", "performance"]);
    expect(retrieved.sourceRefs).toEqual(["src/db/pool.ts:10"]);
    expect(retrieved.createdAt).toBeDefined();
  });

  it("list() enumerates all memories", async () => {
    const mod = await loadMemoryStore();
    expect(mod).not.toBeNull();

    const store = mod!.MemoryStore
      ? new mod!.MemoryStore(tempDir)
      : mod!.createMemoryStore(tempDir);

    await store.remember({
      content: "Memory A",
      category: "design",
      tags: ["a"],
    });
    await store.remember({
      content: "Memory B",
      category: "architecture",
      tags: ["b"],
    });

    const all = await store.list();
    expect(all).toHaveLength(2);
  });

  it("list() filters by category", async () => {
    const mod = await loadMemoryStore();
    expect(mod).not.toBeNull();

    const store = mod!.MemoryStore
      ? new mod!.MemoryStore(tempDir)
      : mod!.createMemoryStore(tempDir);

    await store.remember({
      content: "Design memory",
      category: "design",
      tags: [],
    });
    await store.remember({
      content: "Architecture memory",
      category: "architecture",
      tags: [],
    });

    const filtered = await store.list({ category: "design" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].category).toBe("design");
  });

  it("list() filters by tag", async () => {
    const mod = await loadMemoryStore();
    expect(mod).not.toBeNull();

    const store = mod!.MemoryStore
      ? new mod!.MemoryStore(tempDir)
      : mod!.createMemoryStore(tempDir);

    await store.remember({
      content: "Tagged A",
      category: "general",
      tags: ["important", "auth"],
    });
    await store.remember({
      content: "Tagged B",
      category: "general",
      tags: ["performance"],
    });

    const filtered = await store.list({ tag: "important" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].tags).toContain("important");
  });

  it("forget(id) deletes the memory file", async () => {
    const mod = await loadMemoryStore();
    expect(mod).not.toBeNull();

    const store = mod!.MemoryStore
      ? new mod!.MemoryStore(tempDir)
      : mod!.createMemoryStore(tempDir);

    const entry = await store.remember({
      content: "Temporary memory",
      category: "temp",
      tags: [],
    });

    await store.forget(entry.id);

    const filePath = join(tempDir, ".kata", "memory", `${entry.id}.md`);
    expect(existsSync(filePath)).toBe(false);

    const retrieved = await store.get(entry.id);
    expect(retrieved).toBeNull();
  });

  it("frontmatter round-trips correctly (write → read → identical fields)", async () => {
    const mod = await loadMemoryStore();
    expect(mod).not.toBeNull();

    const store = mod!.MemoryStore
      ? new mod!.MemoryStore(tempDir)
      : mod!.createMemoryStore(tempDir);

    const original = await store.remember({
      content: "Round-trip test content\nWith multiple lines",
      category: "test-category",
      tags: ["tag-one", "tag-two", "tag-three"],
      sourceRefs: ["src/file.ts:1", "src/other.ts:99"],
    });

    const retrieved = await store.get(original.id);
    expect(retrieved.id).toBe(original.id);
    expect(retrieved.content).toBe(
      "Round-trip test content\nWith multiple lines",
    );
    expect(retrieved.category).toBe("test-category");
    expect(retrieved.tags).toEqual(["tag-one", "tag-two", "tag-three"]);
    expect(retrieved.sourceRefs).toEqual([
      "src/file.ts:1",
      "src/other.ts:99",
    ]);
    expect(retrieved.createdAt).toBe(original.createdAt);
  });
});
