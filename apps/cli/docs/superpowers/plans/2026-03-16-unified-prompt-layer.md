# Unified Prompt Layer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both FileBackend and LinearBackend use the same `.md` prompt templates via `loadPrompt()`, eliminating 420 lines of inline prompt strings from LinearBackend.

**Architecture:** Three backend-injected template variables (`{{backendRules}}`, `{{backendOps}}`, `{{backendMustComplete}}`) replace all hardcoded I/O instructions in templates. Each backend's `buildPrompt()` gathers content vars, builds an ops block, and calls `loadPrompt()`. No assembler module.

**Tech Stack:** TypeScript, Node.js built-in test runner (`node --test`), `.md` prompt templates with `{{var}}` substitution.

**Spec:** `docs/superpowers/specs/2026-03-16-unified-prompt-layer-design.md`

---

## Chunk 1: Test Infrastructure + Golden Snapshots

### Task 1: Add OpsBlock type to backend.ts

**Files:**
- Modify: `src/resources/extensions/kata/backend.ts:18-22`

- [ ] **Step 1: Add the OpsBlock interface**

Add after the `PromptOptions` interface (line 22). Use `OpsBlock` as the return type annotation on all `_build*Ops` methods in both backends:

```typescript
/** Backend-specific operation instructions injected into prompt templates. */
export interface OpsBlock {
  /** Hard constraints (e.g. "never use bash for artifacts"). Empty string if none. */
  backendRules: string;
  /** All read/write/advance/commit operations as a single block. */
  backendOps: string;
  /** Must-complete assertion for end of prompt. */
  backendMustComplete: string;
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd /Volumes/EVO/kata/kata-mono.worktrees/wt-cli/apps/cli && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `OpsBlock`

- [ ] **Step 3: Commit**

```bash
git add src/resources/extensions/kata/backend.ts
git commit -m "feat: add OpsBlock type to KataBackend interface"
```

---

### Task 2: Golden snapshot test for FileBackend prompts

Captures the current file-backend `buildPrompt()` output for every phase before any template changes. This is the regression safety net.

**Files:**
- Create: `src/resources/extensions/kata/tests/golden-prompts.test.ts`

- [ ] **Step 1: Write the golden snapshot capture test**

```typescript
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import { FileBackend } from "../file-backend.ts";
import type { KataState } from "../types.ts";

// ─── Fixture Setup ───────────────────────────────────────────────────────────

function createFixtureProject(): string {
  const base = mkdtempSync(join(tmpdir(), "kata-golden-"));
  const kataDir = join(base, ".kata");
  const mDir = join(kataDir, "milestones", "M001");
  const sliceDir = join(mDir, "slices", "S01");
  const taskDir = join(sliceDir, "tasks");

  mkdirSync(taskDir, { recursive: true });
  mkdirSync(join(mDir, "slices", "S02", "tasks"), { recursive: true });

  // Root kata files
  writeFileSync(join(kataDir, "PROJECT.md"), "# Test Project\nA test project for golden snapshots.");
  writeFileSync(join(kataDir, "REQUIREMENTS.md"), "# Requirements\n- R001: Must work");
  writeFileSync(join(kataDir, "DECISIONS.md"), "# Decisions\n| ID | Decision |\n|---|---|\n| D001 | Use TypeScript |");
  writeFileSync(join(kataDir, "STATE.md"), "phase: executing\nmilestone: M001\nslice: S01\ntask: T01");

  // Milestone files
  writeFileSync(join(mDir, "M001-CONTEXT.md"), "# M001 Context\nBuild the core system.");
  writeFileSync(join(mDir, "M001-ROADMAP.md"), [
    "# M001: Test Milestone",
    "",
    "## Vision",
    "Build a working system.",
    "",
    "## Success Criteria",
    "- All tests pass",
    "",
    "## Slices",
    "",
    "- [x] **S01 — First Slice** | risk: low | depends: none",
    "  - After this: basic functionality works",
    "- [ ] **S02 — Second Slice** | risk: medium | depends: S01",
    "  - After this: advanced features work",
    "",
    "## Boundary Map",
    "| From | To | Produces | Consumes |",
    "|------|-----|----------|----------|",
    "| S01 | S02 | core types | nothing |",
  ].join("\n"));
  writeFileSync(join(mDir, "M001-RESEARCH.md"), "# M001 Research\nFindings here.");

  // Slice files
  writeFileSync(join(sliceDir, "S01-PLAN.md"), [
    "# S01: First Slice",
    "",
    "## Goal",
    "Implement core functionality.",
    "",
    "## Demo",
    "Basic functionality works.",
    "",
    "## Must-Haves",
    "- Core types defined",
    "",
    "## Tasks",
    "",
    "- [ ] **T01 — Define types** | ~30m",
    "  - Files: types.ts",
    "  - Verify: tsc --noEmit",
    "- [ ] **T02 — Implement logic** | ~1h",
    "  - Files: logic.ts",
    "  - Verify: npm test",
  ].join("\n"));
  writeFileSync(join(sliceDir, "S01-RESEARCH.md"), "# S01 Research\nSlice research.");
  writeFileSync(join(sliceDir, "S01-SUMMARY.md"), "# S01 Summary\nSlice completed successfully.");
  writeFileSync(join(sliceDir, "S01-UAT.md"), "# S01 UAT\n- [ ] Check core types work");

  // Task files
  writeFileSync(join(taskDir, "T01-PLAN.md"), "# T01: Define types\nCreate the core type definitions.");
  writeFileSync(join(taskDir, "T01-SUMMARY.md"), "# T01 Summary\nTypes defined.");

  return base;
}

