# S05: State Derivation from Linear API — UAT

**Milestone:** M002
**Written:** 2026-03-12

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S05 is a state derivation and wiring slice — all correctness is provable via unit tests (32 pure-function tests covering every phase derivation path), integration tests (4 tests against a real Linear workspace proving full hierarchy → derivation → transition → re-derivation), and TypeScript compilation. The UI wiring (handleStatus, dashboard overlay) is verified by TypeScript + entrypoint guard grep — no human is needed to confirm the mode-aware dispatch compiles and routes correctly.

## Preconditions

- `LINEAR_API_KEY` set in environment
- Linear workspace with at least one Kata-labeled hierarchy (milestone → slice issue → task sub-issue) created during integration test `before()` hook
- `npx tsc --noEmit` passes
- Running from `kata/M002/S05` branch

## Smoke Test

```bash
# Confirm state derivation compiles and unit tests pass
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/linear-state.test.ts
# Expected: 32 pass, 0 fail

# Confirm entrypoint guard allows status/dashboard in Linear mode
grep -A 6 '"status":' src/resources/extensions/kata/linear-config.ts | grep 'allow: true'
# Expected: match

# Confirm tool count reached 40
grep -c 'pi.registerTool' src/resources/extensions/linear/linear-tools.ts
# Expected: 40
```

## Test Cases

### 1. Phase derivation — all paths (unit)

Run the full unit test suite:

```bash
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/linear-state.test.ts
```

1. No milestones → `phase: "pre-planning"`, `activeMilestone: null`
2. Milestones exist but all complete → `phase: "complete"`
3. Active milestone, no slices → `phase: "pre-planning"`, `activeSlice: null`
4. Active slice in `backlog`/`unstarted` → `phase: "planning"`, `activeTask: null`
5. Active slice `started`, no children → `phase: "executing"`, `activeTask: null`
6. Active slice `started`, some terminal children → `phase: "verifying"`, `activeTask` = first non-terminal
7. Active slice `started`, all children terminal → `phase: "summarizing"`, `activeTask: null`
8. **Expected:** 32 pass, 0 fail

### 2. Full hierarchy → state derivation → transition (integration)

```bash
LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/linear-state.integration.test.ts
```

1. `before()` creates: `kata:milestone` milestone → `kata:slice` parent issue (executing) → `kata:task` sub-issue (executing)
2. `listKataMilestones({ projectId })` returns the created milestone with `[M001]` formatted name
3. `deriveLinearState` returns `activeMilestone.id === "M001"`, `activeSlice.id === "S01"`, `activeTask.id === "T01"`, `phase === "executing"`, `progress.tasks.total === 1`, `progress.tasks.done === 0`
4. `kata_update_issue_state({ issueId: task.id, phase: "done" })` returns `state.type === "completed"`
5. Re-derive: `phase !== "executing"` (either `"summarizing"` or `"complete"` depending on workspace automation); `progress.tasks.done === 1` where applicable
6. `after()` cleans up all created entities with `Promise.allSettled`
7. **Expected:** 4 pass, 0 fail

### 3. TypeScript compilation

```bash
npx tsc --noEmit
```

**Expected:** No output (clean)

### 4. Tool count

```bash
grep -c 'pi.registerTool' src/resources/extensions/linear/linear-tools.ts
```

**Expected:** 40

## Edge Cases

### Missing LINEAR_API_KEY

1. Unset `LINEAR_API_KEY`
2. Call `kata_derive_state()` via tool
3. **Expected:** Returns `ok({ phase: "blocked", blockers: ["LINEAR_API_KEY not set"] })` — no thrown error

### Status entrypoint guard unblocked

1. Grep for "status" case in `buildLinearEntrypointGuard`
2. **Expected:** `allow: true` present (not `blockedLinearEntrypoint(...)`)

### Dashboard overlay client caching

1. Inspect `dashboard-overlay.ts` for `private linearClient` field
2. Verify `loadLinearData()` builds client only if `!this.linearClient`
3. **Expected:** Client constructed once, reused on subsequent 2s refresh calls

### Zero-slice milestone stays pre-planning

1. Unit test: mock client returns one milestone with zero associated slices
2. `deriveLinearState` call
3. **Expected:** `phase: "pre-planning"` (milestone with no slices is not "complete")

## Failure Signals

- Any unit test failure → algorithm regression in phase derivation logic
- Integration test failure → Linear API contract mismatch or hierarchy setup error
- `npx tsc --noEmit` produces errors → type contract broken between state.ts, tools.ts, commands.ts, or dashboard-overlay.ts
- `grep 'allow: true'` misses → status/dashboard still blocked in Linear mode (entrypoint guard regression)
- Tool count < 40 → one of the three new tools was not registered

## Requirements Proved By This UAT

- R104 (State derived from Linear API queries) — Integration test proves `deriveLinearState` returns correct `KataState` (activeMilestone, activeSlice, activeTask, phase, progress counts) from a real Linear hierarchy; phase transition and re-derivation verified
- R109 (Dashboard and status work in Linear mode) — TypeScript compilation proves the mode-aware dispatch wires correctly in `handleStatus` and `KataDashboardOverlay.loadData()`; entrypoint guard grep confirms the guard allows status/dashboard in Linear mode

## Not Proven By This UAT

- Live human experience of `/kata status` opening the dashboard overlay with real Linear data — this would require running `kata` CLI in a real Linear-mode project and observing the TUI. The wiring is proven by TypeScript + entrypoint guard, but the visual output is not exercised here.
- Dashboard overlay 2s refresh cycle behavior in a running TUI — not observable from tests or TypeScript alone.
- `kata_update_issue_state` called from within auto-mode (S06) — this slice proves the tool works in isolation; the full auto-mode advancement loop is S06 scope.
- State derivation latency under load — no performance benchmarking; acceptable for current scope per D110 (offline/cache explicitly out of scope).

## Notes for Tester

- The integration test creates real Linear entities in your workspace and cleans them up in `after()`. Use a test project that won't affect production data.
- If `kata_update_issue_state` returns "No workflow state found for phase: done", the Linear workspace is missing a "completed"-type state. All standard Linear workspaces have one; this would indicate a custom workflow setup.
- The phase assertion flexibility (summarizing OR complete) in the integration test is intentional — some workspaces auto-advance parent issues via workflow automations. Both outcomes are correct.
- Dashboard visual verification (live TUI) is out of scope for this UAT; S06 dogfooding should cover the end-to-end UX.
