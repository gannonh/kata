/**
 * Smoke tests for FileBackend.buildPrompt()
 *
 * Exercises every phase and dispatch override, verifying prompts are
 * non-empty and have no unresolved {{varName}} placeholders.
 * NOT snapshot-comparison tests — these guard against template
 * rendering failures, not content regressions.
 */

import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import { FileBackend } from "../file-backend.ts";
import type { KataState, Phase } from "../types.ts";

// ─── Fixture Setup ──────────────────────────────────────────────────────────

const UNRESOLVED_VAR_RE = /\{\{[a-zA-Z][a-zA-Z0-9_]*\}\}/;

function assertPromptValid(prompt: string, label: string): void {
  assert.ok(prompt.length > 0, `${label}: prompt is non-empty`);
  const match = prompt.match(UNRESOLVED_VAR_RE);
  assert.equal(match, null, `${label}: no unresolved vars (found ${match?.[0] ?? "none"})`);
}

function createFixture(): string {
  const base = mkdtempSync(join(tmpdir(), "kata-golden-"));

  // Initialize git repo so FileBackend constructor works
  execSync("git init --initial-branch=main", { cwd: base, stdio: "pipe" });
  execSync("git config user.email test@test.com", { cwd: base, stdio: "pipe" });
  execSync("git config user.name Test", { cwd: base, stdio: "pipe" });

  const kataDir = join(base, ".kata");
  const msDir = join(kataDir, "milestones");
  const m001Dir = join(msDir, "M001");
  const slicesDir = join(m001Dir, "slices");
  const s01Dir = join(slicesDir, "S01");
  const s02Dir = join(slicesDir, "S02");
  const tasksDir = join(s01Dir, "tasks");

  mkdirSync(tasksDir, { recursive: true });
  mkdirSync(s02Dir, { recursive: true });

  // Root kata files
  writeFileSync(
    join(kataDir, "PROJECT.md"),
    "# Test Project\n\nA test project for golden prompt tests.",
  );
  writeFileSync(
    join(kataDir, "REQUIREMENTS.md"),
    "# Requirements\n\n- REQ-01: The system must work.",
  );
  writeFileSync(
    join(kataDir, "DECISIONS.md"),
    "# Decisions\n\n- DEC-01: Use TypeScript for everything.",
  );
  writeFileSync(join(kataDir, "STATE.md"), "# State\n\nphase: executing");

  // Preferences file (needed for skill discovery)
  writeFileSync(
    join(kataDir, "preferences.md"),
    [
      "---",
      "skill_discovery: suggest",
      "---",
      "",
      "# Kata Preferences",
    ].join("\n"),
  );

  // Milestone files
  writeFileSync(
    join(m001Dir, "M001-CONTEXT.md"),
    [
      "---",
      "id: M001",
      "title: First Milestone",
      "status: active",
      "---",
      "",
      "# M001: First Milestone",
      "",
      "Build the core functionality.",
    ].join("\n"),
  );

  writeFileSync(
    join(m001Dir, "M001-ROADMAP.md"),
    [
      "# M001: First Milestone",
      "",
      "## Vision",
      "Build core features.",
      "",
      "## Success Criteria",
      "- Tests pass",
      "- Code compiles",
      "",
      "## Slices",
      "",
      "- [x] **S01 — First Slice** | risk: low | depends: none",
      "  - After this: basic functionality works",
      "- [ ] **S02 — Second Slice** | risk: medium | depends: S01",
      "  - After this: advanced features work",
      "",
      "## Boundary Map",
      "",
      "| From | To | Produces | Consumes |",
      "|------|------|----------|----------|",
      "| S01 | S02 | types.ts | nothing |",
    ].join("\n"),
  );

  writeFileSync(
    join(m001Dir, "M001-RESEARCH.md"),
    [
      "# M001 Research",
      "",
      "## Findings",
      "The codebase uses standard patterns.",
    ].join("\n"),
  );

  // Slice S01 files
  writeFileSync(
    join(s01Dir, "S01-PLAN.md"),
    [
      "# S01: First Slice",
      "",
      "## Goal",
      "Implement basic types and logic.",
      "",
      "## Demo",
      "Run tests and see them pass.",
      "",
      "## Must-haves",
      "- Type definitions compile",
      "- Logic passes tests",
      "",
      "## Tasks",
      "",
      "- [ ] **T01 — Define types** | ~30m",
      "  - Files: types.ts",
      "  - Verify: tsc --noEmit",
      "- [ ] **T02 — Implement logic** | ~1h",
      "  - Files: logic.ts",
      "  - Verify: npm test",
      "",
      "## Files likely touched",
      "- types.ts",
      "- logic.ts",
    ].join("\n"),
  );

  writeFileSync(
    join(s01Dir, "S01-RESEARCH.md"),
    [
      "# S01 Research",
      "",
      "## Approach",
      "Standard TypeScript patterns.",
    ].join("\n"),
  );

  writeFileSync(
    join(s01Dir, "S01-SUMMARY.md"),
    [
      "---",
      "id: S01",
      "parent: M001",
      "milestone: M001",
      "provides:",
      "  - core types",
      "requires: []",
      "affects:",
      "  - types.ts",
      "key_files:",
      "  - types.ts",
      "key_decisions:",
      "  - Use interfaces over classes",
      "patterns_established:",
      "  - Immutable data patterns",
      "drill_down_paths: []",
      "observability_surfaces: []",
      "duration: 1h",
      "verification_result: pass",
      "completed_at: '2025-01-01T00:00:00Z'",
      "blocker_discovered: false",
      "---",
      "",
      "# S01 Summary",
      "",
      "Implemented core types.",
      "",
      "## What Happened",
      "Defined TypeScript interfaces.",
      "",
      "## Deviations",
      "None.",
      "",
      "## Files Modified",
      "- `types.ts` — Core type definitions",
    ].join("\n"),
  );

  writeFileSync(
    join(s01Dir, "S01-UAT.md"),
    [
      "# S01 UAT",
      "",
      "## UAT Type",
      "- UAT mode: human-experience",
      "",
      "## Acceptance Criteria",
      "- Types compile without errors",
    ].join("\n"),
  );

  // Task files
  writeFileSync(
    join(tasksDir, "T01-PLAN.md"),
    [
      "# T01: Define types",
      "",
      "## Steps",
      "1. Create types.ts",
      "2. Define interfaces",
      "",
      "## Verification",
      "tsc --noEmit",
    ].join("\n"),
  );

  writeFileSync(
    join(tasksDir, "T01-SUMMARY.md"),
    [
      "---",
      "id: T01",
      "parent: S01",
      "milestone: M001",
      "provides:",
      "  - type definitions",
      "requires: []",
      "affects:",
      "  - types.ts",
      "key_files:",
      "  - types.ts",
      "key_decisions:",
      "  - Use readonly properties",
      "patterns_established:",
      "  - Strict type exports",
      "drill_down_paths: []",
      "observability_surfaces: []",
      "duration: 30m",
      "verification_result: pass",
      "completed_at: '2025-01-01T00:00:00Z'",
      "blocker_discovered: false",
      "---",
      "",
      "# T01 Summary",
      "",
      "Defined core types.",
      "",
      "## What Happened",
      "Created types.ts with interfaces.",
      "",
      "## Deviations",
      "None.",
      "",
      "## Files Modified",
      "- `types.ts` — Type definitions",
    ].join("\n"),
  );

  // Commit so git operations work
  execSync("git add -A", { cwd: base, stdio: "pipe" });
  execSync('git commit -m "fixture"', { cwd: base, stdio: "pipe" });

  return base;
}

