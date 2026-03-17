# Unified KataBackend Architecture

## Problem

The Kata CLI has two parallel dispatch paths for auto-mode: file-based and Linear-based. Every workflow feature (commits, PRs, UAT, reassessment, timeouts, crash recovery, budget ceiling) must be implemented twice. The Linear path is a partial copy of the file path that keeps falling behind. Eight `isLinearMode()` forks spread across six files create a maintenance burden that scales linearly with each new backend (Jira, Asana, etc.).

## Goal

Extract a `KataBackend` interface that encapsulates where state lives and how artifacts are read/written. The dispatch loop, PR gate, commit logic, timeouts, and all workflow rules live in shared code and call `backend.method()` instead of forking. Adding a new backend means writing one implementation, not patching eight call sites.

## Architecture

One interface, two implementations, zero forks in the orchestrator.

```
┌─────────────────────────────────────────────┐
│           Shared Orchestrator               │
│  (auto.ts dispatch loop, PR gate, commits,  │
│   timeouts, crash recovery, budget, UAT)    │
│                                             │
│           backend.deriveState()             │
│           backend.buildPrompt()             │
│           backend.readDocument()            │
│           backend.bootstrap()               │
└───────────────┬─────────────────────────────┘
                │
        ┌───────┴───────┐
        │               │
  ┌─────┴─────┐   ┌─────┴──────┐
  │FileBackend│   │LinearBackend│
  │           │   │            │
  │state.ts   │   │linear-     │
  │files.ts   │   │state.ts    │
  │paths.ts   │   │linear-     │
  │prompts/   │   │client.ts   │
  └───────────┘   └────────────┘
```

## Core Interface

Backends are **stateful** — constructed with `basePath` and mode-specific config (Linear needs `projectId`, `teamId`, `apiKey`). This avoids passing `basePath` to every method and matches how `LinearClient` is already used (cached on the instance).

```typescript
interface KataBackend {
  /** The project root directory. */
  readonly basePath: string;

  /** Derive current workflow state. */
  deriveState(): Promise<KataState>;

  /** Read a named document (plan, summary, research, UAT, etc.). */
  readDocument(name: string, scope?: DocumentScope): Promise<string | null>;

  /** Write a named document. */
  writeDocument(name: string, content: string, scope?: DocumentScope): Promise<void>;

  /** List all documents in a scope. */
  listDocuments(scope?: DocumentScope): Promise<string[]>;

  /** Check if a document exists (without reading content). */
  documentExists(name: string, scope?: DocumentScope): Promise<boolean>;

  /**
   * Build the prompt for a given phase.
   *
   * FileBackend: reads documents from disk and inlines content into the prompt.
   * LinearBackend: emits kata_read_document/kata_write_document instructions
   * for the agent to execute at runtime.
   *
   * Both return a plain string. The orchestrator does not know or care
   * how the content was assembled.
   */
  buildPrompt(phase: string, state: KataState, options?: PromptOptions): string;

  /** Bootstrap the project (git init, .kata/ dir, ensure preferences, etc.). */
  bootstrap(): Promise<void>;

  /** Build the discuss prompt for a new milestone. */
  buildDiscussPrompt(nextId: string, preamble: string): string;

  /** Load data for the dashboard overlay. */
  loadDashboardData(): Promise<DashboardData>;

  /** Check if a milestone was created (post-discuss verification). */
  checkMilestoneCreated(milestoneId: string): Promise<boolean>;

  /**
   * Prepare context for PR creation after a slice completes.
   *
   * FileBackend: ensures slice branch exists, returns docs from disk.
   * LinearBackend: creates branch from HEAD, pushes, fetches docs from API.
   *
   * Returns document content for the PR body and the branch name.
   */
  preparePrContext(milestoneId: string, sliceId: string): Promise<PrContext>;
}

type DocumentScope =
  | { projectId: string }
  | { issueId: string };

/** Dispatch-time routing overrides. */
interface PromptOptions {
  /** Dispatch research instead of plan for milestone or slice. */
  dispatchResearch?: "milestone" | "slice";
  /** Dispatch reassess-roadmap for this completed slice. */
  reassessSliceId?: string;
  /** Dispatch run-uat for this slice. */
  uatSliceId?: string;
}

/** Data shape for the dashboard overlay. */
interface DashboardData {
  state: KataState;
  /** Slice-level progress for the active milestone. */
  sliceProgress: { done: number; total: number } | null;
  /** Task-level progress for the active slice. */
  taskProgress: { done: number; total: number } | null;
}

/** PR preparation result from backend. */
interface PrContext {
  /** Branch name ready for PR (pushed to origin). */
  branch: string;
  /** Document content for the PR body (PLAN, SUMMARY). */
  documents: Record<string, string>;
}
```

