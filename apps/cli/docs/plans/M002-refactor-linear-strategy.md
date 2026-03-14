# Plan: Unify Workflow — Single Methodology, Backend-Agnostic Prompt Builders

## Problem

The Kata workflow has two parallel implementations that have drifted apart:

1. **Methodology documents**: `KATA-WORKFLOW.md` (file mode, ~660 lines) vs `LINEAR-WORKFLOW.md` (Linear mode, ~270 lines). Supposed to describe the same methodology. LINEAR-WORKFLOW.md is missing entire sections.

2. **Prompt builders**: `auto.ts` (file mode, ~3000 lines, 15+ builders) vs `linear-auto.ts` (Linear mode, ~300 lines, 4 builders). The Linear builders are missing dependency summaries, carry-forward, continue protocol, UAT, research, reassessment, milestone completion, and replan. The existing 4 builders have wrong document reads (cascading fallbacks, missing scope params, missing required context).

3. **State derivation**: `deriveLinearState()` in `linear-state.ts` only produces 5 phases (`pre-planning`, `planning`, `executing`, `verifying`, `summarizing`). The file-backed `deriveState()` in `state.ts` produces 10+ phases including `completing-milestone`, `replanning-slice`, `researching`, `discussing`. The Linear dispatch in `auto.ts` maps phases directly from `deriveLinearState` → `selectLinearPrompt`, meaning phases like research, replan, reassess, UAT, and milestone completion **cannot be dispatched** even if the prompt builders existed.

This drift directly causes UAT failures in Linear mode. The root cause is structural: no enforcement mechanism keeps two independent implementations in sync.

## Design Principle

The workflow methodology is the product. Storage backends (filesystem, Linear, future Jira/GitHub Projects) are interchangeable. The prompt builders must produce **equivalent agent behavior** regardless of backend. Differences are limited to HOW artifacts are read/written, never WHAT is read/written or WHEN.

## Architecture

### Key Insight: File Mode Inlines, Linear Mode Instructs

File-backed prompt builders **read files at dispatch time** and inline their content into the prompt. The agent receives pre-loaded context. These builders use markdown prompt templates in `src/resources/extensions/kata/prompts/` via `loadPrompt("execute-task", { ... })`.

Linear prompt builders **cannot inline** — the content lives in the Linear API. The agent must call `kata_read_document` at runtime to fetch it. These builders construct prompt strings directly (no template files).

This means the prompt text is structurally different between modes, but the **document manifest** (which docs to read, required vs optional, what order) must be identical.

### Key Insight: File Mode Has Dispatch-Time Checks That Linear Mode Lacks

In file-backed auto-mode, `dispatchNextUnit()` (auto.ts ~1130-1290) does significant work BEFORE selecting a prompt builder:

- `checkNeedsRunUat()` — checks if the last completed slice has a UAT file without a result
- `checkNeedsReassessment()` — checks if the last completed slice lacks an assessment file
- Research checks — before `plan-milestone` or `plan-slice`, checks if research exists; if not, dispatches research first
- Replan checks — if `state.phase === "replanning-slice"`, dispatches replan instead of normal execution

These are **dispatch-time routing decisions**, not just prompt construction. The Linear dispatch branch (auto.ts ~800-940) skips all of them — it maps `deriveLinearState().phase` directly to `selectLinearPrompt()`.

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

## Key Files Reference

All paths relative to `apps/cli/`:

