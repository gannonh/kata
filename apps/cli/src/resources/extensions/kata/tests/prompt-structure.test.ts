/**
 * Structural assertion tests for FileBackend and LinearBackend prompts.
 *
 * Verifies that prompts contain expected IDs, sections, tool references,
 * and workflow doc references without checking exact wording.
 */

import { describe, it, before, after } from "node:test";
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
import { LinearBackend, type LinearBackendConfig } from "../linear-backend.ts";
import type { KataState, Phase } from "../types.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────

const UNRESOLVED_VAR_RE = /\{\{[a-zA-Z][a-zA-Z0-9_]*\}\}/;

function assertNoUnresolvedVars(prompt: string, label: string): void {
  const match = prompt.match(UNRESOLVED_VAR_RE);
  assert.equal(match, null, `${label}: no unresolved vars (found ${match?.[0] ?? "none"})`);
}

function assertContains(prompt: string, needle: string, label: string): void {
  assert.ok(
    prompt.includes(needle),
    `${label}: expected prompt to contain "${needle}"`,
  );
}

function assertContainsOneOf(prompt: string, needles: string[], label: string): void {
  const found = needles.some((n) => prompt.includes(n));
  assert.ok(
    found,
    `${label}: expected prompt to contain one of [${needles.join(", ")}]`,
  );
}

// ─── Fixture Setup (FileBackend) ──────────────────────────────────────────

function createFixture(): string {
  const base = mkdtempSync(join(tmpdir(), "kata-struct-file-"));

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

  writeFileSync(
    join(kataDir, "PROJECT.md"),
    "# Test Project\n\nA test project.",
  );
  writeFileSync(
    join(kataDir, "REQUIREMENTS.md"),
    "# Requirements\n\n- REQ-01: Must work.",
  );
  writeFileSync(
    join(kataDir, "DECISIONS.md"),
    "# Decisions\n\n- DEC-01: Use TypeScript.",
  );
  writeFileSync(join(kataDir, "STATE.md"), "# State\n\nphase: executing");

  writeFileSync(
    join(kataDir, "preferences.md"),
    ["---", "skill_discovery: suggest", "---", "", "# Kata Preferences"].join("\n"),
  );

  writeFileSync(
    join(m001Dir, "M001-CONTEXT.md"),
    ["---", "id: M001", "title: Test Milestone", "status: active", "---", "", "# M001: Test Milestone", "", "Build core functionality."].join("\n"),
  );

  writeFileSync(
    join(m001Dir, "M001-ROADMAP.md"),
    [
      "# M001: Test Milestone", "",
      "## Vision", "Build core features.", "",
      "## Success Criteria", "- Tests pass", "",
      "## Slices", "",
      "- [x] **S01 — First Slice** | risk: low | depends: none",
      "  - After this: basic functionality works",
      "- [ ] **S02 — Second Slice** | risk: medium | depends: S01",
      "  - After this: advanced features work", "",
      "## Boundary Map", "",
      "| From | To | Produces | Consumes |",
      "|------|------|----------|----------|",
      "| S01 | S02 | types.ts | nothing |",
    ].join("\n"),
  );

  writeFileSync(
    join(m001Dir, "M001-RESEARCH.md"),
    ["# M001 Research", "", "## Findings", "Standard patterns."].join("\n"),
  );

  writeFileSync(
    join(s01Dir, "S01-PLAN.md"),
    [
      "# S01: First Slice", "",
      "## Goal", "Implement basic types.", "",
      "## Demo", "Run tests.", "",
      "## Must-haves", "- Types compile", "",
      "## Tasks", "",
      "- [ ] **T01 — Define types** | ~30m",
      "  - Files: types.ts",
      "  - Verify: tsc --noEmit",
      "- [ ] **T02 — Implement logic** | ~1h",
      "  - Files: logic.ts",
      "  - Verify: npm test", "",
      "## Files likely touched", "- types.ts",
    ].join("\n"),
  );

  writeFileSync(
    join(s01Dir, "S01-SUMMARY.md"),
    [
      "---", "id: S01", "parent: M001", "milestone: M001",
      "provides:", "  - core types", "requires: []",
      "affects:", "  - types.ts", "key_files:", "  - types.ts",
      "key_decisions:", "  - Use interfaces", "patterns_established:", "  - Immutable data",
      "drill_down_paths: []", "observability_surfaces: []",
      "duration: 1h", "verification_result: pass",
      "completed_at: '2025-01-01T00:00:00Z'", "blocker_discovered: false",
      "---", "", "# S01 Summary", "", "Implemented core types.",
    ].join("\n"),
  );

  writeFileSync(
    join(s01Dir, "S01-RESEARCH.md"),
    ["# S01 Research", "", "## Approach", "Standard patterns."].join("\n"),
  );

  writeFileSync(
    join(s01Dir, "S01-UAT.md"),
    ["# S01 UAT", "", "## UAT Type", "- UAT mode: human-experience", "", "## Acceptance Criteria", "- Types compile"].join("\n"),
  );

  writeFileSync(
    join(tasksDir, "T01-PLAN.md"),
    ["# T01: Define types", "", "## Steps", "1. Create types.ts", "", "## Verification", "tsc --noEmit"].join("\n"),
  );

  writeFileSync(
    join(tasksDir, "T01-SUMMARY.md"),
    [
      "---", "id: T01", "parent: S01", "milestone: M001",
      "provides:", "  - type definitions", "requires: []",
      "affects:", "  - types.ts", "key_files:", "  - types.ts",
      "key_decisions:", "  - Use readonly", "patterns_established:", "  - Strict exports",
      "drill_down_paths: []", "observability_surfaces: []",
      "duration: 30m", "verification_result: pass",
      "completed_at: '2025-01-01T00:00:00Z'", "blocker_discovered: false",
      "---", "", "# T01 Summary", "", "Defined core types.",
    ].join("\n"),
  );

  execSync("git add -A", { cwd: base, stdio: "pipe" });
  execSync('git commit -m "fixture"', { cwd: base, stdio: "pipe" });

  return base;
}

