# Plan: Unify Workflow — Single Methodology, Backend-Agnostic Prompt Builders

## Problem

The Kata workflow has two parallel implementations that have drifted apart:

1. **Methodology documents**: `KATA-WORKFLOW.md` (file mode, ~660 lines) vs `LINEAR-WORKFLOW.md` (Linear mode, ~270 lines). Supposed to describe the same methodology. LINEAR-WORKFLOW.md is missing entire sections.

2. **Prompt builders**: `auto.ts` (file mode, ~3000 lines, 15+ builders) vs `linear-auto.ts` (Linear mode, ~300 lines, 4 builders). The Linear builders are missing dependency summaries, carry-forward, continue protocol, UAT, research, reassessment, milestone completion, and replan. The existing 4 builders have wrong document reads (cascading fallbacks, missing scope params, missing required context).

This drift directly causes UAT failures in Linear mode. The root cause is structural: no enforcement mechanism keeps two independent implementations in sync.

## Design Principle

The workflow methodology is the product. Storage backends (filesystem, Linear, future Jira/GitHub Projects) are interchangeable. The prompt builders must produce **equivalent agent behavior** regardless of backend. Differences are limited to HOW artifacts are read/written, never WHAT is read/written or WHEN.

## Architecture

### Key Insight: File Mode Inlines, Linear Mode Instructs

File-backed prompt builders **read files at dispatch time** and inline their content into the prompt. The agent receives pre-loaded context.

Linear prompt builders **cannot inline** — the content lives in the Linear API. The agent must call `kata_read_document` at runtime to fetch it.

This means the prompt text is structurally different between modes, but the **document manifest** (which docs to read, required vs optional, what order) must be identical.

### Solution: Shared Phase Recipes + Mode-Specific Renderers

```
PhaseRecipe (shared)          →  declares WHAT to read/write per phase
  ↓                               ↓
FileRenderer (auto.ts)        LinearRenderer (linear-auto.ts)
  reads files, inlines            emits kata_read_document instructions
  content into prompt             for the agent to execute at runtime
```

A `PhaseRecipe` is a data structure, not an abstraction layer. It's a typed declaration of:
- Required document reads (fail if missing)
- Optional document reads (skip if missing)
- Required document writes (must happen before phase ends)
- Prior summary injection rules
- Phase-specific sequencing notes

Both renderers consume the same recipe. Tests verify both renderers reference the same recipe. Adding a new backend means writing a new renderer, not a new workflow.

---

## Phased Execution

### Phase 1: Merge Workflow Documents

Merge `KATA-WORKFLOW.md` and `LINEAR-WORKFLOW.md` into a single `KATA-WORKFLOW.md` with mode-conditional blocks. This is the methodology spec — one document, one source of truth.

**Step 1.1: Rewrite KATA-WORKFLOW.md as unified document**

File: `apps/cli/src/resources/KATA-WORKFLOW.md`

Merge structure:
- **Quick Start** — shared preamble, then two labeled blocks (file mode: read `.kata/state.md`; Linear mode: call `kata_derive_state`)
- **The Hierarchy** — shared. Add Linear entity mapping table and title convention (D021)
- **File Locations** — keep file-mode tree. Add `### Artifact Storage (Linear Mode)` with document title format, tool usage, D028 normalization
- **File Format Reference** — keep as-is. Add note: "In Linear mode, same formats, stored as LinearDocuments"
- **The Phases** — shared phase definitions with mode-conditional operation details. Merge Linear's phase transition table, `verifying` clarification, `summarizing` phase
- **Continue-Here Protocol** — keep file-mode content. Add Linear note: issue state is the continue protocol
- **State Management** — shared. Add: `kata_derive_state` replaces `state.md` in Linear mode
- **Git Strategy** — shared (both modes use same git workflow)
- **Summary Injection** — shared. Add Linear note about `kata_read_document`
- **Checklist for a Fresh Session** — two labeled lists
- **Tool Reference (Linear Mode)** — from LINEAR-WORKFLOW.md
- **Auto-Mode Contract (Linear Mode)** — from LINEAR-WORKFLOW.md

**Step 1.2: Delete LINEAR-WORKFLOW.md**

File: `apps/cli/src/resources/LINEAR-WORKFLOW.md` — delete

**Step 1.3: Update resource-loader.ts**

File: `apps/cli/src/resource-loader.ts`
- Remove `LINEAR-WORKFLOW.md` from doc list and JSDoc

**Step 1.4: Update loader.ts**

File: `apps/cli/src/loader.ts`
- Delete `process.env.LINEAR_WORKFLOW_PATH = ...`

**Step 1.5: Update linear-config.ts**

File: `apps/cli/src/resources/extensions/kata/linear-config.ts`
- Remove `"LINEAR-WORKFLOW.md"` from type union
- Simplify `resolveWorkflowProtocol()` — both modes resolve to `KATA-WORKFLOW.md`
- Update system-prompt notices to reference unified document