### Factory

```typescript
function createBackend(basePath: string): KataBackend {
  if (isLinearMode()) {
    return new LinearBackend(basePath, loadLinearConfig());
  }
  return new FileBackend(basePath);
}
```

`createBackend` is called once at the start of auto-mode or step-mode. The result is passed to the dispatch loop. No re-evaluation per cycle — the mode doesn't change mid-session.

## Dispatch-Time Routing

The dispatch loop calls `backend.documentExists()` to make routing decisions. These checks stay in the shared orchestrator, not in the backends:

```typescript
async function resolveDispatchOptions(
  backend: KataBackend,
  state: KataState,
  prevUnit: UnitRef | null,
  prefs: KataPreferences | undefined,
): Promise<PromptOptions> {
  const options: PromptOptions = {};
  const mid = state.activeMilestone?.id;
  const sid = state.activeSlice?.id;

  // Research-before-plan: check if research doc exists
  if (state.phase === "pre-planning" && mid) {
    const has = await backend.documentExists(`${mid}-RESEARCH`);
    if (!has) options.dispatchResearch = "milestone";
  } else if (state.phase === "planning" && sid) {
    const has = await backend.documentExists(`${sid}-RESEARCH`);
    if (!has) options.dispatchResearch = "slice";
  }

  // UAT: check if last completed slice has UAT but no UAT-RESULT
  if (prefs?.uat_dispatch && sliceJustCompleted(prevUnit, state)) {
    const prevSid = extractPrevSliceId(prevUnit);
    if (prevSid) {
      const hasUat = await backend.documentExists(`${prevSid}-UAT`);
      const hasResult = await backend.documentExists(`${prevSid}-UAT-RESULT`);
      if (hasUat && !hasResult) options.uatSliceId = prevSid;
    }
  }

  // Reassessment: check if last completed slice has SUMMARY but no ASSESSMENT
  if (!options.uatSliceId && sliceJustCompleted(prevUnit, state)) {
    const prevSid = extractPrevSliceId(prevUnit);
    if (prevSid) {
      const hasSummary = await backend.documentExists(`${prevSid}-SUMMARY`);
      const hasAssessment = await backend.documentExists(`${prevSid}-ASSESSMENT`);
      if (hasSummary && !hasAssessment) options.reassessSliceId = prevSid;
    }
  }

  return options;
}
```

This replaces the file-mode `checkNeedsRunUat` / `checkNeedsReassessment` functions AND the Linear-mode gap where these checks were missing.

## Dispatch Loop Unification

`dispatchNextUnit` becomes mode-agnostic. Module-level mutable state (`active`, `paused`, `basePath`, `lastUnit`, `retryCount`, `currentMilestoneId`, `originalModelId`, timeout handles, `completedUnits`, etc.) stays in `auto.ts` — it's orchestrator state, not backend state.

```
derive state (backend.deriveState)
  → complete/blocked check (shared)
  → dispatch-time routing (shared, calls backend.documentExists)
  → build prompt (backend.buildPrompt)
  → milestone transition detection (shared)
  → stuck detection + retry (shared)
  → metrics snapshot + activity log (shared)
  → PR gate on slice transition (shared, calls backend.preparePrContext)
  → budget ceiling (shared)
  → unit runtime record (shared)
  → progress widget (shared, uses state.progress)
  → fresh session (shared)
  → crash recovery prompt prepend (shared)
  → model switching (shared)
  → timeout supervision (shared)
  → sendMessage (shared)
```

Every feature that was duplicated or missing from Linear mode gets written once.

## Prompt Builder Asymmetry

File-mode and Linear-mode prompt builders produce prompts differently:

- **FileBackend.buildPrompt**: reads documents from disk via `loadFile()` and inlines their content into the prompt string. The prompt is self-contained — the agent doesn't need to read any files to know what to do.
- **LinearBackend.buildPrompt**: emits `kata_read_document(...)` instructions. The agent reads documents at runtime via tool calls.

Both return `string`. The orchestrator treats them identically. The asymmetry is encapsulated within each backend's `buildPrompt` implementation. The existing prompt builder functions (`buildExecuteTaskPrompt`, `buildLinearExecuteTaskPrompt`, etc.) move into their respective backend classes unchanged.

## File Layout