| File | Role | Lines |
|------|------|-------|
| `src/resources/KATA-WORKFLOW.md` | File-mode methodology document (system prompt) | ~660 |
| `src/resources/LINEAR-WORKFLOW.md` | Linear-mode methodology document (system prompt) | ~270 |
| `src/resources/extensions/kata/auto.ts` | File-mode auto-mode: dispatch + prompt builders | ~3050 |
| `src/resources/extensions/kata/linear-auto.ts` | Linear-mode: state resolution + prompt builders | ~300 |
| `src/resources/extensions/kata/state.ts` | File-mode state derivation (`deriveState`) | ~500 |
| `src/resources/extensions/linear/linear-state.ts` | Linear state derivation (`deriveLinearState`) | ~370 |
| `src/resources/extensions/kata/types.ts` | Shared types including `Phase` union (L8) | ~175 |
| `src/resources/extensions/kata/prompts/` | Markdown prompt templates (file-mode only) | 25 files |
| `src/resources/extensions/kata/linear-config.ts` | Mode detection, workflow doc resolution | ~450 |
| `src/resource-loader.ts` | Syncs workflow docs to `~/.kata-cli/agent/` | ~100 |
| `src/loader.ts` | Sets env vars for workflow doc paths | ~100 |

### Test files

| File | What it tests |
|------|---------------|
| `src/resources/extensions/kata/tests/mode-switching.test.ts` | Workflow doc resolution per mode |
| `src/resources/extensions/kata/tests/linear-auto.test.ts` | Linear prompt builder output |
| `src/resources/extensions/linear/tests/entity-mapping.test.ts` | Entity creation, state mapping |

### Test runner command

```bash
cd apps/cli
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  'src/resources/extensions/kata/tests/mode-switching.test.ts' \
  'src/resources/extensions/kata/tests/linear-auto.test.ts' \
  'src/resources/extensions/linear/tests/entity-mapping.test.ts'
```

---

## Phase Comparison: File vs Linear (Current State)

### Phases produced by state derivers

| Phase | File-mode `deriveState` | Linear `deriveLinearState` | Notes |
|-------|------------------------|---------------------------|-------|
| `pre-planning` | ✅ | ✅ | Milestone exists, no roadmap/slices |
| `planning` | ✅ | ✅ | Slice in backlog/unstarted |
| `executing` | ✅ | ✅ | Slice started, tasks exist, none terminal |
| `verifying` | ✅ | ✅ | Some tasks terminal, some not |
| `summarizing` | ✅ | ✅ | All tasks terminal |
| `completing-milestone` | ✅ | ❌ | All slices complete |
| `replanning-slice` | ✅ | ❌ | Blocker discovered in task summary |
| `discussing` | ✅ | ❌ | No context file exists |
| `researching` | ✅ | ❌ | No research file exists |
| `complete` | ✅ | ✅ | All milestones done |
| `blocked` | ✅ | ✅ | Config/auth issues |

### Dispatch-time routing (in `auto.ts dispatchNextUnit`)

These are NOT phases from the state deriver. They are routing decisions made at dispatch time in the file-mode branch of `dispatchNextUnit`:

| Check | What it does | Linear equivalent |
|-------|-------------|-------------------|
| `checkNeedsRunUat()` | After slice completes, checks for UAT file without result | ❌ Missing |
| `checkNeedsReassessment()` | After slice completes, checks for missing assessment | ❌ Missing |
| Research-before-plan | Before `plan-milestone` or `plan-slice`, checks if research exists | ❌ Missing |
| Replan detection | `state.phase === "replanning-slice"` routes to replan builder | ❌ Missing (phase not produced) |

### Prompt builders

| Builder | File-mode (`auto.ts`) | Linear (`linear-auto.ts`) | Notes |
|---------|----------------------|--------------------------|-------|
| Research milestone | `buildResearchMilestonePrompt` | ❌ Missing | |
| Plan milestone | `buildPlanMilestonePrompt` | `buildLinearPlanMilestonePrompt` | ⚠️ Missing: idempotency, DECISIONS, REQUIREMENTS, PROJECT, prior milestone summary |
| Research slice | `buildResearchSlicePrompt` | ❌ Missing | |
| Plan slice | `buildPlanSlicePrompt` | `buildLinearPlanSlicePrompt` | ⚠️ Missing: M-ROADMAP read, dependency summaries, DECISIONS, REQUIREMENTS |
| Execute task | `buildExecuteTaskPrompt` | `buildLinearExecuteTaskPrompt` | ⚠️ Wrong: cascading fallbacks, no carry-forward, no continue, no scope param |
| Complete slice | `buildCompleteSlicePrompt` | `buildLinearCompleteSlicePrompt` | ⚠️ Missing: M-ROADMAP, S-PLAN, REQUIREMENTS reads |
| Complete milestone | `buildCompleteMilestonePrompt` | ❌ Missing | |
| Replan slice | `buildReplanSlicePrompt` | ❌ Missing | |
| Reassess roadmap | `buildReassessRoadmapPrompt` | ❌ Missing | |
| Run UAT | `buildRunUatPrompt` | ❌ Missing | |