**Step 1.6: Update linear-auto.ts references**

File: `apps/cli/src/resources/extensions/kata/linear-auto.ts`
- Replace all `LINEAR-WORKFLOW.md` references with `KATA-WORKFLOW.md`

**Step 1.7: Update tests**

Files:
- `mode-switching.test.ts` — remove `LINEAR_WORKFLOW_PATH`, update assertions
- `linear-auto.test.ts` — update reference assertion

**Step 1.8: Verify**
```bash
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/mode-switching.test.ts'
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/linear-auto.test.ts'
rg 'LINEAR.WORKFLOW' apps/cli/src/
```

---

### Phase 2: Define Phase Recipes

Introduce a shared data structure that declares what each phase reads and writes. This becomes the single source of truth that both renderers consume.

**Step 2.1: Create `phase-recipes.ts`**

File: `apps/cli/src/resources/extensions/kata/phase-recipes.ts`

```typescript
export interface DocumentRef {
  /** Document title/id — e.g. "M001-ROADMAP", "T01-PLAN", "DECISIONS" */
  title: string;
  /** Why this document is read at this phase */
  purpose: string;
  /** If true, phase should fail visibly when document is missing */
  required: boolean;
}

export interface PhaseRecipe {
  phase: string;
  description: string;
  reads: DocumentRef[];
  writes: DocumentRef[];
  /** Read prior task summaries for carry-forward context */
  injectPriorSummaries: boolean;
  /** Read dependency slice summaries per roadmap depends:[] */
  injectDependencySummaries: boolean;
  /** Check for continue/resume state */
  checkContinue: boolean;
}
```

Define recipes for all phases, using template variables for milestone/slice/task IDs:

| Phase | Required Reads | Optional Reads | Writes | Summaries | Dependencies | Continue |
|-------|---------------|----------------|--------|-----------|-------------|----------|
| `research-milestone` | `${mid}-CONTEXT` | `PROJECT`, `REQUIREMENTS`, `DECISIONS` | `${mid}-RESEARCH` | no | no | no |
| `plan-milestone` | `${mid}-CONTEXT` | `${mid}-RESEARCH`, prior milestone summary, `PROJECT`, `REQUIREMENTS`, `DECISIONS` | `${mid}-ROADMAP` | no | no | no |
| `research-slice` | `${mid}-ROADMAP` | `${mid}-CONTEXT`, `${mid}-RESEARCH`, `DECISIONS`, `REQUIREMENTS` | `${sid}-RESEARCH` | no | yes | no |
| `plan-slice` | `${mid}-ROADMAP` | `${sid}-RESEARCH`, `DECISIONS`, `REQUIREMENTS` | `${sid}-PLAN` + task sub-issues | no | yes | no |
| `execute-task` | `${tid}-PLAN` | `${sid}-PLAN` (excerpt) | `${tid}-SUMMARY` | yes (carry-forward) | no | yes |
| `complete-slice` | `${mid}-ROADMAP`, `${sid}-PLAN` | `REQUIREMENTS`, all `${tid}-SUMMARY` | `${sid}-SUMMARY`, `${sid}-UAT` | yes (all task summaries) | no | no |
| `complete-milestone` | `${mid}-ROADMAP` | all `${sid}-SUMMARY`, `REQUIREMENTS`, `DECISIONS`, `PROJECT`, `${mid}-CONTEXT` | `${mid}-SUMMARY` | yes (all slice summaries) | no | no |
| `replan-slice` | `${mid}-ROADMAP`, `${sid}-PLAN` | blocker task summary, `DECISIONS` | `${sid}-REPLAN` | no | no | no |
| `reassess-roadmap` | `${mid}-ROADMAP`, completed `${sid}-SUMMARY` | `PROJECT`, `REQUIREMENTS`, `DECISIONS` | `${sid}-ASSESSMENT` | no | no | no |
| `run-uat` | `${sid}-UAT`, `${sid}-SUMMARY` | `PROJECT` | `${sid}-UAT-RESULT` | no | no | no |

**Step 2.2: Add parity tests**

File: `apps/cli/src/resources/extensions/kata/tests/phase-recipe.test.ts`

Tests that verify:
- Every phase in `auto.ts` dispatch logic has a corresponding recipe
- Every phase in `linear-auto.ts` dispatch logic has a corresponding recipe
- Recipe document lists match what the file-backed prompt builders actually read (extracted by inspecting `inlineFile`/`inlineFileOptional`/`inlineKataRootFile` calls)

These tests are the enforcement mechanism. If someone adds a document read to `auto.ts` without updating the recipe, the test fails.

---

### Phase 3: Rewrite Linear Prompt Builders

Rewrite `linear-auto.ts` prompt builders to consume phase recipes and achieve full parity with `auto.ts`.

**Step 3.1: Add missing prompt builders to `linear-auto.ts`**