### New files
- `src/resources/extensions/kata/backend.ts` — `KataBackend` interface, types (`DocumentScope`, `PromptOptions`, `DashboardData`, `PrContext`), `createBackend()` factory
- `src/resources/extensions/kata/file-backend.ts` — `FileBackend` implementation (extracts prompt builders + file reads from auto.ts, bootstrap from guided-flow.ts, state delegation to state.ts)
- `src/resources/extensions/kata/linear-backend.ts` — `LinearBackend` implementation (extracts prompt builders from linear-auto.ts, state delegation to linear-state.ts, document I/O from linear-documents.ts)

### Modified files (fork elimination)
- `auto.ts` — `dispatchNextUnit` and `startAuto` call `backend.*`. Drops from ~1600 to ~800 lines. Prompt builders extracted to backends. Module-level orchestrator state stays here.
- `commands.ts` — `showLinearSmartEntry` deleted. `deriveKataState` deleted. Single step-mode function calls `backend.deriveState()` + `backend.buildPrompt()`.
- `guided-flow.ts` — `showSmartEntry` calls `backend.buildDiscussPrompt()` and `backend.checkMilestoneCreated()`.
- `dashboard-overlay.ts` — calls `backend.loadDashboardData()`.

### Preserved as-is
- `linear-state.ts` — used internally by `LinearBackend.deriveState()`
- `state.ts` — used internally by `FileBackend.deriveState()`
- `pr-auto.ts` — shared, mode-independent
- `worktree.ts` — shared git helpers
- All shared infrastructure (metrics, activity-log, crash-recovery, unit-runtime, preferences)

### Deleted after migration
- `linear-auto.ts` — prompt builders move to `LinearBackend.buildPrompt()`. `resolveLinearKataState` becomes `LinearBackend.deriveState()`. `selectLinearPrompt` is absorbed into `LinearBackend.buildPrompt()`.

### Circular dependency resolution
The current `commands.ts <-> auto.ts` circular dependency (caused by `resolveLinearKataState` living in `linear-auto.ts` to avoid it) is eliminated. State derivation moves to `backend.ts` / `*-backend.ts`, which neither `auto.ts` nor `commands.ts` imports circularly. Both import `backend.ts` for the interface and `createBackend()`.

## Fork Elimination Map

All eight `isLinearMode()` forks and their replacements:

| # | Location | Current fork | Replacement |
|---|----------|-------------|-------------|
| 1 | commands.ts:327 | step entry → two functions | `backend.deriveState()` + `backend.buildPrompt()` |
| 2 | commands.ts:418 | deriveKataState → two impls | `backend.deriveState()` |
| 3 | auto.ts:317 | startAuto → skip bootstrap | `backend.bootstrap()` |
| 4 | auto.ts:802 | dispatchNextUnit → two paths | unified loop calling `backend.*` |
| 5 | guided-flow.ts:106 | post-discuss check | `backend.checkMilestoneCreated()` |
| 6 | guided-flow.ts:204 | buildDiscussPrompt → throws | `backend.buildDiscussPrompt()` |
| 7 | linear-auto.ts:54 | resolveLinearKataState fallback | `backend.deriveState()` |
| 8 | dashboard-overlay.ts:124 | loadLinearData vs file | `backend.loadDashboardData()` |

## Migration Strategy

Extract, don't rewrite. Each backend method is a direct extraction of existing working code.

- `FileBackend.buildPrompt("executing", state)` calls the same `buildExecuteTaskPrompt` that `auto.ts` calls today.
- `LinearBackend.buildPrompt("executing", state)` calls the same `buildLinearExecuteTaskPrompt` from `linear-auto.ts`.
- `FileBackend.deriveState()` delegates to `deriveState()` from `state.ts`.
- `LinearBackend.deriveState()` delegates to `deriveLinearState()` from `linear-state.ts`.
- `FileBackend.preparePrContext()` extracts the existing branch + squash-merge logic from `auto.ts`.
- `LinearBackend.preparePrContext()` extracts the branch-from-HEAD + push + Linear doc fetch logic we just wrote today.

The interface is new; the internals are moved, not reimplemented.

## Testing Strategy

**Interface contract tests:** Mock `KataBackend` to verify the dispatch loop calls methods in the correct order. Same test works for both backends.

**Backend implementation tests:** Existing tests (`derive-state.test.ts`, `linear-state.test.ts`, `linear-auto.test.ts`, parser tests) stay as-is. Called through backend methods.

**Acceptance criteria:** Each of the eight fork sites eliminated is verified by a test showing the unified path works for both backends.

No new test infrastructure needed.

## Scope Boundary

This refactor covers the auto-mode dispatch loop and its consumers (step mode, guided flow, dashboard). It does not change:
- The Linear GraphQL client or entity helpers
- The file-based state derivation algorithm
- The PR lifecycle runner
- The prompt template content (just where it's called from)
- The shared infrastructure (metrics, crash recovery, etc.)