---

## Phased Execution

### Phase 1: Merge Workflow Documents

Merge `KATA-WORKFLOW.md` and `LINEAR-WORKFLOW.md` into a single `KATA-WORKFLOW.md` with mode-conditional blocks. This is the methodology spec — one document, one source of truth.

**Step 1.1: Rewrite KATA-WORKFLOW.md as unified document**

File: `src/resources/KATA-WORKFLOW.md`

Start from the existing `KATA-WORKFLOW.md` (it is the more complete document). Add Linear-mode content from `LINEAR-WORKFLOW.md` as labeled conditional blocks within each section. Do NOT restructure the existing file-mode content.

Sections to augment with Linear-mode blocks:
- **Quick Start** — add Linear block: call `kata_derive_state` instead of reading `.kata/state.md`. Include the "do not read `.kata/` files" rule.
- **The Hierarchy** — add: Linear entity mapping table (LINEAR-WORKFLOW.md L53-63), entity title convention D021 (L66-83)
- **File Locations** — add: `### Artifact Storage (Linear Mode)` with document title format table, `kata_read_document`/`kata_write_document` usage, D028 markdown normalization, `requirements` field note
- **The Phases** — add: Linear phase transition table, `verifying` phase clarification (treat same as `executing`), `summarizing` phase definition, slice advancement via `kata_update_issue_state`
- **Continue-Here Protocol** — add: "In Linear mode, issue state is the continue protocol. Write partial summary + set issue to `verifying` for incomplete tasks."
- **State Management** — add: `kata_derive_state` replaces `state.md` in Linear mode
- **Summary Injection** — add: use `kata_read_document` instead of file reads in Linear mode
- **Checklist for a Fresh Session** — add: Linear-mode checklist (LINEAR-WORKFLOW.md L238-260)
- **When Context Gets Large** — add: Linear-mode guidance (LINEAR-WORKFLOW.md L262-274)

New sections to add at the end:
- **Tool Reference (Linear Mode)** — tool tables from LINEAR-WORKFLOW.md L200-234
- **Auto-Mode Contract (Linear Mode)** — from LINEAR-WORKFLOW.md L158-196

All Linear-mode blocks should use a consistent visual marker, e.g.:

```markdown
> **Linear mode:** In Linear mode, call `kata_derive_state` instead of reading `.kata/state.md`.
```

**Step 1.2: Delete LINEAR-WORKFLOW.md**

File: `src/resources/LINEAR-WORKFLOW.md` — delete

**Step 1.3: Update resource-loader.ts**

File: `src/resource-loader.ts`
- L36 (JSDoc): Remove `LINEAR-WORKFLOW.md` from list
- L69: Change `['KATA-WORKFLOW.md', 'LINEAR-WORKFLOW.md']` to `['KATA-WORKFLOW.md']`

**Step 1.4: Update loader.ts**

File: `src/loader.ts`
- L88: Delete `process.env.LINEAR_WORKFLOW_PATH = join(agentDir, "LINEAR-WORKFLOW.md");`

**Step 1.5: Update linear-config.ts**

