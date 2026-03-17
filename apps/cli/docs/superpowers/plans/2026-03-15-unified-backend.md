# Unified KataBackend Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all `isLinearMode()` forks by extracting a `KataBackend` interface with `FileBackend` and `LinearBackend` implementations, then unifying the dispatch loop and all consumers.

**Architecture:** Create `backend.ts` (interface + factory), `file-backend.ts` (extracted from auto.ts + guided-flow.ts), `linear-backend.ts` (extracted from linear-auto.ts + commands.ts). Then rewrite auto.ts dispatch loop, commands.ts step mode, guided-flow.ts, and dashboard-overlay.ts to call `backend.*` methods instead of forking.

**Tech Stack:** TypeScript, Linear GraphQL API via existing `LinearClient`, existing `state.ts` / `linear-state.ts` for state derivation.

**Spec:** `docs/superpowers/specs/2026-03-15-unified-backend-design.md`

---

## Chunk 1: Interface + Factory

### Task 1: Create the KataBackend interface

**Files:**
- Create: `src/resources/extensions/kata/backend.ts`

- [ ] **Step 1: Write the interface file**

```typescript
/**
 * KataBackend — Unified interface for Kata workflow state and artifact I/O.
 *
 * Two implementations: FileBackend (disk-based .kata/ files) and
 * LinearBackend (Linear API). The dispatch loop and all consumers
 * call backend methods — no isLinearMode() forks.
 */

import type { KataState, Phase } from "./types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocumentScope =
  | { projectId: string }
  | { issueId: string };

/** Dispatch-time routing overrides for prompt selection. */
export interface PromptOptions {
  dispatchResearch?: "milestone" | "slice";
  reassessSliceId?: string;
  uatSliceId?: string;
}

/** Data shape for the dashboard overlay. */
export interface DashboardData {
  state: KataState;
  sliceProgress: { done: number; total: number } | null;
  taskProgress: { done: number; total: number } | null;
}

/** PR preparation result. */
export interface PrContext {
  branch: string;
  documents: Record<string, string>;
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface KataBackend {
  readonly basePath: string;

  deriveState(): Promise<KataState>;
  readDocument(name: string, scope?: DocumentScope): Promise<string | null>;
  writeDocument(name: string, content: string, scope?: DocumentScope): Promise<void>;
  documentExists(name: string, scope?: DocumentScope): Promise<boolean>;
  listDocuments(scope?: DocumentScope): Promise<string[]>;

  /** Async — FileBackend reads files to inline, LinearBackend may need API lookups. */
  buildPrompt(phase: string, state: KataState, options?: PromptOptions): Promise<string>;
  buildDiscussPrompt(nextId: string, preamble: string): string;

  bootstrap(): Promise<void>;
  checkMilestoneCreated(milestoneId: string): Promise<boolean>;
  loadDashboardData(): Promise<DashboardData>;
  preparePrContext(milestoneId: string, sliceId: string): Promise<PrContext>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export { createBackend } from "./backend-factory.js";
```

- [ ] **Step 2: Create the factory file**

Create `src/resources/extensions/kata/backend-factory.ts`:

```typescript
/**
 * Backend factory — returns FileBackend or LinearBackend based on preferences.
 *
 * Separate file to avoid circular imports: backend.ts defines the interface,
 * this file imports both implementations.
 */

import type { KataBackend } from "./backend.js";
import { isLinearMode } from "./linear-config.js";

export function createBackend(basePath: string): KataBackend {
  if (isLinearMode()) {
    // Dynamic import to avoid loading Linear deps when not needed
    const { LinearBackend } = require("./linear-backend.js");
    return new LinearBackend(basePath);
  }
  const { FileBackend } = require("./file-backend.js");
  return new FileBackend(basePath);
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: Clean (new files have no consumers yet)

- [ ] **Step 4: Commit**

```bash
git add src/resources/extensions/kata/backend.ts src/resources/extensions/kata/backend-factory.ts
git commit -m "feat(kata): add KataBackend interface and factory"
```

---

## Chunk 2: FileBackend

### Task 2: Create FileBackend — state + documents

Extract `deriveState`, `readDocument`, `documentExists`, `listDocuments` from existing file-mode code.

**Files:**
- Create: `src/resources/extensions/kata/file-backend.ts`
- Reference: `src/resources/extensions/kata/state.ts` (deriveState)
- Reference: `src/resources/extensions/kata/files.ts` (loadFile)
- Reference: `src/resources/extensions/kata/paths.ts` (all path resolution)

- [ ] **Step 1: Write the failing test**

Create `src/resources/extensions/kata/tests/file-backend.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { FileBackend } from "../file-backend.js";