Currently missing (6 builders):
- `buildLinearResearchMilestonePrompt`
- `buildLinearResearchSlicePrompt`
- `buildLinearCompleteMilestonePrompt`
- `buildLinearReplanSlicePrompt`
- `buildLinearRunUatPrompt`
- `buildLinearReassessRoadmapPrompt`

Plus the dispatch checks:
- `checkNeedsReassessment` equivalent for Linear (query issue states)
- `checkNeedsRunUat` equivalent for Linear

**Step 3.2: Fix existing 4 prompt builders**

For each existing builder, fix to match the recipe:

**`buildLinearExecuteTaskPrompt`:**
- Read `${tid}-PLAN` with `projectId` scope — required, fail if null
- Read `${sid}-PLAN` with `projectId` scope — optional, for slice context excerpt
- Instruct agent to read prior task summaries for carry-forward
- Remove cascading fallback chain
- Remove plan auto-creation
- Add continue/resume check instructions

**`buildLinearPlanSlicePrompt`:**
- Read `${mid}-ROADMAP` with `projectId` scope — required (currently missing entirely)
- Read `${sid}-RESEARCH` — optional
- Read `DECISIONS`, `REQUIREMENTS` — optional
- Instruct agent to read dependency slice summaries
- Keep idempotency check (list existing tasks before creating)

**`buildLinearPlanMilestonePrompt`:**
- Read `${mid}-CONTEXT` — required
- Read `${mid}-RESEARCH`, prior milestone summary, `PROJECT`, `REQUIREMENTS`, `DECISIONS` — optional
- Add idempotency check (list existing slices before creating)

**`buildLinearCompleteSlicePrompt`:**
- Read `${mid}-ROADMAP` — required (currently missing)
- Read `${sid}-PLAN` — required (currently missing, needed for success criteria)
- Read `REQUIREMENTS` — optional
- Read all task summaries — required
- Write `${sid}-SUMMARY` and `${sid}-UAT`

**Step 3.3: All builders must specify `projectId` explicitly**

Every `kata_read_document` and `kata_write_document` instruction in every prompt must include `projectId` as the scope. No ambiguity, no guessing.

**Step 3.4: Update `selectLinearPrompt` dispatcher**

Add cases for new phases: `research-milestone`, `research-slice`, `replan-slice`, `run-uat`, `reassess-roadmap`, `complete-milestone`.

**Step 3.5: Update dispatch logic in `auto.ts`**

The `dispatchNextUnit` function's Linear branch currently only calls `selectLinearPrompt`. It needs to also run the Linear equivalents of `checkNeedsReassessment` and `checkNeedsRunUat` at the appropriate points in the dispatch cycle.

---

### Phase 4: Refactor File-Backed Builders to Consume Recipes (Future)

Once recipes exist and Linear builders consume them, optionally refactor `auto.ts` builders to also consume recipes. This makes the enforcement bidirectional — both implementations are verified against the same recipe.

This phase is lower priority because `auto.ts` is already correct. The recipes primarily protect the Linear (and future) implementations. But doing this closes the loop: changes to either implementation that don't match the recipe will fail tests.

---

## Verification Plan

### Phase 1 verification
- `mode-switching.test.ts` passes (3 tests)
- `linear-auto.test.ts` passes (22 tests)
- `rg 'LINEAR.WORKFLOW' apps/cli/src/` returns 0 hits
- Merged document reads coherently

### Phase 2 verification
- `phase-recipe.test.ts` passes
- Every phase in both dispatchers has a recipe
- Recipe document lists match `auto.ts` actual reads

### Phase 3 verification
- `linear-auto.test.ts` passes (expanded to cover all new builders)
- Every Linear builder references the same documents as its file-backed counterpart
- No Linear builder uses cascading fallbacks
- Every `kata_read_document` instruction includes explicit `projectId` scope
- Manual UAT: run `/kata` in Linear mode, verify correct document reads at each phase

---

## Future Backend Extensibility

When adding Jira support:

1. **Phase recipes are unchanged** — same documents, same phases
2. **Write a Jira renderer** — translates recipes into Jira-specific tool call instructions (different API, different scoping, possibly different document storage strategy for backends without native documents)
3. **Write a Jira state deriver** — produces `KataState` from Jira issue states
4. **Add a Jira dispatch branch** to `dispatchNextUnit`
5. **Recipe parity tests automatically cover** the new backend — any missing phase or document read is caught

The recipe layer means adding a backend is O(renderer) not O(workflow). The workflow logic is written once.

## What This Plan Does NOT Do

- Does not refactor `auto.ts` internals (Phase 4 is marked future)
- Does not change the file-backed workflow behavior in any way
- Does not add new phases or documents to the methodology
- Does not change how state derivation works (Layer 4 stays as-is)
- Does not change the Linear tool implementations (`linear-tools.ts`, `linear-client.ts`, etc.)