File: `src/resources/extensions/kata/linear-config.ts`
- L88: Change type `"KATA-WORKFLOW.md" | "LINEAR-WORKFLOW.md"` → `"KATA-WORKFLOW.md"`
- L209-236: Simplify `resolveWorkflowProtocol()` — remove the `if (mode === "linear")` branch. Both modes resolve to `KATA_WORKFLOW_PATH` / `KATA-WORKFLOW.md`. The function body becomes just the current file-mode path resolution, applied unconditionally.
- L437: Update system-prompt notice to: `"Workflow mode is linear. Follow the Linear mode instructions in KATA-WORKFLOW.md. Do not fall back to file-backed .kata artifacts."`

**Step 1.6: Update linear-auto.ts references**

File: `src/resources/extensions/kata/linear-auto.ts`
- Replace all `LINEAR-WORKFLOW.md` references with `KATA-WORKFLOW.md` (L9, L115, L153, L198, L235, L273)

**Step 1.7: Update tests**

File: `src/resources/extensions/kata/tests/mode-switching.test.ts`
- Remove `LINEAR_WORKFLOW_PATH` from helper and env save/restore
- Update assertions to expect `documentName: "KATA-WORKFLOW.md"` in both modes

File: `src/resources/extensions/kata/tests/linear-auto.test.ts`
- L203: Change assertion from `LINEAR-WORKFLOW.md` to `KATA-WORKFLOW.md`

**Step 1.8: Verify**

```bash
cd apps/cli
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  'src/resources/extensions/kata/tests/mode-switching.test.ts' \
  'src/resources/extensions/kata/tests/linear-auto.test.ts'
rg 'LINEAR.WORKFLOW' src/
npx tsc --noEmit
```

---

### Phase 2: Define Phase Recipes

Introduce a shared data structure that declares what each phase reads and writes. This becomes the single source of truth that both renderers consume.

**Step 2.1: Create `phase-recipes.ts`**

File: `src/resources/extensions/kata/phase-recipes.ts`

```typescript
export interface DocumentRef {
  /** Document title pattern — uses ${mid}, ${sid}, ${tid} template vars */
  title: string;
  /** Why this document is read/written at this phase */
  purpose: string;
  /** If true, phase should fail visibly when document is missing */
  required: boolean;
}

export interface PhaseRecipe {
  /** Phase name matching the unit type in dispatch */
  phase: string;
  /** Human description of what this phase does */
  description: string;
  /** Documents to read before executing the phase */
  reads: DocumentRef[];
  /** Documents to write as output of the phase */
  writes: DocumentRef[];
  /** Read prior task summaries for carry-forward context */
  injectPriorSummaries: boolean;
  /** Read dependency slice summaries per roadmap depends:[] */
  injectDependencySummaries: boolean;
  /** Check for continue/resume state */
  checkContinue: boolean;
}
```

Define recipes for all 10 unit types. The recipe table below was derived by auditing every `inlineFile`, `inlineFileOptional`, and `inlineKataRootFile` call in `auto.ts`:

| Unit Type | Required Reads | Optional Reads | Writes | Prior Summaries | Dep Summaries | Continue |
|-----------|---------------|----------------|--------|-----------------|---------------|----------|
| `research-milestone` | `${mid}-CONTEXT` | `PROJECT`, `REQUIREMENTS`, `DECISIONS` | `${mid}-RESEARCH` | no | no | no |
| `plan-milestone` | `${mid}-CONTEXT` | `${mid}-RESEARCH`, prior milestone summary, `PROJECT`, `REQUIREMENTS`, `DECISIONS` | `${mid}-ROADMAP` | no | no | no |
| `research-slice` | `${mid}-ROADMAP` | `${mid}-CONTEXT`, `${mid}-RESEARCH`, `DECISIONS`, `REQUIREMENTS` | `${sid}-RESEARCH` | no | yes | no |
| `plan-slice` | `${mid}-ROADMAP` | `${sid}-RESEARCH`, `DECISIONS`, `REQUIREMENTS` | `${sid}-PLAN` + task issues | no | yes | no |
| `execute-task` | `${tid}-PLAN` | `${sid}-PLAN` (excerpt only) | `${tid}-SUMMARY` | yes (carry-forward from prior tasks) | no | yes |
| `complete-slice` | `${mid}-ROADMAP`, `${sid}-PLAN` | `REQUIREMENTS`, all `Txx-SUMMARY` for the slice | `${sid}-SUMMARY`, `${sid}-UAT` | yes (all task summaries) | no | no |
| `complete-milestone` | `${mid}-ROADMAP` | all `Sxx-SUMMARY`, `REQUIREMENTS`, `DECISIONS`, `PROJECT`, `${mid}-CONTEXT` | `${mid}-SUMMARY` | yes (all slice summaries) | no | no |
| `replan-slice` | `${mid}-ROADMAP`, `${sid}-PLAN` | blocker task summary, `DECISIONS` | `${sid}-REPLAN` | no | no | no |
| `reassess-roadmap` | `${mid}-ROADMAP`, completed `${sid}-SUMMARY` | `PROJECT`, `REQUIREMENTS`, `DECISIONS` | `${sid}-ASSESSMENT` | no | no | no |
| `run-uat` | `${sid}-UAT`, `${sid}-SUMMARY` | `PROJECT` | `${sid}-UAT-RESULT` | no | no | no |