// ─── State Factory ────────────────────────────────────────────────────────

function baseState(overrides: Partial<KataState> = {}): KataState {
  return {
    phase: "executing" as Phase,
    activeMilestone: { id: "M001", title: "Test Milestone" },
    activeSlice: { id: "S01", title: "First Slice" },
    activeTask: { id: "T01", title: "Define types" },
    blockers: [],
    recentDecisions: [],
    nextAction: "Execute T01",
    registry: [{ id: "M001", title: "Test Milestone", status: "active" as const }],
    progress: {
      milestones: { done: 0, total: 1 },
      slices: { done: 1, total: 2 },
      tasks: { done: 1, total: 2 },
    },
    ...overrides,
  };
}

// ─── LinearBackend Config ─────────────────────────────────────────────────

const LINEAR_CONFIG: LinearBackendConfig = {
  apiKey: "test-key",
  projectId: "proj-123",
  teamId: "team-456",
  sliceLabelId: "label-789",
};

// ═══════════════════════════════════════════════════════════════════════════
// FileBackend Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("FileBackend prompt structure", () => {
  let basePath: string;
  let fb: FileBackend;

  before(() => {
    basePath = createFixture();
    fb = new FileBackend(basePath);
  });

  after(() => {
    if (basePath) rmSync(basePath, { recursive: true, force: true });
  });

  it("executing prompt contains milestone, slice, task IDs and title, no unresolved vars", async () => {
    const state = baseState({ phase: "executing" });
    const prompt = await fb.buildPrompt("executing", state);

    assertContains(prompt, "M001", "executing/milestoneId");
    assertContains(prompt, "S01", "executing/sliceId");
    assertContains(prompt, "T01", "executing/taskId");
    assertContains(prompt, "Define types", "executing/taskTitle");
    assertNoUnresolvedVars(prompt, "executing");
  });

  it("completing-milestone prompt contains milestone ID, title, Inlined Context, Milestone Roadmap, no unresolved vars", async () => {
    const state = baseState({
      phase: "completing-milestone",
      activeSlice: null,
      activeTask: null,
    });
    const prompt = await fb.buildPrompt("completing-milestone", state);

    assertContains(prompt, "M001", "completing-milestone/milestoneId");
    assertContains(prompt, "Test Milestone", "completing-milestone/milestoneTitle");
    assertContains(prompt, "Inlined Context", "completing-milestone/inlinedContext");
    assertContains(prompt, "Milestone Roadmap", "completing-milestone/roadmap");
    assertNoUnresolvedVars(prompt, "completing-milestone");
  });

  it("completing-milestone prompt contains commit instruction, STATE.md reference, SUMMARY reference", async () => {
    const state = baseState({
      phase: "completing-milestone",
      activeSlice: null,
      activeTask: null,
    });
    const prompt = await fb.buildPrompt("completing-milestone", state);

    assertContains(prompt, "git add -A && git commit", "completing-milestone/commitInstruction");
    assertContains(prompt, "STATE.md", "completing-milestone/stateRef");
    assertContains(prompt, "SUMMARY", "completing-milestone/summaryRef");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LinearBackend Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("LinearBackend prompt structure", () => {
  let lbBasePath: string;
  let lb: LinearBackend;

  before(() => {
    // LinearBackend needs a git repo at basePath for resolveGitRoot
    lbBasePath = mkdtempSync(join(tmpdir(), "kata-struct-linear-"));
    execSync("git init --initial-branch=main", { cwd: lbBasePath, stdio: "pipe" });
    execSync("git config user.email test@test.com", { cwd: lbBasePath, stdio: "pipe" });
    execSync("git config user.name Test", { cwd: lbBasePath, stdio: "pipe" });
    execSync('git commit --allow-empty -m "init"', { cwd: lbBasePath, stdio: "pipe" });
    lb = new LinearBackend(lbBasePath, LINEAR_CONFIG);
  });

  after(() => {
    if (lbBasePath) rmSync(lbBasePath, { recursive: true, force: true });
  });

  it("executing prompt contains M001, S01, T01, kata tool references, KATA-WORKFLOW.md", async () => {
    const state = baseState({ phase: "executing" });
    const prompt = await lb.buildPrompt("executing", state);

    assertContains(prompt, "M001", "linear-executing/M001");
    assertContains(prompt, "S01", "linear-executing/S01");
    assertContains(prompt, "T01", "linear-executing/T01");
    assertContainsOneOf(
      prompt,
      ["kata_derive_state", "kata_update_issue_state"],
      "linear-executing/kataTools",
    );
    assertContains(prompt, "KATA-WORKFLOW.md", "linear-executing/workflowDoc");
  });

  it("completing-milestone prompt contains M001, kata doc tool references", async () => {
    const state = baseState({
      phase: "completing-milestone",
      activeSlice: null,
      activeTask: null,
    });
    const prompt = await lb.buildPrompt("completing-milestone", state);

    assertContains(prompt, "M001", "linear-completing-milestone/M001");
    assertContainsOneOf(
      prompt,
      ["kata_write_document", "kata_read_document"],
      "linear-completing-milestone/kataDocTools",
    );
  });

  it("all non-empty prompts reference KATA-WORKFLOW.md", async () => {
    const phases: { phase: Phase; stateOverrides?: Partial<KataState> }[] = [
      { phase: "executing" },
      { phase: "planning" },
      { phase: "pre-planning" },
      { phase: "summarizing" },
      { phase: "completing-milestone", stateOverrides: { activeSlice: null, activeTask: null } },
      { phase: "replanning-slice" },
    ];

    for (const { phase, stateOverrides } of phases) {
      const state = baseState({ phase, ...stateOverrides });
      const prompt = await lb.buildPrompt(phase, state);
      assert.ok(prompt.length > 0, `${phase}: prompt is non-empty`);
      assertContains(prompt, "KATA-WORKFLOW.md", `linear-${phase}/workflowDoc`);
    }
  });
});
