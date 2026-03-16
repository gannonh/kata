import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { FileBackend } from "../file-backend.ts";
import type { KataBackend } from "../backend.ts";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.error(
      `  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function createTmpBase(): string {
  const base = mkdtempSync(join(tmpdir(), "kata-fb-test-"));
  mkdirSync(join(base, ".kata", "milestones"), { recursive: true });
  return base;
}

// ═══════════════════════════════════════════════════════════════════════════
// (a) FileBackend satisfies KataBackend interface (type check)
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== FileBackend: type check ===");
{
  const base = createTmpBase();
  const backend: KataBackend = new FileBackend(base);
  assert(typeof backend.deriveState === "function", "deriveState is a function");
  assert(typeof backend.readDocument === "function", "readDocument is a function");
  assert(typeof backend.writeDocument === "function", "writeDocument is a function");
  assert(typeof backend.documentExists === "function", "documentExists is a function");
  assert(typeof backend.listDocuments === "function", "listDocuments is a function");
  assert(typeof backend.buildPrompt === "function", "buildPrompt is a function");
  assert(typeof backend.buildDiscussPrompt === "function", "buildDiscussPrompt is a function");
  assert(typeof backend.bootstrap === "function", "bootstrap is a function");
  assert(typeof backend.checkMilestoneCreated === "function", "checkMilestoneCreated is a function");
  assert(typeof backend.loadDashboardData === "function", "loadDashboardData is a function");
  assert(typeof backend.preparePrContext === "function", "preparePrContext is a function");
  assert(backend.basePath === base, "basePath is set correctly");
  rmSync(base, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// (b) deriveState returns a valid KataState for empty project
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== FileBackend: deriveState ===");
{
  const base = createTmpBase();
  const backend = new FileBackend(base);
  const state = await backend.deriveState();
  assert(state != null, "state is not null");
  assertEq(state.phase, "pre-planning", "phase is pre-planning for empty project");
  assertEq(state.activeMilestone, null, "no active milestone");
  assertEq(state.activeSlice, null, "no active slice");
  assertEq(state.activeTask, null, "no active task");
  assert(Array.isArray(state.registry), "registry is an array");
  assert(Array.isArray(state.blockers), "blockers is an array");
  rmSync(base, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// (c) deriveState with non-existent basePath
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== FileBackend: deriveState with non-existent path ===");
{
  const backend = new FileBackend("/tmp/kata-nonexistent-" + Date.now());
  const state = await backend.deriveState();
  assert(state != null, "state is not null for non-existent path");
  assertEq(state.phase, "pre-planning", "phase is pre-planning");
  rmSync(backend.basePath, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// (d) documentExists returns false for missing documents
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== FileBackend: documentExists ===");
{
  const base = createTmpBase();
  const backend = new FileBackend(base);
  const exists = await backend.documentExists("PROJECT");
  assertEq(exists, false, "PROJECT does not exist in empty project");

  const existsMilestone = await backend.documentExists("M001-ROADMAP");
  assertEq(existsMilestone, false, "M001-ROADMAP does not exist");
  rmSync(base, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// (e) readDocument returns null for missing documents
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== FileBackend: readDocument ===");
{
  const base = createTmpBase();
  const backend = new FileBackend(base);
  const content = await backend.readDocument("PROJECT");
  assertEq(content, null, "readDocument returns null for missing PROJECT");

  const milestoneContent = await backend.readDocument("M001-CONTEXT");
  assertEq(milestoneContent, null, "readDocument returns null for missing milestone doc");
  rmSync(base, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// (f) readDocument reads existing root document
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== FileBackend: readDocument existing root doc ===");
{
  const base = createTmpBase();
  writeFileSync(join(base, ".kata", "PROJECT.md"), "# My Project\nHello");
  const backend = new FileBackend(base);
  const content = await backend.readDocument("PROJECT");
  assert(content != null, "readDocument returns content for existing PROJECT");
  assert(content!.includes("My Project"), "content includes project title");
  rmSync(base, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// (g) checkMilestoneCreated returns false for non-existent milestones
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== FileBackend: checkMilestoneCreated ===");
{
  const base = createTmpBase();
  const backend = new FileBackend(base);
  const created = await backend.checkMilestoneCreated("M001");
  assertEq(created, false, "M001 is not created in empty project");
  rmSync(base, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// (h) checkMilestoneCreated returns true when CONTEXT exists
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== FileBackend: checkMilestoneCreated with CONTEXT ===");
{
  const base = createTmpBase();
  const mDir = join(base, ".kata", "milestones", "M001");
  mkdirSync(mDir, { recursive: true });
  writeFileSync(join(mDir, "M001-CONTEXT.md"), "# M001 Context");
  const backend = new FileBackend(base);
  const created = await backend.checkMilestoneCreated("M001");
  assertEq(created, true, "M001 is created when CONTEXT exists");
  rmSync(base, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// (i) listDocuments returns empty for no active milestone
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== FileBackend: listDocuments ===");
{
  const base = createTmpBase();
  const backend = new FileBackend(base);
  const docs = await backend.listDocuments();
  assertEq(docs.length, 0, "no documents for empty project");
  rmSync(base, { recursive: true, force: true });
}

// ─── Summary ────────────────────────────────────────────────────────────

console.log(`\n✓ ${passed} passed, ✗ ${failed} failed\n`);
if (failed > 0) process.exit(1);