**Step 2.2: Add parity tests**

File: `src/resources/extensions/kata/tests/phase-recipe.test.ts`

Tests that verify:
- Every unit type dispatched in `auto.ts` (file mode) has a corresponding recipe
- Every phase handled in `selectLinearPrompt` (Linear mode) has a corresponding recipe
- Recipe required-read lists match what the file-backed prompt builders actually inline via `inlineFile` (required) vs `inlineFileOptional` (optional)

These tests are the enforcement mechanism. If someone adds a document read to a file-backed builder without updating the recipe, the test fails.

---

### Phase 3: Rewrite Linear Prompt Builders and Dispatch

This is the largest phase. It has three sub-parts: fix state derivation gaps, add missing prompt builders, and fix existing ones.

#### Step 3.1: Extend Linear state derivation

File: `src/resources/extensions/linear/linear-state.ts`

The file-mode `deriveState()` produces phases that `deriveLinearState()` does not. Some of these phases are dispatch-time routing decisions in file mode (research-before-plan, reassessment checks). For Linear mode, decide for each:

| Missing phase | Approach |
|--------------|----------|
| `completing-milestone` | Add to `deriveLinearState`: when all slices in the active milestone are terminal AND the milestone itself is not yet complete, return `completing-milestone`. Currently this falls through to the next milestone's `pre-planning`. |
| `replanning-slice` | In file mode, this is detected by reading task summary frontmatter for `blocker_discovered: true`. In Linear mode, equivalent check: scan task summaries via `kata_read_document` for blocker flag. **Decision needed:** implement in state deriver or in dispatch-time routing (see Step 3.5). |
| Research phases | In file mode, these are dispatch-time checks, NOT state deriver phases. The deriver returns `pre-planning` or `planning`; the dispatcher checks for research files and routes accordingly. Same approach for Linear: keep dispatch-time routing. |

#### Step 3.2: Add 6 missing prompt builders to `linear-auto.ts`

Each builder must:
- Consume the phase recipe for its unit type (read the same documents, in the same order)
- Specify `projectId` explicitly in every `kata_read_document` / `kata_write_document` instruction
- Mark required reads as hard failures ("if null, stop — planning phase incomplete")
- Mark optional reads as skippable ("if null, continue")

Builders to add:

1. **`buildLinearResearchMilestonePrompt(state)`**
   - Reads: `${mid}-CONTEXT` (required), `PROJECT`, `REQUIREMENTS`, `DECISIONS` (optional)
   - Writes: `${mid}-RESEARCH`

2. **`buildLinearResearchSlicePrompt(state)`**
   - Reads: `${mid}-ROADMAP` (required), `${mid}-CONTEXT`, `${mid}-RESEARCH`, `DECISIONS`, `REQUIREMENTS` (optional)
   - Instructs agent to read dependency slice summaries
   - Writes: `${sid}-RESEARCH`

