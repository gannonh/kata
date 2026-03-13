---
id: T02
parent: S06
milestone: M002
provides:
  - "linear-config.ts — auto entrypoint unblocked (allow: true with Linear-mode notice)"
  - "linear-auto.ts — resolveLinearKataState, selectLinearPrompt, and 4 prompt builders (execute, plan-slice, plan-milestone, complete-slice)"
  - "auto.ts — Linear-mode branch in startAuto(), handleAgentEnd(), and dispatchNextUnit()"
  - "tests/linear-auto.test.ts — 20 unit tests for selectLinearPrompt and all 4 prompt builders"
key_files:
  - src/resources/extensions/kata/linear-config.ts
  - src/resources/extensions/kata/linear-auto.ts
  - src/resources/extensions/kata/auto.ts
  - src/resources/extensions/kata/tests/mode-switching.test.ts
  - src/resources/extensions/kata/tests/linear-auto.test.ts
key_decisions:
  - "resolveLinearKataState lives in linear-auto.ts (not commands.ts) to avoid the circular dependency: commands.ts imports from auto.ts which imports from commands.ts"
  - "dispatchNextUnit Linear-mode path returns early after pi.sendMessage — file-mode path follows unchanged, avoids any accidental interaction between the two paths"
  - "pi.sendMessage with { content: prompt } used for Linear dispatch (same pi API surface as rest of auto.ts)"
  - "Slice merge block (switchToMain + mergeSliceToMain) is unreachable in Linear mode because the Linear branch returns early at the top of dispatchNextUnit"
patterns_established:
  - "isLinearMode() early-return at top of dispatchNextUnit for complete Linear-mode dispatch with stuck detection, metrics snapshot, and model switching"
  - "resolveLinearKataState mirrors deriveKataState from commands.ts — no circular dep, same blocked/error shapes"
  - "selectLinearPrompt dispatcher: maps phase → prompt builder, returns null for complete/blocked/unknown"
observability_surfaces:
  - "dispatchNextUnit emits ctx.ui.notify('Linear auto-mode: <phase> — <unitId>') for every Linear unit dispatch"
  - "resolveLinearKataState returns phase:blocked + blockers[] for missing API key, missing teamId/projectId, or API error — auto-mode surfaces as warning and stops"
  - "Stuck detection in Linear-mode dispatch: emits error notify after MAX_RETRIES with unit type and ID"
duration: 35min
verification_result: passed
completed_at: 2026-03-12T19:40:00Z
blocker_discovered: false
---

# T02: Unblock auto entrypoint + create Linear auto-mode prompt builders + wire into startAuto/dispatchNextUnit

**`/kata auto` is now fully operational in Linear mode — the auto entrypoint is unblocked, `linear-auto.ts` provides state resolution and 4 phase-aware prompt builders, and `auto.ts` dispatches Linear units with stuck detection and metrics snapshots.**

## What Happened

**Step 1 — Unblock `auto` in `linear-config.ts`:** Changed the `"auto"` case in `buildLinearEntrypointGuard()` from `blockedLinearEntrypoint(...)` to return `allow: true` with `noticeLevel: "info"` and notice `"Running in Linear mode. State derived from Linear API."`.

**Step 2 — Fix test assertions in `mode-switching.test.ts`:** Updated the `auto` assertions from `allow: false` / notice matching old blocked message to `allow: true` / notice matching `/linear mode/i`. Also updated the test title to reflect that both `status` and `auto` are now allowed. All 3 mode-switching tests pass.

