---
estimated_steps: 3
estimated_files: 1
---

# T03: Unit tests for Linear auto routing + full test suite + TypeScript clean

**Slice:** S06 — Workflow Prompt & Auto-Mode Integration
**Milestone:** M002

## Description

Validates R107 and R108 with executable assertions. Creates `linear-auto.test.ts` to prove the routing logic in `linear-auto.ts` is correct — specifically that `resolveLinearKataState` handles missing credentials gracefully, and that `selectLinearPrompt` dispatches each KataState phase to the correct prompt builder. Then runs the full test suite to confirm there are no regressions, and verifies TypeScript compiles clean.

No mocks of the Linear API are needed — the unit tests use KataState fixtures with no network calls.

## Steps

1. **Write `src/resources/extensions/kata/tests/linear-auto.test.ts`** with these test cases:
   - **`resolveLinearKataState returns blocked when LINEAR_API_KEY is not set`** — unset env var, call `resolveLinearKataState("/tmp")` in Linear-mode config context (set preferences mock or use withWorkflowEnv pattern), assert `state.phase === "blocked"` and `state.blockers?.length > 0`
   - **`resolveLinearKataState falls back to deriveState in file mode`** — with file-mode preferences (no workflow.mode:linear), assert that calling `resolveLinearKataState` with a temp directory produces a valid KataState (phase: "pre-planning" for empty dir is acceptable)
   - **`selectLinearPrompt returns null for phase complete`** — pass KataState with `phase: "complete"`, assert result is `null`
   - **`selectLinearPrompt returns null for phase blocked`** — pass KataState with `phase: "blocked"`, assert result is `null`
   - **`selectLinearPrompt returns execute-task prompt for phase executing`** — pass KataState with `phase: "executing"`, `activeMilestone: { id: "M001", title: "Test" }`, `activeSlice: { id: "S01", title: "Slice" }`, `activeTask: { id: "T01", title: "Task" }`, assert result is a non-empty string containing "T01" or "kata_derive_state"
   - **`selectLinearPrompt returns execute-task prompt for phase verifying`** — same as above with `phase: "verifying"`; asserts same builder path (not stop)
   - **`selectLinearPrompt returns plan-slice prompt for phase planning`** — phase: "planning", activeSlice set; assert result non-empty and mentions "S01" or slice-related instruction
   - **`selectLinearPrompt returns plan-milestone prompt for phase pre-planning`** — phase: "pre-planning", activeMilestone set; assert result non-empty and mentions "M001"
   - **`selectLinearPrompt returns complete-slice prompt for phase summarizing`** — phase: "summarizing", activeSlice set; assert result non-empty and mentions summary operation

   Use `node:test` + `assert/strict` (same pattern as `mode-switching.test.ts`). No imports of `LinearClient` needed — tests exercise `selectLinearPrompt` and the state-fixture path of `resolveLinearKataState` only.

2. **Run `npm test`** (full test suite: all `*.test.ts` + `*.test.mjs` in `src/resources/extensions/kata/tests/` and `src/tests/`). Fix any failures found; the only expected failures at this point are pre-existing and should already have been fixed in T01/T02.

3. **Run `npx tsc --noEmit`** and fix any TypeScript errors. Common issues to watch for:
   - Unused imports in `auto.ts` after adding `isLinearMode` import
   - Missing return type on `resolveLinearKataState`
   - `KataState.blockers` being typed as `string[] | undefined` — safe-access with `?`

## Must-Haves

- [ ] `linear-auto.test.ts` exists with at least 8 test cases
- [ ] `resolveLinearKataState` blocked-on-no-key test passes
- [ ] `selectLinearPrompt` returns `null` for `complete` and `blocked` phases
- [ ] `selectLinearPrompt` returns non-null for `executing`, `verifying`, `planning`, `pre-planning`, `summarizing`
- [ ] `verifying` dispatches to same path as `executing` (not stop)
- [ ] `npm test` exits 0 (no failures across all test files)
- [ ] `npx tsc --noEmit` exits 0 (no TypeScript errors)

## Verification

```bash
# Run new unit tests
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/kata/tests/linear-auto.test.ts
# → all pass, 0 fail

# Full suite
npm test
# → exit 0, no failures

# TypeScript
npx tsc --noEmit
# → no output, exit 0

# Confirm test file count
wc -l src/resources/extensions/kata/tests/linear-auto.test.ts
# → 50-150 lines
```

## Observability Impact

- Signals added/changed: None — this task adds tests, not production code
- How a future agent inspects this: `linear-auto.test.ts` is the canonical regression proof for S06 routing; run it with the `--test` flag to verify the routing is intact after any changes to `linear-auto.ts`
- Failure state exposed: test failures in `linear-auto.test.ts` immediately surface which phase is broken and which prompt builder is missing or misrouted

## Inputs

- `src/resources/extensions/kata/linear-auto.ts` (from T02) — the module under test; must export `resolveLinearKataState` and `selectLinearPrompt`
- `src/resources/extensions/kata/tests/mode-switching.test.ts` — reference pattern for test structure (withWorkflowEnv helper, node:test/assert/strict usage)
- `src/resources/extensions/kata/types.ts` — `KataState` type for constructing fixture states in tests

## Expected Output

- `src/resources/extensions/kata/tests/linear-auto.test.ts` — new file, ≥8 passing test cases
- No production file changes (this task is test-only + verification)
- Clean `npm test` exit confirming no regressions from T01/T02 changes