3. **`buildLinearCompleteMilestonePrompt(state)`**
   - Reads: `${mid}-ROADMAP` (required), all `Sxx-SUMMARY` (required), `REQUIREMENTS`, `DECISIONS`, `PROJECT`, `${mid}-CONTEXT` (optional)
   - Writes: `${mid}-SUMMARY`

4. **`buildLinearReplanSlicePrompt(state)`**
   - Reads: `${mid}-ROADMAP` (required), `${sid}-PLAN` (required), blocker task summary (optional), `DECISIONS` (optional)
   - Writes: `${sid}-REPLAN`

5. **`buildLinearReassessRoadmapPrompt(state, completedSliceId)`**
   - Reads: `${mid}-ROADMAP` (required), `${completedSid}-SUMMARY` (required), `PROJECT`, `REQUIREMENTS`, `DECISIONS` (optional)
   - Writes: `${completedSid}-ASSESSMENT`

6. **`buildLinearRunUatPrompt(state, sliceId)`**
   - Reads: `${sid}-UAT` (required), `${sid}-SUMMARY` (required), `PROJECT` (optional)
   - Writes: `${sid}-UAT-RESULT`

#### Step 3.3: Fix existing 4 prompt builders

**`buildLinearExecuteTaskPrompt`:**
- Read `${tid}-PLAN` with `{ projectId }` — required. If null, stop: "Task plan missing. Planning phase did not complete correctly."
- Read `${sid}-PLAN` with `{ projectId }` — optional, for slice context excerpt
- Instruct agent to read prior task summaries for carry-forward (list task issues, read `Txx-SUMMARY` for completed prior tasks)
- Instruct agent to check for continue state (partial summary on the task)
- **Remove** cascading fallback chain (T-PLAN → S-PLAN → M-ROADMAP → invent)
- **Remove** plan auto-creation from thin air

**`buildLinearPlanSlicePrompt`:**
- Read `${mid}-ROADMAP` with `{ projectId }` — **required** (currently not read at all)
- Read `${sid}-RESEARCH` — optional
- Read `DECISIONS`, `REQUIREMENTS` — optional
- Instruct agent to read dependency slice summaries (check `depends:[]` in roadmap)
- Keep idempotency check (list existing tasks before creating)

**`buildLinearPlanMilestonePrompt`:**
- Read `${mid}-CONTEXT` with `{ projectId }` — required
- Read `${mid}-RESEARCH`, prior milestone summary, `PROJECT`, `REQUIREMENTS`, `DECISIONS` — optional
- Add idempotency check (list existing slices before creating)

**`buildLinearCompleteSlicePrompt`:**
- Read `${mid}-ROADMAP` with `{ projectId }` — **required** (currently not read)
- Read `${sid}-PLAN` with `{ projectId }` — **required** (currently not read, needed for success criteria)
- Read `REQUIREMENTS` — optional
- Read all task summaries — required (currently done correctly)
- Write `${sid}-SUMMARY` AND `${sid}-UAT`

#### Step 3.4: Update `selectLinearPrompt` dispatcher

File: `src/resources/extensions/kata/linear-auto.ts`

Add cases for new phases/unit types. Current switch handles: `pre-planning`, `planning`, `executing`, `verifying`, `summarizing`, `complete`, `blocked`.

Add: `completing-milestone`, `replanning-slice` (if state-derived), and any other phases added in Step 3.1.

#### Step 3.5: Update Linear dispatch routing in `auto.ts`

File: `src/resources/extensions/kata/auto.ts`, function `dispatchNextUnit`, Linear branch (~L800-940).

Currently this branch does:
```
deriveLinearState → selectLinearPrompt(state) → dispatch
```

It needs to mirror the file-mode routing:

