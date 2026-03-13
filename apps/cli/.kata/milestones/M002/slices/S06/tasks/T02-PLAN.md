---
estimated_steps: 6
estimated_files: 4
---

# T02: Unblock auto entrypoint + create Linear auto-mode prompt builders + wire into startAuto/dispatchNextUnit

**Slice:** S06 — Workflow Prompt & Auto-Mode Integration
**Milestone:** M002

## Description

Delivers R108: `/kata auto` works in Linear mode. Three parallel concerns:

1. **Gate** — change `linear-config.ts` to return `allow: true` for the `"auto"` entrypoint.
2. **Prompt builders** — create `linear-auto.ts` with a `resolveLinearKataState()` helper and per-phase prompt builders (`buildLinearExecuteTaskPrompt`, `buildLinearPlanSlicePrompt`, `buildLinearPlanMilestonePrompt`, `buildLinearCompleteSlicePrompt`). These prompts orient the agent, give it the active entity context, and tell it to use `LINEAR-WORKFLOW.md` for detailed operation steps.
3. **Loop wiring** — update `auto.ts` `startAuto()` and `dispatchNextUnit()` to use mode-aware state derivation and dispatch to `linear-auto.ts` builders in Linear mode; skip all git operations in Linear mode.

Also updates the `auto` assertion in `mode-switching.test.ts` that will break when the entrypoint is unblocked.

**Circular dependency note:** `commands.ts` imports from `auto.ts`, so `auto.ts` cannot import `deriveKataState` from `commands.ts`. Instead, `linear-auto.ts` exports its own `resolveLinearKataState(basePath)` that mirrors the same pattern directly (importing `LinearClient`, `ensureKataLabels`, `deriveLinearState`, `isLinearMode`, `loadEffectiveLinearProjectConfig`, `deriveState` without going through `commands.ts`).

## Steps

1. **Unblock `"auto"` in `linear-config.ts`** — in `buildLinearEntrypointGuard()`, change the `"auto"` case from `blockedLinearEntrypoint(...)` to:
   ```ts
   case "auto":
     return {
       mode: "linear",
       isLinearMode: true,
       allow: true,
       noticeLevel: "info",
       notice: "Running in Linear mode. State derived from Linear API.",
       protocol,
     };
   ```

2. **Fix `auto` assertions in `mode-switching.test.ts`** — in the "blocks file-backed entrypoints" test, update the `auto` block:
   - `assert.equal(auto.allow, false)` → `assert.equal(auto.allow, true)`
   - Remove or replace the `assert.match(auto.notice ...)` that matched the old "file-backed workflow" notice; if keeping a match, use `/linear mode/i`
   - Also update the test title to reflect that `status` and `auto` are now allowed, not blocked

3. **Create `src/resources/extensions/kata/linear-auto.ts`** with:
   - Import `LinearClient` from `"../linear/linear-client.js"`
   - Import `ensureKataLabels` from `"../linear/linear-entities.js"`
   - Import `deriveLinearState` from `"../linear/linear-state.js"`
   - Import `{ isLinearMode, loadEffectiveLinearProjectConfig }` from `"./linear-config.js"`
   - Import `{ deriveState }` from `"./state.js"`
   - Import `KataState` from `"./types.js"`
   - **`resolveLinearKataState(basePath: string): Promise<KataState>`** — mirrors `commands.ts::deriveKataState` exactly: if not Linear mode, calls `deriveState(basePath)`; otherwise checks API key, config, calls `LinearClient` + `ensureKataLabels` + `deriveLinearState`; wraps errors as `phase:"blocked"` with `blockers[]`
   - **`buildLinearExecuteTaskPrompt(state: KataState): string`** — for `executing` and `verifying` phases; includes active milestone ID, slice UUID hint (instructs agent to call `kata_list_slices` if UUID unknown), active task Kata ID and title; instructs to: (1) call `kata_derive_state` to confirm context, (2) call `kata_read_document` to read task plan, (3) execute the task, (4) call `kata_write_document` to write task summary, (5) call `kata_update_issue_state({ issueId, phase: "done" })` to advance — resolve UUID via `kata_list_tasks(sliceIssueId)` matching task title; reference `LINEAR-WORKFLOW.md` for full operations
   - **`buildLinearPlanSlicePrompt(state: KataState): string`** — for `planning` phase; active milestone ID + slice Kata ID and title; instructs to: (1) call `kata_derive_state`, (2) read slice context/research documents if they exist, (3) write slice plan document via `kata_write_document` (title `"S01-PLAN"` etc.), (4) advance slice to `planning` phase completed by calling `kata_update_issue_state({ issueId, phase: "executing" })`; reference `LINEAR-WORKFLOW.md`
   - **`buildLinearPlanMilestonePrompt(state: KataState): string`** — for `pre-planning` phase; active milestone ID and title; instructs to: (1) call `kata_derive_state`, (2) call `kata_read_document` for milestone context/research if exists, (3) write roadmap document via `kata_write_document` (title `"M001-ROADMAP"`), (4) create slice issues and task sub-issues per roadmap using `kata_create_slice` + `kata_create_task`; reference `LINEAR-WORKFLOW.md`
   - **`buildLinearCompleteSlicePrompt(state: KataState): string`** — for `summarizing` phase; instructs to: (1) call `kata_derive_state`, (2) collect all task summaries via `kata_read_document`, (3) write slice summary via `kata_write_document` (title `"S01-SUMMARY"`), (4) advance slice to done via `kata_update_issue_state({ issueId, phase: "done" })`; reference `LINEAR-WORKFLOW.md`
   - **`selectLinearPrompt(state: KataState): string | null`** — dispatcher: maps `phase` to the right builder; returns `null` for `"complete"` (stop); throws/returns `null` for `"blocked"` (caller handles)