**Step 3 — Created `linear-auto.ts`:** New module with:
- `resolveLinearKataState(basePath)` — mirrors `commands.ts::deriveKataState` exactly without importing from commands.ts (which would create a circular dep through `auto.ts`). Returns `phase:"blocked"` with `blockers[]` for missing API key, missing config, or API error.
- `buildLinearExecuteTaskPrompt(state)` — for executing/verifying phases; includes milestone, slice, task IDs; instructs agent to call `kata_derive_state`, read task plan, execute, write summary, advance via `kata_update_issue_state`; references `LINEAR-WORKFLOW.md`.
- `buildLinearPlanSlicePrompt(state)` — for planning phase; instructs to read context/research, write slice plan, create task issues, advance slice to executing.
- `buildLinearPlanMilestonePrompt(state)` — for pre-planning phase; instructs to read context/research, write roadmap, create slice + task issues.
- `buildLinearCompleteSlicePrompt(state)` — for summarizing phase; instructs to collect task summaries, write slice summary, advance slice to done.
- `selectLinearPrompt(state)` — dispatcher mapping phase → builder; returns null for complete, blocked, and unknown phases.

**Step 4 — Updated `auto.ts` `startAuto()`:** Added Linear-mode early branch immediately after the paused-resume block and before git bootstrap. In Linear mode: calls `resolveLinearKataState`, handles missing milestone and blocked states with notify messages, initializes auto-mode state variables, and dispatches the first unit. File-mode path is unchanged.

**Step 5 — Updated `auto.ts` `handleAgentEnd()`:** Wrapped `autoCommitCurrentBranch` call with `!isLinearMode() && currentUnit` guard. In Linear mode, no slice branches exist so the commit is skipped.

**Step 6 — Updated `auto.ts` `dispatchNextUnit()`:** Added a full Linear-mode dispatch path at the top of the function that returns early after dispatching. Uses `resolveLinearKataState` for state, handles complete/blocked phases with existing stop/notify patterns, includes stuck detection (same MAX_RETRIES logic as file mode), snapshots metrics for the previous unit, creates a new session, applies retry diagnostics, and dispatches the prompt via `pi.sendMessage`. The file-mode path (including `complete-slice` merge block) is unreachable when `isLinearMode()` is true.

**Tests:** Created `linear-auto.test.ts` with 20 unit tests covering `selectLinearPrompt` for all phases and all 4 prompt builders for content correctness (IDs, tool references, `LINEAR-WORKFLOW.md` reference).

## Verification

```
# Mode-switching tests: 3/3 pass
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/kata/tests/mode-switching.test.ts
→ pass 3, fail 0

# Linear-auto unit tests: 20/20 pass
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/kata/tests/linear-auto.test.ts
→ pass 20, fail 0

# Full suite: 84/84 pass (was 64 before this task)
npm test → pass 84, fail 0

# TypeScript: clean
npx tsc --noEmit → no output

# Auto unblocked confirmed
getWorkflowEntrypointGuard("auto", ...) → allow: true

# Exports present
grep "export.*resolveLinearKataState\|export.*selectLinearPrompt" linear-auto.ts
→ both found
```

## Diagnostics

- `dispatchNextUnit` logs `"Linear auto-mode: <phase> — <unitId>"` via `ctx.ui.notify` on every Linear dispatch
- `resolveLinearKataState` surfaces `phase:"blocked"` + `blockers[]` for: (1) missing `LINEAR_API_KEY`, (2) missing `linear.teamId`/`linear.projectId`, (3) Linear API error
- Auto-mode stoppage in blocked/complete cases is observable via `ctx.ui.notify` warning message
- Stuck detection fires after `MAX_RETRIES` and emits an error notify with the unit type and ID

## Deviations

None. All 6 task plan steps implemented as specified.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/kata/linear-config.ts` — `auto` case unblocked: returns `allow: true`
- `src/resources/extensions/kata/linear-auto.ts` — new module: `resolveLinearKataState`, `selectLinearPrompt`, 4 prompt builders
- `src/resources/extensions/kata/auto.ts` — Linear-mode branches in `startAuto`, `handleAgentEnd`, `dispatchNextUnit`; imports extended with `isLinearMode`, `resolveLinearKataState`, `selectLinearPrompt`
- `src/resources/extensions/kata/tests/mode-switching.test.ts` — `auto` assertions fixed; test title updated
- `src/resources/extensions/kata/tests/linear-auto.test.ts` — new: 20 unit tests for prompt builders and dispatcher