describe("FileBackend", () => {
  it("implements KataBackend interface", () => {
    // Type-level check — if this compiles, the interface is satisfied
    const backend: import("../backend.js").KataBackend = new FileBackend("/tmp/test");
    expect(backend.basePath).toBe("/tmp/test");
  });

  it("deriveState delegates to state.ts deriveState", async () => {
    // FileBackend.deriveState() should return a KataState.
    // Without a real .kata/ directory it returns a pre-planning/complete state.
    const backend = new FileBackend("/tmp/nonexistent");
    const state = await backend.deriveState();
    expect(state).toHaveProperty("phase");
    expect(state).toHaveProperty("activeMilestone");
  });

  it("documentExists returns false for missing documents", async () => {
    const backend = new FileBackend("/tmp/nonexistent");
    const exists = await backend.documentExists("M001-RESEARCH");
    expect(exists).toBe(false);
  });

  it("readDocument returns null for missing documents", async () => {
    const backend = new FileBackend("/tmp/nonexistent");
    const content = await backend.readDocument("M001-RESEARCH");
    expect(content).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/resources/extensions/kata/tests/file-backend.test.ts`
Expected: FAIL — `FileBackend` does not exist yet

- [ ] **Step 3: Write FileBackend — state + document methods**

Create `src/resources/extensions/kata/file-backend.ts`:

```typescript
/**
 * FileBackend — KataBackend implementation backed by .kata/ files on disk.
 *
 * State derivation delegates to state.ts. Document I/O uses paths.ts + files.ts.
 * Prompt builders are extracted from the file-mode section of auto.ts.
 */

import type { KataBackend, DocumentScope, PromptOptions, DashboardData, PrContext } from "./backend.js";
import type { KataState } from "./types.js";
import { deriveState } from "./state.js";
import { loadFile } from "./files.js";
import {
  resolveMilestoneFile,
  resolveSliceFile,
  resolveKataRootFile,
  resolveMilestonePath,
  resolveSlicePath,
  resolveTasksDir,
  resolveTaskFiles,
  milestonesDir,
  kataRoot,
} from "./paths.js";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { ensureGitignore, ensurePreferences } from "./gitignore.js";

export class FileBackend implements KataBackend {
  readonly basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async deriveState(): Promise<KataState> {
    return deriveState(this.basePath);
  }

  async readDocument(name: string, _scope?: DocumentScope): Promise<string | null> {
    // Documents in file mode are resolved by convention:
    // Milestone-level: M001-ROADMAP, M001-RESEARCH, M001-CONTEXT, etc.
    // Slice-level: S01-PLAN, S01-SUMMARY, S01-UAT, etc.
    // Root-level: PROJECT, DECISIONS, REQUIREMENTS
    //
    // Parse the name to determine which resolver to use.
    const rootDocs = ["PROJECT", "DECISIONS", "REQUIREMENTS"];
    if (rootDocs.includes(name)) {
      const absPath = resolveKataRootFile(this.basePath, name as any);
      return existsSync(absPath) ? loadFile(absPath) : null;
    }

    // Pattern: M001-SOMETHING or S01-SOMETHING or T01-SOMETHING
    const match = name.match(/^([MST]\d+)-(.+)$/);
    if (!match) return null;

    const [, entityId, docType] = match;
    if (entityId.startsWith("M")) {
      const absPath = resolveMilestoneFile(this.basePath, entityId, docType as any);
      return absPath ? loadFile(absPath) : null;
    }
    // Slice and task docs need milestone context — derive from state
    // For now, use the active milestone
    const state = await this.deriveState();
    const mid = state.activeMilestone?.id;
    if (!mid) return null;

    if (entityId.startsWith("S")) {
      const absPath = resolveSliceFile(this.basePath, mid, entityId, docType as any);
      return absPath ? loadFile(absPath) : null;
    }

    // Task docs (T01-PLAN, T01-SUMMARY) need slice context too
    if (entityId.startsWith("T") && state.activeSlice) {
      const sid = state.activeSlice.id;
      const tasksDir = resolveTasksDir(this.basePath, mid, sid);
      if (!tasksDir) return null;
      // Try to find the task file
      const files = resolveTaskFiles(tasksDir, docType as any);
      const taskFile = files.find(f => f.startsWith(entityId));
      if (taskFile) return loadFile(join(tasksDir, taskFile));
    }

    return null;
  }

  async documentExists(name: string, scope?: DocumentScope): Promise<boolean> {
    const content = await this.readDocument(name, scope);
    return content !== null && content.trim().length > 0;
  }

  async listDocuments(_scope?: DocumentScope): Promise<string[]> {
    // List all documents in the active milestone's .kata/ tree
    // This is a simplified implementation — returns milestone + slice doc names
    const state = await this.deriveState();
    const mid = state.activeMilestone?.id;
    if (!mid) return [];

    const docs: string[] = [];
    const mPath = resolveMilestonePath(this.basePath, mid);
    if (mPath) {
      try {
        const entries = readdirSync(mPath);
        for (const e of entries) {
          if (e.endsWith(".md")) docs.push(e.replace(/\.md$/, ""));
        }
      } catch { /* ignore */ }
    }
    return docs;
  }

  async writeDocument(name: string, content: string, _scope?: DocumentScope): Promise<void> {
    // Write document to disk. Parse name to determine path.
    // Implementation mirrors readDocument path resolution.
    throw new Error("FileBackend.writeDocument not yet implemented — needed for future features");
  }

  // ── Prompt builders (stub — Task 3 fills these in) ────────────────────────

  async buildPrompt(_phase: string, _state: KataState, _options?: PromptOptions): Promise<string> {
    throw new Error("FileBackend.buildPrompt not yet implemented");
  }

  buildDiscussPrompt(_nextId: string, _preamble: string): string {
    throw new Error("FileBackend.buildDiscussPrompt not yet implemented");
  }

  // ── Lifecycle (stub — Task 4 fills these in) ──────────────────────────────

  async bootstrap(): Promise<void> {
    // Git init
    try {
      execSync("git rev-parse --git-dir", { cwd: this.basePath, stdio: "pipe" });
    } catch {
      execSync("git init", { cwd: this.basePath, stdio: "pipe" });
    }
    ensureGitignore(this.basePath);
    ensurePreferences(this.basePath);

    // Bootstrap .kata/ if it doesn't exist
    const kataDir = join(this.basePath, ".kata");
    if (!existsSync(kataDir)) {
      mkdirSync(join(kataDir, "milestones"), { recursive: true });
      try {
        execSync("git add -A .kata .gitignore && git commit -m 'chore: init kata'", {
          cwd: this.basePath, stdio: "pipe",
        });
      } catch { /* nothing to commit */ }
    }
  }

  async checkMilestoneCreated(milestoneId: string): Promise<boolean> {
    const contextFile = resolveMilestoneFile(this.basePath, milestoneId, "CONTEXT");
    return contextFile !== null;
  }

  async loadDashboardData(): Promise<DashboardData> {
    throw new Error("FileBackend.loadDashboardData not yet implemented");
  }

  async preparePrContext(_milestoneId: string, _sliceId: string): Promise<PrContext> {
    throw new Error("FileBackend.preparePrContext not yet implemented");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/resources/extensions/kata/tests/file-backend.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/resources/extensions/kata/file-backend.ts src/resources/extensions/kata/tests/file-backend.test.ts
git commit -m "feat(kata): add FileBackend with state + document methods"
```

### Task 3: FileBackend — prompt builders

Extract all file-mode prompt builder functions from auto.ts into FileBackend.buildPrompt.

**Files:**
- Modify: `src/resources/extensions/kata/file-backend.ts`
- Reference: `src/resources/extensions/kata/auto.ts:1757-2250` (prompt builders)
- Reference: `src/resources/extensions/kata/guided-flow.ts:199-216` (buildDiscussPrompt)

- [ ] **Step 1: Move prompt builders into FileBackend**

The existing prompt builder functions in auto.ts (`buildResearchMilestonePrompt`, `buildPlanMilestonePrompt`, `buildResearchSlicePrompt`, `buildPlanSlicePrompt`, `buildExecuteTaskPrompt`, `buildCompleteSlicePrompt`, `buildCompleteMilestonePrompt`, `buildReplanSlicePrompt`, `buildReassessRoadmapPrompt`, `buildRunUatPrompt`) all take `(mid, title, basePath, ...)` and return `Promise<string>`.

Move them as private methods on `FileBackend`, then implement `buildPrompt` as a phase-based dispatcher:

```typescript
// In file-backend.ts, replace the buildPrompt stub:

async buildPrompt(phase: string, state: KataState, options?: PromptOptions): Promise<string> {
  // Dispatch-time overrides take priority
  if (options?.uatSliceId) {
    return this._buildRunUatPrompt(state, options.uatSliceId);
  }
  if (options?.reassessSliceId) {
    return this._buildReassessRoadmapPrompt(state, options.reassessSliceId);
  }
  if (options?.dispatchResearch === "milestone") {
    return this._buildResearchMilestonePrompt(state);
  }
  if (options?.dispatchResearch === "slice") {
    return this._buildResearchSlicePrompt(state);
  }

  switch (phase) {
    case "pre-planning":
      return this._buildPlanMilestonePrompt(state);
    case "planning":
      return this._buildPlanSlicePrompt(state);
    case "executing":
    case "verifying":
      return this._buildExecuteTaskPrompt(state);
    case "summarizing":
      return this._buildCompleteSlicePrompt(state);
    case "completing-milestone":
      return this._buildCompleteMilestonePrompt(state);
    case "replanning-slice":
      return this._buildReplanSlicePrompt(state);
    default:
      return "";
  }
}
```

Note: The interface already defines `buildPrompt` as async (`Promise<string>`) since Task 1. The existing file-mode builders are async (they read files), so this matches naturally.

Each private builder is a direct copy of the existing function from auto.ts, with `basePath` replaced by `this.basePath`. The functions themselves (1,000+ lines) are moved, not rewritten.

- [ ] **Step 2: Move buildDiscussPrompt from guided-flow.ts**

```typescript
// In file-backend.ts:

buildDiscussPrompt(nextId: string, preamble: string): string {
  const milestoneDirAbs = join(this.basePath, ".kata", "milestones", nextId);
  return loadPrompt("discuss", {
    milestoneId: nextId,
    preamble,
    contextAbsPath: join(milestoneDirAbs, `${nextId}-CONTEXT.md`),
    roadmapAbsPath: join(milestoneDirAbs, `${nextId}-ROADMAP.md`),
  });
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/resources/extensions/kata/file-backend.ts src/resources/extensions/kata/backend.ts
git commit -m "feat(kata): add FileBackend prompt builders"
```

### Task 4: FileBackend — lifecycle methods (bootstrap, dashboard, PR)

**Files:**
- Modify: `src/resources/extensions/kata/file-backend.ts`
- Reference: `src/resources/extensions/kata/auto.ts:351-376` (bootstrap)
- Reference: `src/resources/extensions/kata/auto.ts:1089-1146` (PR gate file-mode)
- Reference: `src/resources/extensions/kata/dashboard-overlay.ts:129` (loadFileData)

- [ ] **Step 1: Implement preparePrContext**

Extract from auto.ts lines 1089-1146. FileBackend version:
- Ensures slice branch exists (via `ensureSliceBranch`)
- Reads PLAN and SUMMARY from disk for PR body
- Returns branch name and documents

```typescript
async preparePrContext(milestoneId: string, sliceId: string): Promise<PrContext> {
  const { ensureSliceBranch } = await import("./worktree.js");
  ensureSliceBranch(this.basePath, milestoneId, sliceId);

  const branch = `kata/${milestoneId}/${sliceId}`;
  const documents: Record<string, string> = {};

  const plan = await this.readDocument(`${sliceId}-PLAN`);
  if (plan) documents["PLAN"] = plan;
  const summary = await this.readDocument(`${sliceId}-SUMMARY`);
  if (summary) documents["SUMMARY"] = summary;

  return { branch, documents };
}
```

- [ ] **Step 2: Implement loadDashboardData**

Extract dashboard data loading from dashboard-overlay.ts `loadFileData`:

```typescript
async loadDashboardData(): Promise<DashboardData> {
  const state = await this.deriveState();
  const mid = state.activeMilestone?.id;

  let sliceProgress: { done: number; total: number } | null = null;
  let taskProgress: { done: number; total: number } | null = null;

  if (state.progress?.slices) {
    sliceProgress = state.progress.slices;
  }
  if (state.progress?.tasks) {
    taskProgress = state.progress.tasks;
  }

  return { state, sliceProgress, taskProgress };
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/resources/extensions/kata/file-backend.ts
git commit -m "feat(kata): add FileBackend lifecycle methods"
```

---

## Chunk 3: LinearBackend

### Task 5: Create LinearBackend — state + documents

**Files:**
- Create: `src/resources/extensions/kata/linear-backend.ts`
- Reference: `src/resources/extensions/kata/linear-auto.ts:53-98` (resolveLinearKataState)
- Reference: `src/resources/extensions/linear/linear-documents.ts` (readKataDocument, listKataDocuments)

- [ ] **Step 1: Write the failing test**

Create `src/resources/extensions/kata/tests/linear-backend.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { LinearBackend } from "../linear-backend.js";

describe("LinearBackend", () => {
  it("implements KataBackend interface", () => {
    // Type-level check. LinearBackend requires config but we just check the shape.
    // Real API tests are integration tests.
    const backend = new LinearBackend("/tmp/test", {
      apiKey: "test",
      projectId: "test-id",
      teamId: "team-id",
      sliceLabelId: "label-id",
    });
    expect(backend.basePath).toBe("/tmp/test");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/resources/extensions/kata/tests/linear-backend.test.ts`
Expected: FAIL — `LinearBackend` does not exist yet

- [ ] **Step 3: Write LinearBackend — state + document methods**

Create `src/resources/extensions/kata/linear-backend.ts`:

```typescript
/**
 * LinearBackend — KataBackend implementation backed by Linear API.
 *
 * State derivation delegates to linear-state.ts. Document I/O uses
 * linear-documents.ts. Prompt builders are extracted from linear-auto.ts.
 */

import type { KataBackend, DocumentScope, PromptOptions, DashboardData, PrContext } from "./backend.js";
import type { KataState } from "./types.js";
import { LinearClient } from "../linear/linear-client.js";
import { deriveLinearState } from "../linear/linear-state.js";
import { ensureKataLabels } from "../linear/linear-entities.js";
import { readKataDocument, listKataDocuments } from "../linear/linear-documents.js";
import { resolveConfiguredLinearTeamId } from "./linear-config.js";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { ensureGitignore } from "./gitignore.js";

export interface LinearBackendConfig {
  apiKey: string;
  projectId: string;
  teamId: string;
  sliceLabelId: string;
}

export class LinearBackend implements KataBackend {
  readonly basePath: string;
  private client: LinearClient;
  private config: LinearBackendConfig;

  constructor(basePath: string, config: LinearBackendConfig) {
    this.basePath = basePath;
    this.config = config;
    this.client = new LinearClient(config.apiKey);
  }

  async deriveState(): Promise<KataState> {
    return deriveLinearState(this.client, {
      projectId: this.config.projectId,
      teamId: this.config.teamId,
      sliceLabelId: this.config.sliceLabelId,
      basePath: this.basePath,
    });
  }

  async readDocument(name: string, scope?: DocumentScope): Promise<string | null> {
    const effectiveScope = scope ?? { projectId: this.config.projectId };
    const doc = await readKataDocument(this.client, name, effectiveScope);
    return doc?.content ?? null;
  }

  async documentExists(name: string, scope?: DocumentScope): Promise<boolean> {
    const content = await this.readDocument(name, scope);
    return content !== null && content.trim().length > 0;
  }

  async listDocuments(scope?: DocumentScope): Promise<string[]> {
    const effectiveScope = scope ?? { projectId: this.config.projectId };
    const docs = await listKataDocuments(this.client, effectiveScope);
    return docs.map(d => d.title);
  }

  // ── Prompt builders (stub — Task 6 fills these in) ────────────────────────

  async buildPrompt(_phase: string, _state: KataState, _options?: PromptOptions): Promise<string> {
    throw new Error("LinearBackend.buildPrompt not yet implemented");
  }

  buildDiscussPrompt(_nextId: string, _preamble: string): string {
    throw new Error("LinearBackend.buildDiscussPrompt not yet implemented");
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async bootstrap(): Promise<void> {
    // Linear mode still needs git + .kata/ for lock files and activity logs
    try {
      execSync("git rev-parse --git-dir", { cwd: this.basePath, stdio: "pipe" });
    } catch {
      execSync("git init", { cwd: this.basePath, stdio: "pipe" });
    }
    ensureGitignore(this.basePath);
    const kataDir = join(this.basePath, ".kata");
    if (!existsSync(kataDir)) {
      mkdirSync(kataDir, { recursive: true });
    }
  }

  async checkMilestoneCreated(milestoneId: string): Promise<boolean> {
    const state = await this.deriveState();
    return state.activeMilestone?.id === milestoneId;
  }

  async loadDashboardData(): Promise<DashboardData> {
    const state = await this.deriveState();
    return {
      state,
      sliceProgress: state.progress?.slices ?? null,
      taskProgress: state.progress?.tasks ?? null,
    };
  }

  async preparePrContext(milestoneId: string, sliceId: string): Promise<PrContext> {
    const branch = `kata/${milestoneId}/${sliceId}`;

    // Create or reset the slice branch to current HEAD and push
    execSync(`git branch -f ${branch} HEAD`, { cwd: this.basePath, stdio: "pipe" });
    execSync(`git checkout ${branch}`, { cwd: this.basePath, stdio: "pipe" });
    execSync(`git push -u origin ${branch}`, { cwd: this.basePath, stdio: "pipe" });

    // Fetch documents for PR body
    const documents: Record<string, string> = {};
    const plan = await this.readDocument(`${sliceId}-PLAN`);
    if (plan) documents["PLAN"] = plan;
    const summary = await this.readDocument(`${sliceId}-SUMMARY`);
    if (summary) documents["SUMMARY"] = summary;

    return { branch, documents };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/resources/extensions/kata/tests/linear-backend.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/resources/extensions/kata/linear-backend.ts src/resources/extensions/kata/tests/linear-backend.test.ts
git commit -m "feat(kata): add LinearBackend with state + document methods"
```

### Task 6: LinearBackend — prompt builders

Extract all Linear-mode prompt builder functions from linear-auto.ts into LinearBackend.

**Files:**
- Modify: `src/resources/extensions/kata/linear-backend.ts`
- Reference: `src/resources/extensions/kata/linear-auto.ts:114-655` (all prompt builders + selectLinearPrompt)

- [ ] **Step 1: Move prompt builders into LinearBackend**

The existing functions (`buildLinearResearchMilestonePrompt`, `buildLinearPlanMilestonePrompt`, etc.) take `(state: KataState)` and return `string`. Move them as private methods, then implement `buildPrompt` as dispatcher.

The `selectLinearPrompt` function (lines 610-655) becomes the body of `LinearBackend.buildPrompt`:

```typescript
async buildPrompt(phase: string, state: KataState, options?: PromptOptions): Promise<string> {
  if (options?.uatSliceId) {
    return this._buildRunUatPrompt(state, options.uatSliceId);
  }
  if (options?.reassessSliceId) {
    return this._buildReassessRoadmapPrompt(state, options.reassessSliceId);
  }
  if (options?.dispatchResearch === "milestone") {
    return this._buildResearchMilestonePrompt(state);
  }
  if (options?.dispatchResearch === "slice") {
    return this._buildResearchSlicePrompt(state);
  }

  switch (phase) {
    case "pre-planning":
      return this._buildPlanMilestonePrompt(state);
    case "planning":
      return this._buildPlanSlicePrompt(state);
    case "executing":
    case "verifying":
      return this._buildExecuteTaskPrompt(state);
    case "summarizing":
      return this._buildCompleteSlicePrompt(state);
    case "completing-milestone":
      return this._buildCompleteMilestonePrompt(state);
    case "replanning-slice":
      return this._buildReplanSlicePrompt(state);
    default:
      return "";
  }
}

buildDiscussPrompt(nextId: string, preamble: string): string {
  return loadPrompt("discuss-linear", { milestoneId: nextId, preamble });
}
```

Each private `_build*` method is a direct copy from linear-auto.ts.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/resources/extensions/kata/linear-backend.ts
git commit -m "feat(kata): add LinearBackend prompt builders"
```

### Task 7: Update backend-factory to wire LinearBackend config

**Files:**
- Modify: `src/resources/extensions/kata/backend-factory.ts`

- [ ] **Step 1: Wire up Linear config resolution**

```typescript
import type { KataBackend } from "./backend.js";
import { isLinearMode, loadEffectiveLinearProjectConfig, resolveConfiguredLinearTeamId } from "./linear-config.js";
import { LinearClient } from "../linear/linear-client.js";
import { ensureKataLabels } from "../linear/linear-entities.js";

export async function createBackend(basePath: string): Promise<KataBackend> {
  if (isLinearMode()) {
    const config = loadEffectiveLinearProjectConfig();
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) throw new Error("LINEAR_API_KEY is not set");

    const projectId = config.linear.projectId;
    if (!projectId) throw new Error("Linear projectId not configured");

    const client = new LinearClient(apiKey);
    const teamResolution = await resolveConfiguredLinearTeamId(client);
    if (!teamResolution.teamId) throw new Error(teamResolution.error ?? "Linear team not resolved");

    const labelSet = await ensureKataLabels(client, teamResolution.teamId);

    const { LinearBackend } = await import("./linear-backend.js");
    return new LinearBackend(basePath, {
      apiKey,
      projectId,
      teamId: teamResolution.teamId,
      sliceLabelId: labelSet.slice.id,
    });
  }

  const { FileBackend } = await import("./file-backend.js");
  return new FileBackend(basePath);
}
```

Note: `createBackend` is now `async` because Linear config resolution requires API calls. Update `backend.ts` re-export accordingly.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/resources/extensions/kata/backend-factory.ts src/resources/extensions/kata/backend.ts
git commit -m "feat(kata): wire LinearBackend config in factory"
```

---

## Chunk 4: Unify Dispatch Loop (auto.ts)

### Task 8: Rewrite dispatchNextUnit to use backend

This is the biggest task. The unified dispatch loop replaces both the Linear path (lines 802-1025) and the file path (lines 1028-1621) with a single path calling `backend.*`.

**Files:**
- Modify: `src/resources/extensions/kata/auto.ts`

- [ ] **Step 1: Add backend instance to module state**

At the top of auto.ts, alongside the existing module-level state:

```typescript
import type { KataBackend } from "./backend.js";
import { createBackend } from "./backend-factory.js";

let backend: KataBackend | null = null;
```

- [ ] **Step 2: Wire backend creation in startAuto**

Replace both the Linear and file-mode startAuto blocks with:

```typescript
export async function startAuto(ctx, pi, base, verboseMode) {
  // ... resume-from-paused logic stays ...

  try {
    backend = await createBackend(base);
  } catch (err) {
    ctx.ui.notify(`Backend init failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    return;
  }

  await backend.bootstrap();

  const state = await backend.deriveState();
  if (!state.activeMilestone || state.phase === "complete") {
    // No work — enter discuss flow
    const { showSmartEntry } = await import("./guided-flow.js");
    await showSmartEntry(ctx, pi, base);
    return;
  }
  if (state.phase === "blocked") {
    ctx.ui.notify(`Blocked: ${state.blockers?.join(", ")}`, "warning");
    return;
  }

  // ... shared initialization (active, verbose, cmdCtx, basePath, metrics, etc.) ...

  await dispatchNextUnit(ctx, pi);
}
```

- [ ] **Step 3: Rewrite dispatchNextUnit as unified loop**

Replace both the `if (isLinearMode()) { ... }` block AND the file-mode block with a single path:

```typescript
async function dispatchNextUnit(ctx, pi) {
  if (!active || !cmdCtx || !backend) return;

  const state = await backend.deriveState();
  const mid = state.activeMilestone?.id;

  // Milestone transition detection (shared)
  if (mid && currentMilestoneId && mid !== currentMilestoneId) {
    ctx.ui.notify(`Milestone ${currentMilestoneId} complete. Advancing to ${mid}.`, "info");
    lastUnit = null;
    retryCount = 0;
  }
  if (mid) currentMilestoneId = mid;

  // Complete / blocked (shared)
  if (state.phase === "complete" || !mid) {
    /* snapshot metrics, stop */ return;
  }
  if (state.phase === "blocked") {
    /* snapshot metrics, stop, notify */ return;
  }

  // Dispatch-time routing (shared, uses backend.documentExists)
  const options = await resolveDispatchOptions(backend, state, currentUnit);

  // Build prompt (backend)
  const prompt = await backend.buildPrompt(state.phase, state, options);
  if (!prompt) { await stopAuto(ctx, pi); return; }

  // Unit type + ID derivation (shared)
  const unitType = deriveUnitType(state, options);
  const unitId = deriveUnitId(state);

  // Stuck detection (shared)
  // ... same as current ...

  // Metrics snapshot for previous unit (shared)
  // ... same as current ...

  // PR gate on slice transition (shared)
  const prevSliceKey = currentUnit?.id ? currentUnit.id.split("/").slice(0, 2).join("/") : null;
  const nextSliceKey = unitId.split("/").slice(0, 2).join("/");
  const sliceChanged = prevSliceKey && prevSliceKey !== nextSliceKey;

  if (sliceChanged || currentUnit?.type?.includes("summarizing") || currentUnit?.type?.includes("completing-milestone")) {
    const prefs = loadEffectiveKataPreferences()?.preferences;
    const decision = decidePostCompleteSliceAction(prefs?.pr);

    if (decision === "auto-create-and-pause") {
      const [cMid, cSid] = currentUnit!.id.split("/");
      try {
        const prCtx = await backend.preparePrContext(cMid!, cSid!);
        const prResult = await runCreatePr({
          cwd: basePath,
          milestoneId: cMid!,
          sliceId: cSid!,
          baseBranch: prefs?.pr?.base_branch ?? "main",
          title: cSid!,
          linearDocuments: prCtx.documents,
        });
        if (prResult.ok) {
          ctx.ui.notify(`PR created: ${prResult.url}\nAuto-mode paused — review and merge, then /kata auto.`, "info");
        } else {
          ctx.ui.notify(`PR failed: ${formatPrAutoCreateFailure(prResult)}`, "error");
        }
      } catch (err) {
        ctx.ui.notify(`PR context failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
      await stopAuto(ctx, pi);
      return;
    } else if (decision === "skip-notify") {
      ctx.ui.notify("Slice complete. Run /kata pr create, then /kata auto.", "info");
      await stopAuto(ctx, pi);
      return;
    }
    // legacy-squash-merge: file-mode only, handled by FileBackend.preparePrContext side effects
  }

  // Budget ceiling (shared)
  // ... same as current ...

  // Update tracking state
  lastUnit = { type: unitType, id: unitId };
  currentUnit = { type: unitType, id: unitId, startedAt: Date.now() };

  // Unit runtime record (shared)
  writeUnitRuntimeRecord(basePath, unitType, unitId, currentUnit.startedAt, { ... });

  // Progress widget (shared, uses state.progress)
  if (state.progress?.slices) {
    cachedSliceProgress = { ... };
  }
  updateProgressWidget(ctx, unitType, unitId, state);

  // Fresh session (shared)
  const result = await cmdCtx!.newSession();
  if (result.cancelled) { await stopAuto(ctx, pi); return; }

  // Lock file (shared)
  writeLock(basePath, unitType, unitId, completedUnits.length, ctx.sessionManager.getSessionFile());

  // Crash recovery + retry diagnostic (shared)
  let finalPrompt = prompt;
  if (pendingCrashRecovery) {
    finalPrompt = `${pendingCrashRecovery}\n\n---\n\n${finalPrompt}`;
    pendingCrashRecovery = null;
  } else if (retryCount > 0) {
    const diagnostic = getDeepDiagnostic(basePath);
    if (diagnostic) finalPrompt = `**RETRY**\n${diagnostic}\n\n---\n\n${finalPrompt}`;
  }

  // Model switching (shared)
  const preferredModelId = resolveModelForUnit(unitType);
  // ... same as current ...

  // Timeout supervision (shared)
  clearUnitTimeout();
  // ... same setup as current file-mode ...

  // Dispatch
  pi.sendMessage({ customType: "kata-auto", content: finalPrompt, display: verbose }, { triggerTurn: true });
}
```

- [ ] **Step 4: Add shared helper: resolveDispatchOptions**

```typescript
async function resolveDispatchOptions(
  backend: KataBackend,
  state: KataState,
  prevUnit: { type: string; id: string } | null,
): Promise<PromptOptions> {
  const options: PromptOptions = {};
  const mid = state.activeMilestone?.id;
  const sid = state.activeSlice?.id;

  // Research-before-plan
  if (state.phase === "pre-planning" && mid) {
    if (!(await backend.documentExists(`${mid}-RESEARCH`))) {
      options.dispatchResearch = "milestone";
    }
  } else if (state.phase === "planning" && sid) {
    if (!(await backend.documentExists(`${sid}-RESEARCH`))) {
      options.dispatchResearch = "slice";
    }
  }

  // UAT + reassessment on slice transition
  const prevSliceKey = prevUnit?.id ? prevUnit.id.split("/").slice(0, 2).join("/") : null;
  const nextSliceKey = [mid, sid].filter(Boolean).join("/");
  const sliceChanged = prevSliceKey && prevSliceKey !== nextSliceKey;

  if (sliceChanged && prevSliceKey) {
    const [, prevSid] = prevSliceKey.split("/");
    if (prevSid) {
      const prefs = loadEffectiveKataPreferences()?.preferences;

      // UAT check
      if (prefs?.uat_dispatch) {
        const hasUat = await backend.documentExists(`${prevSid}-UAT`);
        const hasResult = await backend.documentExists(`${prevSid}-UAT-RESULT`);
        if (hasUat && !hasResult) options.uatSliceId = prevSid;
      }

      // Reassessment check
      if (!options.uatSliceId) {
        const hasSummary = await backend.documentExists(`${prevSid}-SUMMARY`);
        const hasAssessment = await backend.documentExists(`${prevSid}-ASSESSMENT`);
        if (hasSummary && !hasAssessment) options.reassessSliceId = prevSid;
      }
    }
  }

  return options;
}
```

- [ ] **Step 5: Add shared helpers: deriveUnitType, deriveUnitId**

```typescript
function deriveUnitType(state: KataState, options: PromptOptions): string {
  if (options.uatSliceId) return "run-uat";
  if (options.reassessSliceId) return "reassess-roadmap";
  if (options.dispatchResearch === "milestone") return "research-milestone";
  if (options.dispatchResearch === "slice") return "research-slice";

  switch (state.phase) {
    case "pre-planning": return "plan-milestone";
    case "planning": return "plan-slice";
    case "executing":
    case "verifying": return "execute-task";
    case "summarizing": return "complete-slice";
    case "completing-milestone": return "complete-milestone";
    case "replanning-slice": return "replan-slice";
    default: return `unknown-${state.phase}`;
  }
}

function deriveUnitId(state: KataState): string {
  const mid = state.activeMilestone?.id ?? "unknown";
  const sid = state.activeSlice?.id;
  const tid = state.activeTask?.id;
  if (tid && sid) return `${mid}/${sid}/${tid}`;
  if (sid) return `${mid}/${sid}`;
  return mid;
}
```

- [ ] **Step 6: Delete the old Linear dispatch path and file-mode dispatch path**

Remove:
- The `if (isLinearMode()) { ... }` block (lines 802-1025)
- The file-mode dispatch routing switch (lines 1248-1368)
- The file-mode prompt builder functions (lines 1757-2250+) — now in FileBackend
- The `inlineFile`, `inlineFileOptional`, `inlineDependencySummaries`, `inlineKataRootFile` helpers — now in FileBackend

Keep:
- Module-level state variables
- `stopAuto`, `pauseAuto`, `startAuto` (rewritten)
- `handleAgentEnd` (unchanged)
- Progress widget functions
- Timeout/recovery functions
- `getAutoDashboardData`, `isAutoActive`, `isAutoPaused`

- [ ] **Step 7: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 8: Run existing tests**

Run: `npx vitest run src/resources/extensions/kata/tests/auto-preflight.test.ts`
Run: `npx vitest run src/resources/extensions/kata/tests/pr-auto.test.ts`
Expected: PASS (these test shared logic that didn't change)

- [ ] **Step 9: Commit**

```bash
git add src/resources/extensions/kata/auto.ts
git commit -m "feat(kata): unify dispatch loop behind KataBackend"
```

---

## Chunk 5: Unify Remaining Consumers + Cleanup

### Task 9: Unify commands.ts step mode

**Files:**
- Modify: `src/resources/extensions/kata/commands.ts`

- [ ] **Step 1: Replace showLinearSmartEntry + file-mode fork with unified step**

Replace the `if (isLinearMode()) { showLinearSmartEntry... } else { showSmartEntry... }` block at line 326 with:

```typescript
if (trimmed === "" || trimmed === "step") {
  let backend: KataBackend;
  try {
    backend = await createBackend(process.cwd());
  } catch (err) {
    ctx.ui.notify(`Kata backend init failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    return;
  }
  const state = await backend.deriveState();

  if (state.phase === "blocked") {
    ctx.ui.notify(`Blocked: ${state.blockers.join(", ")}`, "warning");
    return;
  }
  if (state.phase === "complete" || !state.activeMilestone) {
    await showSmartEntry(ctx, pi, process.cwd());
    return;
  }

  const prompt = await backend.buildPrompt(state.phase, state);
  if (!prompt) {
    ctx.ui.notify(`No prompt for phase: ${state.phase}`, "warning");
    return;
  }

  const unitId = deriveUnitId(state);
  ctx.ui.notify(`/kata step: ${state.phase} — ${unitId}`, "info");
  pi.sendMessage({ customType: "kata-step", content: prompt, display: false }, { triggerTurn: true });
  return;
}
```

- [ ] **Step 2: Delete showLinearSmartEntry and deriveKataState**

Remove the private functions `showLinearSmartEntry` (lines 351-405) and `deriveKataState` (lines 417-460) — both replaced by `backend.*` calls.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/resources/extensions/kata/commands.ts
git commit -m "feat(kata): unify step mode behind KataBackend"
```

### Task 10: Unify guided-flow.ts

**Files:**
- Modify: `src/resources/extensions/kata/guided-flow.ts`

- [ ] **Step 1: Replace isLinearMode fork in checkAutoStartAfterDiscuss (line 106)**

```typescript
// Replace:
if (isLinearMode()) {
  const state = await resolveLinearKataState(basePath);
  if (!state.activeMilestone || state.activeMilestone.id !== milestoneId) return false;
} else {
  const contextFile = resolveMilestoneFile(basePath, milestoneId, "CONTEXT");
  if (!contextFile) return false;
}

// With:
const backend = await createBackend(basePath);
const created = await backend.checkMilestoneCreated(milestoneId);
if (!created) return false;
```

- [ ] **Step 2: Replace isLinearMode fork in buildDiscussPrompt (line 204)**

```typescript
// Replace the function with:
function buildDiscussPrompt(nextId: string, preamble: string, basePath: string): string {
  // This is only called in file-mode context from showSmartEntry.
  // The backend factory handles mode selection.
  // For now, keep the file-mode implementation inline since
  // showSmartEntry already knows it's in file mode by this point.
  // The full unification happens when showSmartEntry uses backend.buildDiscussPrompt.
}
```

Actually, simpler: replace the call site in `showSmartEntry` to use `backend.buildDiscussPrompt()`:

- [ ] **Step 3: Replace isLinearMode fork in showSmartEntry (line 638)**

The big fork. Replace the entire `if (modeGate.isLinearMode) { ... }` block with:

```typescript
const backend = await createBackend(basePath);
await backend.bootstrap();
const state = await backend.deriveState();

if (!state.activeMilestone || state.phase === "complete") {
  // New milestone discuss flow
  const total = state.progress?.milestones?.total ?? 0;
  const nextId = `M${String(total + 1).padStart(3, "0")}`;
  const preamble = total === 0 ? `New project, milestone ${nextId}.` : `New milestone ${nextId}.`;

  pendingAutoStart = { ctx, pi, basePath, milestoneId: nextId };
  const discussPrompt = backend.buildDiscussPrompt(nextId, preamble);
  pi.sendMessage({ customType: "kata-run", content: discussPrompt, display: false }, { triggerTurn: true });
  return;
}

// Active work exists — show next action UI
// ... rest of the existing guided flow logic ...
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
git add src/resources/extensions/kata/guided-flow.ts
git commit -m "feat(kata): unify guided-flow behind KataBackend"
```

### Task 11: Unify dashboard-overlay.ts

**Files:**
- Modify: `src/resources/extensions/kata/dashboard-overlay.ts`

- [ ] **Step 1: Replace isLinearMode fork in loadData (line 124)**

```typescript
// Replace:
if (isLinearMode()) {
  await this.loadLinearData(base);
  return;
}
await this.loadFileData(base);

// With:
const backend = await createBackend(base);
const dashData = await backend.loadDashboardData();
// Use dashData.state, dashData.sliceProgress, dashData.taskProgress
// to populate the overlay's internal data structures
```

- [ ] **Step 2: Remove loadLinearData and loadFileData private methods**

Both are replaced by `backend.loadDashboardData()`.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/resources/extensions/kata/dashboard-overlay.ts
git commit -m "feat(kata): unify dashboard behind KataBackend"
```

### Task 12: Delete linear-auto.ts

**Files:**
- Delete: `src/resources/extensions/kata/linear-auto.ts`
- Modify: Any files that import from it

- [ ] **Step 1: Find all imports of linear-auto.ts**

Run: `grep -r "linear-auto" src/resources/extensions/kata/`

Expected imports to update:
- `auto.ts` — remove import of `resolveLinearKataState`, `selectLinearPrompt`
- `guided-flow.ts` — remove import of `resolveLinearKataState`, `buildLinearDiscussPrompt`
- `commands.ts` — remove import of `buildLinearDiscussPrompt`, `selectLinearPrompt`

- [ ] **Step 2: Remove all imports and delete the file**

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Migrate linear-auto.test.ts imports**

Update `src/resources/extensions/kata/tests/linear-auto.test.ts`:
- Replace `import { selectLinearPrompt, buildLinear* } from "../linear-auto.js"` with imports from `LinearBackend`
- Tests that called `selectLinearPrompt(state)` should call `new LinearBackend(...).buildPrompt(state.phase, state)`
- Tests that called individual builders should call the backend's buildPrompt with the appropriate phase

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 6: Verify no isLinearMode forks remain in consumer files**

Run: `grep -n "isLinearMode" src/resources/extensions/kata/auto.ts src/resources/extensions/kata/commands.ts src/resources/extensions/kata/guided-flow.ts src/resources/extensions/kata/dashboard-overlay.ts`
Expected: Zero matches.

The only remaining `isLinearMode` call should be in `backend-factory.ts` (the factory) and `linear-config.ts` (the definition).

- [ ] **Step 7: Commit**

```bash
git rm src/resources/extensions/kata/linear-auto.ts
git add -A src/resources/extensions/kata/
git commit -m "feat(kata): delete linear-auto.ts — absorbed into LinearBackend"
```

### Task 13: Final verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Verify fork elimination**

Run: `grep -rn "isLinearMode" src/resources/extensions/kata/ --include="*.ts" | grep -v test | grep -v linear-config | grep -v backend-factory`
Expected: Zero matches in non-test, non-factory files.

- [ ] **Step 4: Commit final state**

```bash
git add -A
git commit -m "chore(kata): verify unified backend — all forks eliminated"
```