function makeFileState(overrides?: Partial<KataState>): KataState {
  return {
    phase: "executing",
    activeMilestone: { id: "M001", title: "Test Milestone" },
    activeSlice: { id: "S01", title: "First Slice" },
    activeTask: { id: "T01", title: "Define types" },
    blockers: [],
    recentDecisions: [],
    nextAction: "Execute T01",
    registry: [
      { id: "M001", title: "Test Milestone", status: "active" },
    ],
    progress: {
      milestones: { done: 0, total: 1 },
      slices: { done: 1, total: 2 },
      tasks: { done: 1, total: 2 },
    },
    ...overrides,
  };
}

// ─── Snapshot Helpers ────────────────────────────────────────────────────────

/** Verify prompt is non-empty and has no unresolved {{vars}}. */
function assertValidPrompt(prompt: string, label: string): void {
  assert.ok(prompt.length > 0, `${label}: prompt is non-empty`);
  const unresolved = prompt.match(/\{\{[a-zA-Z][a-zA-Z0-9_]*\}\}/g);
  assert.equal(unresolved, null, `${label}: no unresolved vars, found: ${unresolved?.join(", ")}`);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("FileBackend golden prompt snapshots", () => {
  let base: string;
  let backend: FileBackend;

  before(() => {
    base = createFixtureProject();
    backend = new FileBackend(base);
  });

  after(() => {
    rmSync(base, { recursive: true, force: true });
  });

  const phases: Array<{ phase: string; state: Partial<KataState>; options?: Record<string, string> }> = [
    { phase: "executing", state: {} },
    { phase: "verifying", state: { phase: "verifying" } },
    { phase: "planning", state: { phase: "planning", activeTask: null } },
    { phase: "pre-planning", state: { phase: "pre-planning", activeSlice: null, activeTask: null } },
    { phase: "summarizing", state: { phase: "summarizing", activeTask: null } },
    { phase: "completing-milestone", state: { phase: "completing-milestone", activeSlice: null, activeTask: null } },
    { phase: "replanning-slice", state: { phase: "replanning-slice", activeTask: { id: "T01", title: "Define types" } } },
  ];

  for (const { phase, state, options } of phases) {
    it(`captures ${phase} prompt`, async () => {
      const s = makeFileState({ phase: phase as any, ...state });
      const prompt = await backend.buildPrompt(s.phase, s, options as any);
      assertValidPrompt(prompt, phase);
    });
  }

  // Dispatch-time overrides
  it("captures research-milestone prompt", async () => {
    const s = makeFileState({ phase: "pre-planning", activeSlice: null, activeTask: null });
    const prompt = await backend.buildPrompt(s.phase, s, { dispatchResearch: "milestone" });
    assertValidPrompt(prompt, "research-milestone");
  });

  it("captures research-slice prompt", async () => {
    const s = makeFileState({ phase: "planning", activeTask: null });
    const prompt = await backend.buildPrompt(s.phase, s, { dispatchResearch: "slice" });
    assertValidPrompt(prompt, "research-slice");
  });

  it("captures reassess-roadmap prompt", async () => {
    const s = makeFileState();
    const prompt = await backend.buildPrompt(s.phase, s, { reassessSliceId: "S01" });
    assertValidPrompt(prompt, "reassess-roadmap");
  });

  it("captures run-uat prompt", async () => {
    const s = makeFileState();
    const prompt = await backend.buildPrompt(s.phase, s, { uatSliceId: "S01" });
    assertValidPrompt(prompt, "run-uat");
  });

  it("captures discuss prompt", () => {
    const prompt = backend.buildDiscussPrompt("M001", "New project.");
    assertValidPrompt(prompt, "discuss");
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `cd /Volumes/EVO/kata/kata-mono.worktrees/wt-cli/apps/cli && node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/golden-prompts.test.ts 2>&1 | tail -20`
Expected: All tests PASS. Every phase produces a valid, non-empty prompt with no unresolved vars.

- [ ] **Step 3: Commit**

```bash
git add src/resources/extensions/kata/tests/golden-prompts.test.ts
git commit -m "test: add golden prompt snapshot tests for FileBackend"
```

---

### Task 3: Structural assertion tests for both backends

**Files:**
- Create: `src/resources/extensions/kata/tests/prompt-structure.test.ts`

- [ ] **Step 1: Write structural assertion tests**

```typescript
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import { FileBackend } from "../file-backend.ts";
import { LinearBackend, type LinearBackendConfig } from "../linear-backend.ts";
import type { KataState } from "../types.ts";

// ─── Reuse fixture setup from golden-prompts.test.ts ─────────────────────────
// (Copy createFixtureProject and makeFileState here, or extract to shared util)

function createFixtureProject(): string {
  const base = mkdtempSync(join(tmpdir(), "kata-struct-"));
  const kataDir = join(base, ".kata");
  const mDir = join(kataDir, "milestones", "M001");
  const sliceDir = join(mDir, "slices", "S01");
  const taskDir = join(sliceDir, "tasks");

  mkdirSync(taskDir, { recursive: true });
  mkdirSync(join(mDir, "slices", "S02", "tasks"), { recursive: true });

  writeFileSync(join(kataDir, "PROJECT.md"), "# Test Project\nA test project.");
  writeFileSync(join(kataDir, "REQUIREMENTS.md"), "# Requirements\n- R001: Must work");
  writeFileSync(join(kataDir, "DECISIONS.md"), "# Decisions\n| ID | Decision |\n|---|---|\n| D001 | Use TypeScript |");
  writeFileSync(join(kataDir, "STATE.md"), "phase: executing\nmilestone: M001\nslice: S01\ntask: T01");
  writeFileSync(join(mDir, "M001-CONTEXT.md"), "# M001 Context\nBuild the core system.");
  writeFileSync(join(mDir, "M001-ROADMAP.md"), [
    "# M001: Test Milestone", "", "## Vision", "Build a working system.", "",
    "## Success Criteria", "- All tests pass", "",
    "## Slices", "",
    "- [x] **S01 — First Slice** | risk: low | depends: none",
    "  - After this: basic functionality works",
    "- [ ] **S02 — Second Slice** | risk: medium | depends: S01",
    "  - After this: advanced features work", "",
    "## Boundary Map",
    "| From | To | Produces | Consumes |",
    "|------|-----|----------|----------|",
    "| S01 | S02 | core types | nothing |",
  ].join("\n"));
  writeFileSync(join(mDir, "M001-RESEARCH.md"), "# M001 Research\nFindings.");
  writeFileSync(join(sliceDir, "S01-PLAN.md"), [
    "# S01: First Slice", "", "## Goal", "Implement core.", "", "## Demo", "Works.", "",
    "## Must-Haves", "- Core types", "", "## Tasks", "",
    "- [ ] **T01 — Define types** | ~30m", "  - Files: types.ts", "  - Verify: tsc --noEmit",
    "- [ ] **T02 — Implement logic** | ~1h", "  - Files: logic.ts", "  - Verify: npm test",
  ].join("\n"));
  writeFileSync(join(sliceDir, "S01-RESEARCH.md"), "# S01 Research\nSlice research.");
  writeFileSync(join(sliceDir, "S01-SUMMARY.md"), "# S01 Summary\nDone.");
  writeFileSync(join(sliceDir, "S01-UAT.md"), "# S01 UAT\n- [ ] Check it");
  writeFileSync(join(taskDir, "T01-PLAN.md"), "# T01: Define types\nCore types.");
  writeFileSync(join(taskDir, "T01-SUMMARY.md"), "# T01 Summary\nTypes defined.");

  return base;
}

function makeState(overrides?: Partial<KataState>): KataState {
  return {
    phase: "executing",
    activeMilestone: { id: "M001", title: "Test Milestone" },
    activeSlice: { id: "S01", title: "First Slice" },
    activeTask: { id: "T01", title: "Define types" },
    blockers: [],
    recentDecisions: [],
    nextAction: "Execute T01",
    registry: [{ id: "M001", title: "Test Milestone", status: "active" }],
    progress: { milestones: { done: 0, total: 1 }, slices: { done: 1, total: 2 }, tasks: { done: 1, total: 2 } },
    ...overrides,
  };
}

const LINEAR_CONFIG: LinearBackendConfig = {
  apiKey: "test-key",
  projectId: "proj-123",
  teamId: "team-456",
  sliceLabelId: "label-789",
};

// ─── Structural Tests ────────────────────────────────────────────────────────

describe("Prompt structural assertions — FileBackend", () => {
  let base: string;
  let fb: FileBackend;

  before(() => {
    base = createFixtureProject();
    fb = new FileBackend(base);
  });
  after(() => rmSync(base, { recursive: true, force: true }));

  it("executing prompt contains identity vars + content + ops", async () => {
    const p = await fb.buildPrompt("executing", makeState());
    assert.match(p, /M001/, "contains milestone ID");
    assert.match(p, /S01/, "contains slice ID");
    assert.match(p, /T01/, "contains task ID");
    assert.match(p, /Define types/i, "contains task title");
    assert.doesNotMatch(p, /\{\{[a-zA-Z]/, "no unresolved vars");
  });

  it("completing-milestone prompt contains identity + inlined content", async () => {
    const s = makeState({ phase: "completing-milestone", activeSlice: null, activeTask: null });
    const p = await fb.buildPrompt("completing-milestone", s);
    assert.match(p, /M001/, "contains milestone ID");
    assert.match(p, /Test Milestone/, "contains milestone title");
    assert.match(p, /Inlined Context/i, "contains inlined context section");
    assert.match(p, /Milestone Roadmap/, "contains roadmap inline");
    assert.doesNotMatch(p, /\{\{[a-zA-Z]/, "no unresolved vars");
  });
});

describe("Prompt structural assertions — LinearBackend", () => {
  let lb: LinearBackend;

  before(() => {
    lb = new LinearBackend("/tmp/kata-struct-linear", LINEAR_CONFIG);
  });

  it("executing prompt contains identity vars + linear tools", async () => {
    const p = await lb.buildPrompt("executing", makeState());
    assert.match(p, /M001/, "contains milestone ID");
    assert.match(p, /S01/, "contains slice ID");
    assert.match(p, /T01/, "contains task ID");
    assert.match(p, /kata_derive_state|kata_update_issue_state/, "references kata tools");
    assert.match(p, /KATA-WORKFLOW\.md/, "references workflow docs");
  });

  it("completing-milestone prompt contains identity + linear tools", async () => {
    const s = makeState({ phase: "completing-milestone", activeSlice: null, activeTask: null });
    const p = await lb.buildPrompt("completing-milestone", s);
    assert.match(p, /M001/, "contains milestone ID");
    assert.match(p, /kata_write_document|kata_read_document/, "references kata doc tools");
  });

  it("all non-empty prompts reference KATA-WORKFLOW.md", async () => {
    const s = makeState();
    const prompts = await Promise.all([
      lb.buildPrompt("executing", s),
      lb.buildPrompt("planning", s),
      lb.buildPrompt("pre-planning", s),
      lb.buildPrompt("summarizing", s),
      lb.buildPrompt("completing-milestone", makeState({ phase: "completing-milestone", activeSlice: null, activeTask: null })),
      lb.buildPrompt("replanning-slice", s),
    ]);
    for (const p of prompts) {
      assert.match(p, /KATA-WORKFLOW\.md/, "references workflow docs");
    }
  });
});
```

- [ ] **Step 2: Run to verify all pass**

Run: `cd /Volumes/EVO/kata/kata-mono.worktrees/wt-cli/apps/cli && node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/prompt-structure.test.ts 2>&1 | tail -20`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/resources/extensions/kata/tests/prompt-structure.test.ts
git commit -m "test: add structural prompt assertions for both backends"
```

---

## Chunk 2: First Template Migration (complete-milestone.md)

Proves the pattern works end-to-end on the simplest template.

### Task 4: Add `_buildOpsBlock` to FileBackend for completing-milestone

**Files:**
- Modify: `src/resources/extensions/kata/file-backend.ts:711-776`

- [ ] **Step 1: Write a failing test for the ops block**

Add to `src/resources/extensions/kata/tests/prompt-structure.test.ts` inside the FileBackend describe block:

```typescript
  it("completing-milestone prompt contains backendOps section", async () => {
    const s = makeState({ phase: "completing-milestone", activeSlice: null, activeTask: null });
    const p = await fb.buildPrompt("completing-milestone", s);
    // After migration, the template will contain the ops block injected by the backend.
    // The file-backend ops should reference file paths and git commit.
    assert.match(p, /git add -A && git commit/, "contains commit instruction");
    assert.match(p, /STATE\.md/, "references STATE.md update");
    assert.match(p, /SUMMARY\.md/, "references summary write path");
  });
```

- [ ] **Step 2: Run test to verify it passes against current code**

Run: `cd /Volumes/EVO/kata/kata-mono.worktrees/wt-cli/apps/cli && node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/prompt-structure.test.ts 2>&1 | tail -20`
Expected: PASS (these patterns already exist in the current template)

- [ ] **Step 3: Extract ops block from `_buildCompleteMilestonePrompt`**

In `file-backend.ts`, add a private method. The I/O-specific lines from `complete-milestone.md` (lines 10, 16, 17, 18, 19, 21, 23) move into this ops block. Everything else stays in the template.

```typescript
  private _buildCompleteMilestoneOps(state: KataState): OpsBlock {
    const mid = state.activeMilestone!.id;
    const base = this.basePath;

    const milestoneDirAbs =
      resolveMilestonePath(base, mid) ?? join(base, relMilestonePath(base, mid));
    const milestoneSummaryAbsPath = join(milestoneDirAbs, `${mid}-SUMMARY.md`);

    return {
      backendRules: "",
      backendOps: [
        `## Write Operations`,
        ``,
        `1. Read the milestone-summary template at \`~/.kata-cli/agent/extensions/kata/templates/milestone-summary.md\``,
        `2. Write \`${milestoneSummaryAbsPath}\` using the milestone-summary template. Fill all frontmatter fields and narrative sections. The \`requirement_outcomes\` field must list every requirement that changed status with \`from_status\`, \`to_status\`, and \`proof\`.`,
        `3. Update \`.kata/REQUIREMENTS.md\` if any requirement status transitions were validated.`,
        `4. Update \`.kata/PROJECT.md\` to reflect milestone completion and current project state.`,
        `5. Commit all changes: \`git add -A && git commit -m 'feat(kata): complete ${mid}'\``,
        `6. Update \`.kata/STATE.md\``,
      ].join("\n"),
      backendMustComplete: `**You MUST write \`${milestoneSummaryAbsPath}\` AND update PROJECT.md before finishing.**`,
    };
  }
```

- [ ] **Step 4: Update `_buildCompleteMilestonePrompt` to use ops block**

Replace the current `_buildCompleteMilestonePrompt` (lines 711-776) with:

```typescript
  private async _buildCompleteMilestonePrompt(state: KataState): Promise<string> {
    const mid = state.activeMilestone!.id;
    const midTitle = state.activeMilestone!.title;
    const base = this.basePath;

    const roadmapPath = resolveMilestoneFile(base, mid, "ROADMAP");
    const roadmapRel = relMilestoneFile(base, mid, "ROADMAP");
    const roadmapContent = roadmapPath ? await loadFile(roadmapPath) : null;

    const inlined: string[] = [];
    if (roadmapContent) {
      inlined.push(`### Milestone Roadmap\nSource: \`${roadmapRel}\`\n\n${roadmapContent.trim()}`);
    } else {
      inlined.push(`### Milestone Roadmap\nSource: \`${roadmapRel}\`\n\n_(not found — file does not exist yet)_`);
    }

    if (roadmapContent) {
      const roadmap = parseRoadmap(roadmapContent);
      for (const slice of roadmap.slices) {
        const summaryPath = resolveSliceFile(base, mid, slice.id, "SUMMARY");
        const summaryRel = relSliceFile(base, mid, slice.id, "SUMMARY");
        inlined.push(
          await this._inlineFile(summaryPath, summaryRel, `${slice.id} Summary`),
        );
      }
    }

    const requirementsInline = await this._inlineKataRootFile("requirements.md", "Requirements");
    if (requirementsInline) inlined.push(requirementsInline);
    const decisionsInline = await this._inlineKataRootFile("decisions.md", "Decisions");
    if (decisionsInline) inlined.push(decisionsInline);
    const projectInline = await this._inlineKataRootFile("project.md", "Project");
    if (projectInline) inlined.push(projectInline);
    const contextPath = resolveMilestoneFile(base, mid, "CONTEXT");
    const contextRel = relMilestoneFile(base, mid, "CONTEXT");
    const contextInline = await this._inlineFileOptional(contextPath, contextRel, "Milestone Context");
    if (contextInline) inlined.push(contextInline);

    const inlinedContext = `## Inlined Context (preloaded — do not re-read these files)\n\n${inlined.join("\n\n---\n\n")}`;

    const ops = this._buildCompleteMilestoneOps(state);

    return loadPrompt("complete-milestone", {
      milestoneId: mid,
      milestoneTitle: midTitle,
      roadmapPath: roadmapRel,
      inlinedContext,
      backendRules: ops.backendRules,
      backendOps: ops.backendOps,
      backendMustComplete: ops.backendMustComplete,
    });
  }
```

Note: this will fail until we update the template (next step).

- [ ] **Step 5: Update `complete-milestone.md` template**

Replace the I/O-specific lines in `src/resources/extensions/kata/prompts/complete-milestone.md` with the three ops vars. The template becomes:

```markdown
You are executing Kata auto-mode.

## UNIT: Complete Milestone {{milestoneId}} ("{{milestoneTitle}}")

All relevant context has been preloaded below — the roadmap, all slice summaries, requirements, decisions, and project context are inlined. Start working immediately without re-reading these files.

{{backendRules}}

{{inlinedContext}}

Then:
1. If a `Kata Skill Preferences` block is present in system context, use it to decide which skills to load and follow during completion, without relaxing required verification or artifact rules
2. Verify each **success criterion** from the milestone definition in `{{roadmapPath}}`. For each criterion, confirm it was met with specific evidence from slice summaries, test results, or observable behavior. List any criterion that was NOT met.
3. Verify the milestone's **definition of done** — all slices are `[x]`, all slice summaries exist, and any cross-slice integration points work correctly.
4. Validate **requirement status transitions**. For each requirement that changed status during this milestone, confirm the transition is supported by evidence. Requirements can move between Active, Validated, Deferred, Blocked, or Out of Scope — but only with proof.

{{backendOps}}

**Important:** Do NOT skip the success criteria and definition of done verification (steps 2-3). The milestone summary must reflect actual verified outcomes, not assumed success. If any criterion was not met, document it clearly in the summary and do not mark the milestone as passing verification.

{{backendMustComplete}}

When done, say: "Milestone {{milestoneId}} complete."
```

- [ ] **Step 6: Run golden + structural tests**

Run: `cd /Volumes/EVO/kata/kata-mono.worktrees/wt-cli/apps/cli && node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/golden-prompts.test.ts src/resources/extensions/kata/tests/prompt-structure.test.ts 2>&1 | tail -30`
Expected: All PASS. The completing-milestone prompt still contains the same structural elements.

- [ ] **Step 7: Commit**

```bash
git add src/resources/extensions/kata/file-backend.ts src/resources/extensions/kata/prompts/complete-milestone.md src/resources/extensions/kata/tests/prompt-structure.test.ts
git commit -m "refactor: migrate complete-milestone template to backend ops vars (file-backend)"
```

---

### Task 5: Migrate LinearBackend to use complete-milestone.md template

**Files:**
- Modify: `src/resources/extensions/kata/linear-backend.ts:565-602`

- [ ] **Step 1: Add `_buildCompleteMilestoneOps` to LinearBackend**

```typescript
  private _buildCompleteMilestoneOps(state: KataState): OpsBlock {
    const mid = state.activeMilestone?.id ?? "unknown";

    return {
      backendRules: [
        `## Rules`,
        ``,
        HARD_RULE,
        ``,
        REFERENCE,
      ].join("\n"),
      backendOps: [
        `## Write Operations`,
        ``,
        `1. Call \`kata_derive_state\` to confirm all slices are complete. Obtain \`projectId\`.`,
        `2. Discover available documents:`,
        DISCOVER_PROJECT_DOCS,
        `3. Read all slice summaries:`,
        `   - Call \`kata_list_slices\` to enumerate all slices in this milestone.`,
        `   - For each slice, call \`kata_read_document("Sxx-SUMMARY")\`.`,
        `4. Write the milestone summary: \`kata_write_document("${mid}-SUMMARY", content)\``,
        `   - Compress all slice summaries into a milestone-level narrative.`,
        `   - Include: what the milestone delivered, key decisions, architectural patterns, files modified.`,
      ].join("\n"),
      backendMustComplete: `**You MUST write the milestone summary via kata_write_document before finishing.**`,
    };
  }
```

- [ ] **Step 2: Add `_gatherCompleteMilestoneVars` to LinearBackend**

This pre-fetches documents from Linear and returns template-compatible vars:

```typescript
  private async _gatherCompleteMilestoneVars(state: KataState): Promise<Record<string, string>> {
    const mid = state.activeMilestone?.id ?? "unknown";
    const midTitle = state.activeMilestone?.title ?? "unknown";

    // Pre-fetch documents from Linear API in parallel
    const [roadmap, requirements, decisions, project, context] = await Promise.all([
      this.readDocument(`${mid}-ROADMAP`),
      this.readDocument("REQUIREMENTS"),
      this.readDocument("DECISIONS"),
      this.readDocument("PROJECT"),
      this.readDocument(`${mid}-CONTEXT`),
    ]);

    const inlined: string[] = [];
    inlined.push(`### Milestone Roadmap\n\n${roadmap?.trim() ?? "_(not found)_"}`);

    // Fetch slice summaries
    const sliceDocs = await this.listDocuments();
    const summaryNames = sliceDocs.filter(d => /^S\d+-SUMMARY$/.test(d));
    const summaries = await Promise.all(
      summaryNames.map(async (name) => {
        const content = await this.readDocument(name);
        return `### ${name}\n\n${content?.trim() ?? "_(not found)_"}`;
      }),
    );
    inlined.push(...summaries);

    if (requirements) inlined.push(`### Requirements\n\n${requirements.trim()}`);
    if (decisions) inlined.push(`### Decisions\n\n${decisions.trim()}`);
    if (project) inlined.push(`### Project\n\n${project.trim()}`);
    if (context) inlined.push(`### Milestone Context\n\n${context.trim()}`);

    const inlinedContext = `## Inlined Context (preloaded — do not re-read)\n\n${inlined.join("\n\n---\n\n")}`;

    return {
      milestoneId: mid,
      milestoneTitle: midTitle,
      roadmapPath: `${mid}-ROADMAP (preloaded above)`,
      inlinedContext,
    };
  }
```

- [ ] **Step 3: Replace `_buildCompleteMilestonePrompt` in LinearBackend**

Replace lines 565-602 with:

```typescript
  private async _buildCompleteMilestonePrompt(state: KataState): Promise<string> {
    const vars = await this._gatherCompleteMilestoneVars(state);
    const ops = this._buildCompleteMilestoneOps(state);
    return loadPrompt("complete-milestone", {
      ...vars,
      backendRules: ops.backendRules,
      backendOps: ops.backendOps,
      backendMustComplete: ops.backendMustComplete,
    });
  }
```

Note: this changes the method from sync to async. Update the return type accordingly. The `buildPrompt` dispatcher already returns `Promise<string>`, so no caller changes needed.

- [ ] **Step 4: Add structural test for Linear completing-milestone**

Add to `prompt-structure.test.ts` LinearBackend describe block:

```typescript
  it("completing-milestone prompt uses template with ops vars", async () => {
    const s = makeState({ phase: "completing-milestone", activeSlice: null, activeTask: null });
    const p = await lb.buildPrompt("completing-milestone", s);
    // Should now come from the template, containing the standard instructions
    assert.match(p, /success criterion/i, "contains verification instructions from template");
    assert.match(p, /definition of done/i, "contains definition of done check from template");
    assert.match(p, /kata_write_document/, "contains linear-specific ops");
    assert.match(p, /never use bash/i, "contains hard rule in backendRules");
    assert.doesNotMatch(p, /\{\{[a-zA-Z]/, "no unresolved vars");
  });
```

- [ ] **Step 5: Run all prompt tests**

Run: `cd /Volumes/EVO/kata/kata-mono.worktrees/wt-cli/apps/cli && node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/golden-prompts.test.ts src/resources/extensions/kata/tests/prompt-structure.test.ts src/resources/extensions/kata/tests/linear-backend.test.ts 2>&1 | tail -30`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/resources/extensions/kata/linear-backend.ts src/resources/extensions/kata/tests/prompt-structure.test.ts
git commit -m "refactor: migrate LinearBackend complete-milestone to shared template"
```

---

## Chunk 3: Simple Template Migrations (replan, reassess, run-uat)

Follow the exact same pattern as Task 4-5 for each template. Each task below is one template migration.

### Task 6: Migrate replan-slice.md

**Files:**
- Modify: `src/resources/extensions/kata/file-backend.ts:778-841` (`_buildReplanSlicePrompt`)
- Modify: `src/resources/extensions/kata/linear-backend.ts:604-638` (`_buildReplanSlicePrompt`)
- Modify: `src/resources/extensions/kata/prompts/replan-slice.md`

- [ ] **Step 1: Read current `replan-slice.md` template and both backend `_buildReplanSlicePrompt` methods**
- [ ] **Step 2: Identify I/O-specific lines in the template** — write/commit/state-advance instructions
- [ ] **Step 3: Add `_buildReplanSliceOps` to FileBackend** — extract I/O lines into ops block
- [ ] **Step 4: Update FileBackend `_buildReplanSlicePrompt`** — spread ops block into loadPrompt vars
- [ ] **Step 5: Update `replan-slice.md`** — replace I/O lines with `{{backendRules}}`, `{{backendOps}}`, `{{backendMustComplete}}`
- [ ] **Step 6: Run golden + structural tests** — verify FileBackend output unchanged
- [ ] **Step 7: Add `_buildReplanSliceOps` and `_gatherReplanSliceVars` to LinearBackend**
- [ ] **Step 8: Replace LinearBackend `_buildReplanSlicePrompt`** — use loadPrompt with shared template
- [ ] **Step 9: Add structural tests for both backends' replan-slice output**
- [ ] **Step 10: Run all prompt tests**
- [ ] **Step 11: Commit**

```bash
git add src/resources/extensions/kata/file-backend.ts src/resources/extensions/kata/linear-backend.ts src/resources/extensions/kata/prompts/replan-slice.md src/resources/extensions/kata/tests/prompt-structure.test.ts
git commit -m "refactor: migrate replan-slice template to backend ops vars"
```

---

### Task 7: Migrate reassess-roadmap.md

**Files:**
- Modify: `src/resources/extensions/kata/file-backend.ts:843-895` (`_buildReassessRoadmapPrompt`)
- Modify: `src/resources/extensions/kata/linear-backend.ts:640-673` (`_buildReassessRoadmapPrompt`)
- Modify: `src/resources/extensions/kata/prompts/reassess-roadmap.md`

- [ ] **Step 1-11: Same pattern as Task 6**

```bash
git commit -m "refactor: migrate reassess-roadmap template to backend ops vars"
```

---

### Task 8: Migrate run-uat.md

**Files:**
- Modify: `src/resources/extensions/kata/file-backend.ts:897-947` (`_buildRunUatPrompt`)
- Modify: `src/resources/extensions/kata/linear-backend.ts:675-704` (`_buildRunUatPrompt`)
- Modify: `src/resources/extensions/kata/prompts/run-uat.md`

- [ ] **Step 1-11: Same pattern as Task 6**

```bash
git commit -m "refactor: migrate run-uat template to backend ops vars"
```

---

## Chunk 4: Research + Planning Template Migrations

### Task 9: Migrate research-milestone.md

Introduces `skillDiscoveryMode` and `skillDiscoveryInstructions` vars. These are content vars produced by `_buildSkillDiscoveryVars()` (file-backend.ts:1018-1054). LinearBackend must produce the same vars.

**Files:**
- Modify: `src/resources/extensions/kata/file-backend.ts:366-404`
- Modify: `src/resources/extensions/kata/linear-backend.ts:285-318`
- Modify: `src/resources/extensions/kata/prompts/research-milestone.md`

- [ ] **Step 1: Read current template and both backend methods**
- [ ] **Step 2: Extract `_buildSkillDiscoveryVars` to shared utility or duplicate in LinearBackend**

The method reads preferences, not backend state. Either:
- (a) Extract to a standalone function in a shared module (preferred if it's pure)
- (b) Duplicate in LinearBackend

- [ ] **Step 3: Add `_buildResearchMilestoneOps` to FileBackend**
- [ ] **Step 4: Update FileBackend `_buildResearchMilestonePrompt`**
- [ ] **Step 5: Update `research-milestone.md`** — add `{{backendRules}}`, `{{backendOps}}`, `{{backendMustComplete}}`
- [ ] **Step 6: Run golden + structural tests**
- [ ] **Step 7: Add `_buildResearchMilestoneOps` and `_gatherResearchMilestoneVars` to LinearBackend**
- [ ] **Step 8: Replace LinearBackend `_buildResearchMilestonePrompt`**
- [ ] **Step 9: Add structural tests**
- [ ] **Step 10: Run all tests**
- [ ] **Step 11: Commit**

```bash
git commit -m "refactor: migrate research-milestone template to backend ops vars"
```

---

### Task 10: Migrate research-slice.md

Same pattern as Task 9. Also uses `skillDiscoveryMode`/`skillDiscoveryInstructions` + `dependencySummaries`.

**Files:**
- Modify: `src/resources/extensions/kata/file-backend.ts:456-515`
- Modify: `src/resources/extensions/kata/linear-backend.ts:363-403`
- Modify: `src/resources/extensions/kata/prompts/research-slice.md`

- [ ] **Steps 1-11: Same pattern as Task 9**

```bash
git commit -m "refactor: migrate research-slice template to backend ops vars"
```

---

### Task 11: Migrate plan-milestone.md

**Files:**
- Modify: `src/resources/extensions/kata/file-backend.ts:406-454`
- Modify: `src/resources/extensions/kata/linear-backend.ts:320-361`
- Modify: `src/resources/extensions/kata/prompts/plan-milestone.md`

- [ ] **Steps 1-11: Same pattern as Task 6**

LinearBackend ops block includes `kata_create_slice` instructions.

```bash
git commit -m "refactor: migrate plan-milestone template to backend ops vars"
```

---

### Task 12: Migrate plan-slice.md

**Files:**
- Modify: `src/resources/extensions/kata/file-backend.ts:517-570`
- Modify: `src/resources/extensions/kata/linear-backend.ts:405-453`
- Modify: `src/resources/extensions/kata/prompts/plan-slice.md`

- [ ] **Steps 1-11: Same pattern as Task 6**

LinearBackend ops block includes `kata_create_task` instructions.

```bash
git commit -m "refactor: migrate plan-slice template to backend ops vars"
```

---

## Chunk 5: Complex Template Migrations (execute-task, complete-slice)

### Task 13: Migrate execute-task.md

Most complex template. Uses `taskPlanInline`, `slicePlanExcerpt`, `carryForwardSection`, `resumeSection`, `priorTaskLines`. Path-reference vars (`taskSummaryAbsPath`, `planPath`, `taskPlanPath`) need partitioning per the spec's variable conventions.

**Files:**
- Modify: `src/resources/extensions/kata/file-backend.ts:572-652`
- Modify: `src/resources/extensions/kata/linear-backend.ts:455-512`
- Modify: `src/resources/extensions/kata/prompts/execute-task.md`

- [ ] **Step 1: Read current template and both backend methods in full**
- [ ] **Step 2: Catalog every var in the template — classify as identity, content, or ops**

Apply the spec's partitioning rule:
- Identity: `taskId`, `taskTitle`, `milestoneId`, `sliceId`, `sliceTitle`
- Content: `taskPlanInline`, `slicePlanExcerpt`, `carryForwardSection`, `resumeSection`, `priorTaskLines`
- Ops (move to backendOps): `taskSummaryAbsPath` (write target), `planPath` (mark-done target)
- Prose paths: `taskPlanPath` — generalize or keep with descriptive Linear equivalent

- [ ] **Step 3: Add `_buildExecuteTaskOps` to FileBackend**

Extract all I/O instructions: write summary, mark checkbox done, git commit, update STATE.md, decisions append.

- [ ] **Step 4: LinearBackend `_gatherExecuteTaskVars`**

Pre-fetch: task plan (scoped to slice issue), slice plan, prior task summaries (carry-forward), continue/partial progress check. Return same var names as FileBackend content vars.

- [ ] **Step 5: Update `execute-task.md`** — replace I/O lines with ops vars
- [ ] **Step 6: Update both backend `_buildExecuteTaskPrompt` methods**
- [ ] **Step 7: Run golden + structural tests**
- [ ] **Step 8: Add structural tests specific to execute-task**

Test carry-forward content present, task plan inline present, ops block present with backend-appropriate instructions.

Include the **pre-fetch integration test** from the spec: call LinearBackend's `buildPrompt("executing", state)`, verify the rendered prompt contains inlined document content rather than `kata_read_document` discovery instructions. This is the key behavioral change test.

- [ ] **Step 9: Run all tests**
- [ ] **Step 10: Commit**

```bash
git commit -m "refactor: migrate execute-task template to backend ops vars"
```

---

### Task 14: Migrate complete-slice.md

**Files:**
- Modify: `src/resources/extensions/kata/file-backend.ts:654-709`
- Modify: `src/resources/extensions/kata/linear-backend.ts:514-563`
- Modify: `src/resources/extensions/kata/prompts/complete-slice.md`

- [ ] **Steps 1-10: Same pattern as Task 13** (simpler — fewer content vars)

```bash
git commit -m "refactor: migrate complete-slice template to backend ops vars"
```

---

## Chunk 6: Discuss Merge + Cleanup

### Task 15: Unify discuss.md and eliminate discuss-linear.md

The most nuanced merge. `discuss.md` lines 1-115 are shared. Lines 116+ contain the Output Phase with inline mode branching. Replace the entire Output Phase with `{{backendOps}}`.

**Files:**
- Modify: `src/resources/extensions/kata/prompts/discuss.md`
- Delete: `src/resources/extensions/kata/prompts/discuss-linear.md`
- Modify: `src/resources/extensions/kata/file-backend.ts:280-288` (`buildDiscussPrompt`)
- Modify: `src/resources/extensions/kata/linear-backend.ts:279-281` (`buildDiscussPrompt`)

- [ ] **Step 1: Read both discuss templates in full**
- [ ] **Step 2: Identify the shared section (lines 1-115) and backend-specific Output Phase**
- [ ] **Step 3: Generalize backend-specific references in shared section**

Lines ~61, ~76 reference `.kata/REQUIREMENTS.md` or `kata_write_document`. Change to backend-neutral language: "the REQUIREMENTS document".

- [ ] **Step 4: Replace Output Phase (lines 116+) with `{{backendOps}}`**

The template ends with:
```markdown
## Output Phase

{{backendOps}}

{{backendMustComplete}}
```

- [ ] **Step 5: Update FileBackend `buildDiscussPrompt`**

The file-backend's ops block contains the full "File Mode Output Phase" content (naming convention, single/multi-milestone instructions, commit, STATE.md update). The vars `contextAbsPath` and `roadmapAbsPath` move into the ops block.

```typescript
  buildDiscussPrompt(nextId: string, preamble: string): string {
    const milestoneDirAbs = join(this.basePath, ".kata", "milestones", nextId);
    const contextAbsPath = join(milestoneDirAbs, `${nextId}-CONTEXT.md`);
    const roadmapAbsPath = join(milestoneDirAbs, `${nextId}-ROADMAP.md`);

    const backendOps = [
      `### File Mode Output Phase`,
      ``,
      `#### Naming Convention`,
      // ... (full file-mode output phase content from current discuss.md lines 164-199)
    ].join("\n");

    return loadPrompt("discuss", {
      milestoneId: nextId,
      preamble,
      backendRules: "",
      backendOps,
      backendMustComplete: `After writing the files and committing, say exactly: "Milestone {{milestoneId}} ready." — nothing else. Auto-mode will start automatically.`,
    });
  }
```

Note: `{{milestoneId}}` in the mustComplete string should be the literal value, not a template var. Use `${nextId}` in the string.

- [ ] **Step 6: Update LinearBackend `buildDiscussPrompt`**

Same pattern — ops block contains the full Linear output phase content.

- [ ] **Step 7: Delete `discuss-linear.md`**

```bash
rm src/resources/extensions/kata/prompts/discuss-linear.md
```

- [ ] **Step 8: Add structural tests for discuss prompt from both backends**
- [ ] **Step 9: Run all tests**
- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: unify discuss.md, eliminate discuss-linear.md"
```

---

### Task 16: Cleanup — delete inline constants, migrate linear-backend tests

**Files:**
- Modify: `src/resources/extensions/kata/linear-backend.ts:36-47` (constants)
- Modify: `src/resources/extensions/kata/tests/linear-backend.test.ts`

**Note on test harness:** The existing `linear-backend.test.ts` uses a hand-rolled assert/passed/failed pattern with `process.exit()`, not `node:test`. The new tests use `node:test` with `describe/it/assert`. Both styles work with `node --test` (the old-style tests run as plain scripts). During this task, migrate `linear-backend.test.ts` to `node:test` style to keep the test suite consistent.

- [ ] **Step 1: Check if `HARD_RULE`, `REFERENCE`, `DISCOVER_PROJECT_DOCS`, `DISCOVER_SLICE_DOCS` are still referenced**

After all templates are migrated, these constants should only be referenced by the `_build*Ops` methods. If they're still used, keep them. If they can be inlined into the ops methods, remove them as top-level constants.

- [ ] **Step 2: Update linear-backend.test.ts**

The existing tests use `assertMatch` against prompt content. After migration, prompts come from templates. Most assertions should still pass (same content, different source). Fix any that break:

- `assertMatch(p, /KATA-WORKFLOW\.md/, ...)` — still in backendRules ops block, should pass
- `assertMatch(p, /never use bash/i, ...)` — still in backendRules, should pass
- `assertMatch(p, /Execute Task/, ...)` — now comes from template, may need case adjustment
- `assertMatch(p, /success criterion/i, ...)` — new template content for completing-milestone

Run existing tests first, fix only what breaks.

- [ ] **Step 3: Run full test suite**

Run: `cd /Volumes/EVO/kata/kata-mono.worktrees/wt-cli/apps/cli && node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/*.test.ts' 'src/resources/extensions/kata/tests/*.test.mjs' 'src/tests/*.test.ts' 2>&1 | tail -30`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: cleanup inline constants, update linear-backend tests"
```

---

### Task 17: Import cleanup and final verification

- [ ] **Step 1: Remove unused imports from both backends**

Check for imports that were only used by deleted `_build*Prompt` methods.

- [ ] **Step 2: Run full test suite one final time**

Run: `cd /Volumes/EVO/kata/kata-mono.worktrees/wt-cli/apps/cli && node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/*.test.ts' 'src/resources/extensions/kata/tests/*.test.mjs' 'src/tests/*.test.ts' 2>&1 | tail -30`
Expected: All PASS

- [ ] **Step 3: Run TypeScript type check**

Run: `cd /Volumes/EVO/kata/kata-mono.worktrees/wt-cli/apps/cli && npx tsc --noEmit --pretty 2>&1 | tail -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: import cleanup after unified prompt layer migration"
```

- [ ] **Step 5: Verify line count reduction**

Run: `wc -l src/resources/extensions/kata/linear-backend.ts src/resources/extensions/kata/file-backend.ts`
Expected: linear-backend.ts ~280-350 lines (down from 705), file-backend.ts ~1060-1100 lines (down from 1160)