1. **Before** calling `selectLinearPrompt`, run Linear equivalents of:
   - `checkNeedsRunUat` — query completed slices, check for UAT doc without UAT-RESULT doc
   - `checkNeedsReassessment` — query completed slices, check for missing ASSESSMENT doc
   - Research-before-plan routing — when phase is `pre-planning`, check for `${mid}-RESEARCH` doc; if missing, dispatch research instead of plan. Same for `planning` phase with `${sid}-RESEARCH`.

2. These checks use `kata_read_document` / `kata_list_documents` to probe for document existence instead of filesystem checks.

3. The routing result overrides `selectLinearPrompt` when a pre-check triggers (same pattern as file mode).

**Design decision for implementer:** These dispatch-time checks can either:
- (A) Live in `linear-auto.ts` as `checkLinearNeedsRunUat()` etc., called from the dispatch branch in `auto.ts`
- (B) Be folded into `deriveLinearState()` so it returns richer phases

Option (A) is closer to file-mode parity. Option (B) is cleaner but changes the state deriver contract. The implementer should choose based on what's simpler to test.

#### Step 3.6: Expand tests

File: `src/resources/extensions/kata/tests/linear-auto.test.ts`

Add tests for all new prompt builders:
- Each builder references the correct documents from the recipe
- Each builder specifies `projectId` scope
- No builder uses cascading fallbacks
- Required reads produce failure instructions when null
- `selectLinearPrompt` handles all new phases

---

### Phase 4: Refactor File-Backed Builders to Consume Recipes (Future)

Once recipes exist and Linear builders consume them, optionally refactor `auto.ts` builders to also consume recipes. This makes enforcement bidirectional — both implementations are verified against the same recipe.

This phase is lower priority because `auto.ts` is already correct. The recipes primarily protect the Linear (and future) implementations. But doing this closes the loop: changes to either implementation that don't match the recipe will fail tests.

---

## Verification Plan

### Phase 1 verification
- `mode-switching.test.ts` passes
- `linear-auto.test.ts` passes
- `rg 'LINEAR.WORKFLOW' src/` returns 0 hits
- `npx tsc --noEmit` passes
- Merged document reads coherently — file-mode sections unchanged, Linear-mode blocks clearly labeled

### Phase 2 verification
- `phase-recipe.test.ts` passes
- Every unit type in file-mode dispatch has a recipe
- Every phase in `selectLinearPrompt` has a recipe
- Recipe document lists match `auto.ts` actual reads (verified by test inspection of builder function bodies)

### Phase 3 verification
- `linear-auto.test.ts` passes (expanded to cover all 10 builders)
- Every Linear builder references the same documents as its file-backed counterpart (verified against recipe)
- No Linear builder uses cascading fallbacks
- Every `kata_read_document` / `kata_write_document` instruction includes explicit `{ projectId }` scope
- `selectLinearPrompt` handles all phases from the recipe list
- `npx tsc --noEmit` passes
- Full test suite: `cd apps/cli && npm test`
- Manual UAT: run `/kata` and `/kata auto` in Linear mode, verify correct document reads at each phase

---

## Future Backend Extensibility

When adding Jira support:

1. **Phase recipes are unchanged** — same documents, same phases
2. **Write a Jira renderer** — translates recipes into Jira-specific tool call instructions (different API, different scoping, possibly different document storage strategy for backends without native documents)
3. **Write a Jira state deriver** — produces `KataState` from Jira issue states, must produce the same phase set
4. **Add a Jira dispatch branch** to `dispatchNextUnit` with the same routing checks
5. **Recipe parity tests automatically cover** the new backend — any missing phase or document read is caught

The recipe layer means adding a backend is O(renderer) not O(workflow). The workflow logic is written once.

## What This Plan Does NOT Do

- Does not refactor `auto.ts` prompt builder internals (Phase 4 is marked future)
- Does not change the file-backed workflow behavior in any way
- Does not add new phases or documents to the methodology
- Does not change the Linear tool implementations (`linear-tools.ts`, `linear-client.ts`, etc.)
- Does not change how `kata_read_document` / `kata_write_document` tools work — only how prompts instruct the agent to use them