4. **Update `auto.ts` `startAuto()`** — add Linear-mode branch:
   - Add imports from `"./linear-auto.js"`: `resolveLinearKataState` and `selectLinearPrompt`
   - Add import of `isLinearMode` from `"./linear-config.js"` (extend existing import)
   - After the paused-resume early-return block, add:
     ```ts
     if (isLinearMode()) {
       // Skip git + .kata bootstrap — project is configured via .kata/preferences.md which must already exist
       const state = await resolveLinearKataState(base);
       if (!state.activeMilestone || state.phase === "complete") {
         ctx.ui.notify("Linear project has no active milestone. Run /kata to set up a milestone first.", "info");
         return;
       }
       if (state.phase === "blocked") {
         ctx.ui.notify(`Blocked: ${state.blockers?.join(", ")}. Fix and run /kata auto.`, "warning");
         return;
       }
       active = true;
       verbose = verboseMode;
       cmdCtx = ctx;
       basePath = base;
       lastUnit = null;
       retryCount = 0;
       autoStartTime = Date.now();
       completedUnits = [];
       currentUnit = null;
       currentMilestoneId = state.activeMilestone?.id ?? null;
       originalModelId = ctx.model?.id ?? null;
       initMetrics(base);
       ctx.ui.setStatus("kata-auto", "auto");
       ctx.ui.notify("Auto-mode started (Linear mode). Looping until milestone complete.", "info");
       await dispatchNextUnit(ctx, pi);
       return;
     }
     ```
   - The existing file-mode startup block follows unchanged.

5. **Update `auto.ts` `handleAgentEnd()`** — skip `autoCommitCurrentBranch` in Linear mode:
   ```ts
   if (!isLinearMode() && currentUnit) {
     try { /* existing autoCommitCurrentBranch call */ } catch { /* non-fatal */ }
   }
   ```

6. **Update `auto.ts` `dispatchNextUnit()`** — add Linear-mode dispatch path:
   - After `if (!active || !cmdCtx) return;` and before `let state = await deriveState(basePath)`:
     - If `isLinearMode()`: replace `deriveState(basePath)` with `resolveLinearKataState(basePath)` for the state used in this function
   - Skip the `complete-slice` post-merge block (the `if (currentUnit?.type === "complete-slice")` block with `switchToMain`/`mergeSliceToMain`) in Linear mode: wrap it with `if (!isLinearMode()) { ... }`
   - Add Linear-mode dispatch before the existing phase handlers. After resolving `state`, if `isLinearMode()`:
     ```ts
     if (isLinearMode()) {
       if (state.phase === "complete" || state.phase === "blocked") {
         // existing stop/blocked handling
       }
       const prompt = selectLinearPrompt(state);
       if (!prompt) { await stopAuto(ctx, pi); return; }
       const unitPhase = state.phase;
       const mid = state.activeMilestone?.id ?? "unknown";
       const sid = state.activeSlice?.id ?? "";
       const tid = state.activeTask?.id ?? "";
       unitType = `linear-${unitPhase}`;
       unitId = tid ? `${mid}/${sid}/${tid}` : sid ? `${mid}/${sid}` : mid;
       // dispatch prompt to new session
       // [use same pi.sendMessage / newSession pattern as file mode]
       // ... (follow the existing unit dispatch pattern below for model resolution, metric snapshot, etc.)
       return;
     }
     ```
   - Also skip `ensureSliceBranch` calls within the existing file-mode phase handlers by wrapping with `!isLinearMode()` (or the Linear-mode branch has already returned by this point, so no change needed to file-mode path)