// ─── State Factories ────────────────────────────────────────────────────────

function baseState(overrides: Partial<KataState> = {}): KataState {
  return {
    phase: "executing" as Phase,
    activeMilestone: { id: "M001", title: "First Milestone" },
    activeSlice: { id: "S01", title: "First Slice" },
    activeTask: { id: "T01", title: "Define types" },
    blockers: [],
    recentDecisions: [],
    nextAction: "Execute T01",
    registry: [{ id: "M001", title: "First Milestone", status: "active" as const }],
    progress: {
      milestones: { done: 0, total: 1 },
      slices: { done: 1, total: 2 },
      tasks: { done: 0, total: 2 },
    },
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("golden-prompts", () => {
  let basePath: string;
  let backend: FileBackend;

  beforeAll(() => {
    basePath = createFixture();
    backend = new FileBackend(basePath);
  });

  afterAll(() => {
    if (basePath) rmSync(basePath, { recursive: true, force: true });
  });

  // ── Phase prompts ─────────────────────────────────────────────────────────

  it("phase: executing", async () => {
    const state = baseState({ phase: "executing" });
    const prompt = await backend.buildPrompt("executing", state);
    assertPromptValid(prompt, "executing");
  });

  it("phase: verifying", async () => {
    const state = baseState({ phase: "verifying" });
    const prompt = await backend.buildPrompt("verifying", state);
    assertPromptValid(prompt, "verifying");
  });

  it("phase: planning", async () => {
    const state = baseState({ phase: "planning" });
    const prompt = await backend.buildPrompt("planning", state);
    assertPromptValid(prompt, "planning");
  });

  it("phase: pre-planning", async () => {
    const state = baseState({ phase: "pre-planning" });
    const prompt = await backend.buildPrompt("pre-planning", state);
    assertPromptValid(prompt, "pre-planning");
  });

  it("phase: summarizing", async () => {
    const state = baseState({ phase: "summarizing" });
    const prompt = await backend.buildPrompt("summarizing", state);
    assertPromptValid(prompt, "summarizing");
  });

  it("phase: completing-milestone", async () => {
    const state = baseState({
      phase: "completing-milestone",
      activeSlice: null,
      activeTask: null,
    });
    const prompt = await backend.buildPrompt("completing-milestone", state);
    assertPromptValid(prompt, "completing-milestone");
  });

  it("phase: replanning-slice", async () => {
    const state = baseState({
      phase: "replanning-slice",
      activeTask: { id: "T02", title: "Implement logic" },
    });
    const prompt = await backend.buildPrompt("replanning-slice", state);
    assertPromptValid(prompt, "replanning-slice");
  });

  // ── Dispatch overrides ────────────────────────────────────────────────────

  it("dispatch: research-milestone", async () => {
    const state = baseState({ phase: "pre-planning" });
    const prompt = await backend.buildPrompt("pre-planning", state, {
      dispatchResearch: "milestone",
    });
    assertPromptValid(prompt, "research-milestone");
  });

  it("dispatch: research-slice", async () => {
    const state = baseState({ phase: "planning" });
    const prompt = await backend.buildPrompt("planning", state, {
      dispatchResearch: "slice",
    });
    assertPromptValid(prompt, "research-slice");
  });

  it("dispatch: reassess-roadmap", async () => {
    const state = baseState({ phase: "summarizing" });
    const prompt = await backend.buildPrompt("summarizing", state, {
      reassessSliceId: "S01",
    });
    assertPromptValid(prompt, "reassess-roadmap");
  });

  it("dispatch: run-uat", async () => {
    const state = baseState({ phase: "summarizing" });
    const prompt = await backend.buildPrompt("summarizing", state, {
      uatSliceId: "S01",
    });
    assertPromptValid(prompt, "run-uat");
  });

  // ── buildDiscussPrompt ────────────────────────────────────────────────────

  it("buildDiscussPrompt", () => {
    const prompt = backend.buildDiscussPrompt(
      "M001",
      "Let's discuss milestone M001.",
    );
    assertPromptValid(prompt, "buildDiscussPrompt");
  });
});