## Must-Haves

- [ ] `getWorkflowEntrypointGuard("auto")` returns `allow: true` in Linear mode
- [ ] `mode-switching.test.ts` passes with 0 failures after both `status` and `auto` guard changes
- [ ] `linear-auto.ts` exports `resolveLinearKataState`, `selectLinearPrompt`, and the 4 prompt builders
- [ ] `resolveLinearKataState` returns `phase:"blocked"` with `blockers[]` when `LINEAR_API_KEY` is not set
- [ ] `resolveLinearKataState` returns `phase:"blocked"` when `linear.projectId` or `linear.teamId` not configured
- [ ] `selectLinearPrompt` returns `null` for `phase === "complete"` and for `phase === "blocked"`
- [ ] `auto.ts` `startAuto()` uses `resolveLinearKataState` in Linear mode and skips git/`.kata/` bootstrap
- [ ] `auto.ts` `handleAgentEnd()` skips `autoCommitCurrentBranch` in Linear mode
- [ ] `auto.ts` `dispatchNextUnit()` calls `selectLinearPrompt` and dispatches in Linear mode
- [ ] Slice merge block (`switchToMain` + `mergeSliceToMain`) is skipped in Linear mode
- [ ] `npx tsc --noEmit` is clean

## Verification

```bash
# Mode-switching test: 3/3 pass (status and auto now both true)
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/kata/tests/mode-switching.test.ts
# → 3 pass, 0 fail

# Confirm auto unblocked
grep -A 5 '"auto":' src/resources/extensions/kata/linear-config.ts | grep "allow: true"
# → found

# Confirm resolveLinearKataState exported
grep "export.*resolveLinearKataState\|export.*selectLinearPrompt" \
  src/resources/extensions/kata/linear-auto.ts
# → found

# TypeScript clean
npx tsc --noEmit
# → no output
```

## Observability Impact

- Signals added/changed: `dispatchNextUnit()` emits `ctx.ui.notify()` for Linear-mode phase dispatch (e.g. "Executing task T01 in Linear mode."); `resolveLinearKataState` surfaces `phase:"blocked"` + `blockers[]` for config errors — auto-mode surfaces this as a warning and stops rather than crashing
- How a future agent inspects this: call `kata_derive_state` tool to get current state; check `phase` and `blockers[]`; `getWorkflowEntrypointGuard("auto")` returns the allow status; `isLinearMode()` tells whether Linear mode is active
- Failure state exposed: `phase:"blocked"` propagates from `resolveLinearKataState` → `dispatchNextUnit` → `stopAuto` with blockers message in notify; no silent fallback to file mode

## Inputs

- `src/resources/extensions/kata/linear-config.ts` — `buildLinearEntrypointGuard()` to modify; `isLinearMode()`, `loadEffectiveLinearProjectConfig()` to import in `linear-auto.ts`
- `src/resources/extensions/kata/tests/mode-switching.test.ts` — stale `auto` assertions to fix
- `src/resources/extensions/kata/auto.ts` — `startAuto()`, `handleAgentEnd()`, `dispatchNextUnit()` to modify; imports to extend
- `src/resources/extensions/kata/commands.ts:deriveKataState()` (lines 313–375) — reference implementation to mirror in `linear-auto.ts::resolveLinearKataState`; do NOT import from commands.ts (circular dep: commands.ts imports from auto.ts)
- S05 Summary — `kata_derive_state` tool contract, `kata_update_issue_state` parameters, UUID resolution pattern via `kata_list_tasks`

## Expected Output

- `src/resources/extensions/kata/linear-config.ts` — `"auto"` case returns `allow: true`
- `src/resources/extensions/kata/tests/mode-switching.test.ts` — `auto` assertions fixed; all 3 tests pass
- `src/resources/extensions/kata/linear-auto.ts` — new module: `resolveLinearKataState`, `selectLinearPrompt`, 4 prompt builders
- `src/resources/extensions/kata/auto.ts` — Linear-mode branch in `startAuto`, `handleAgentEnd`, `dispatchNextUnit`; git operations skipped in Linear mode
