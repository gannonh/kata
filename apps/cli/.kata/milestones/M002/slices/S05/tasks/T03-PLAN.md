---
estimated_steps: 5
estimated_files: 3
---

# T03: Unblock status/dashboard + wire `deriveLinearState` into callers

**Slice:** S05 — State Derivation from Linear API
**Milestone:** M002

## Description

The derivation function is implemented and tested (T01, T02) but `/kata status` and the dashboard still derive from `.kata/` files when in Linear mode (blocked by the Linear entrypoint guard). This task:

1. Unblocks "status" and "dashboard" in `buildLinearEntrypointGuard` (was blocked with a placeholder notice since S02).
2. Adds a mode-aware `deriveKataState(basePath)` helper inside `commands.ts` that dispatches to `deriveLinearState` vs `deriveState` based on mode.
3. Updates `KataDashboardOverlay.loadData()` to call `deriveLinearState` in Linear mode, with `LinearClient` cached in the overlay instance to avoid re-construction on every 2s refresh.

After this task, `/kata status` opens the dashboard overlay showing live Linear data in Linear mode, and falls through to file-mode data as before in file mode.

## Steps

1. **`linear-config.ts`** — in `buildLinearEntrypointGuard`, update the `"status"` and `"dashboard"` cases to return `allow: true` with an informational notice:
   ```ts
   case "status":
   case "dashboard":
     return {
       mode: "linear",
       isLinearMode: true,
       allow: true,
       noticeLevel: "info",
       notice: "Showing live progress derived from Linear API.",
       protocol,
     };
   ```

2. **`commands.ts`** — add imports for `LinearClient`, `ensureKataLabels`, `deriveLinearState` (from linear extension) and `isLinearMode`, `loadEffectiveLinearProjectConfig` (already imported via `linear-config.js`). Write a module-local `async function deriveKataState(basePath: string): Promise<KataState>`:
   - If `isLinearMode()`: read config via `loadEffectiveLinearProjectConfig()`; get `apiKey = process.env.LINEAR_API_KEY`; if key missing, return `{ phase: "blocked", activeMilestone: null, activeSlice: null, activeTask: null, blockers: ["LINEAR_API_KEY is not set"], recentDecisions: [], nextAction: "Set LINEAR_API_KEY to use Linear mode.", registry: [], progress: { milestones: { done: 0, total: 0 } } }`; if projectId/teamId missing, return blocked state with appropriate message; create `new LinearClient(apiKey)`; call `ensureKataLabels(client, teamId)`; call `deriveLinearState(client, { projectId, teamId, sliceLabelId: labelSet.slice.id, basePath })` wrapped in try/catch (catch returns blocked state with error message).
   - If file mode: return `deriveState(basePath)` (unchanged path).
   - Update `handleStatus()` to call `deriveKataState(basePath)` instead of `deriveState(basePath)`.

3. **`dashboard-overlay.ts`** — add imports for `LinearClient`, `ensureKataLabels`, `deriveLinearState` (from `../linear/...`), `isLinearMode`, `loadEffectiveLinearProjectConfig`. Add private fields: `private linearClient?: LinearClient` and `private sliceLabelId?: string`. Update `loadData()`:
   - If `isLinearMode()`: build/reuse `this.linearClient` from `process.env.LINEAR_API_KEY`; if key missing, leave `this.milestoneData = null` and return; call `ensureKataLabels(this.linearClient, teamId)` once per refresh (idempotent — acceptable; for future optimization, cache `sliceLabelId` in `this.sliceLabelId`); call `deriveLinearState(this.linearClient, { projectId, teamId, sliceLabelId })` to get `KataState`; build `MilestoneView` from the state (active milestone → view.id/title, active slice's phase, progress from `state.progress`). Keep existing try/catch. 
   - If file mode: preserve the existing code path exactly (no changes).
   - Ensure the `MilestoneView.phase` is populated from `state.phase` and slices from `deriveLinearState`'s `registry` (the overlay needs slices with `done`/`active` flags — build these from the registry slices and the `activeSlice` ID).

4. **Adapt `MilestoneView` construction in `dashboard-overlay.ts`** for Linear mode: Linear mode doesn't have roadmap files, so the slice list for the overlay comes from `listKataSlices` results (available in `deriveLinearState`'s internal state) or — more simply — from the `KataState` registry + progress fields. The `KataState` already contains enough information: use `state.activeMilestone`, `state.activeSlice`, `state.activeTask`, `state.progress` to build the MilestoneView. For the slice list, consider passing an optional `slices` array via an extended KataState, or simply show task-level progress without full slice list — the `progress.slices` and `progress.tasks` counts are sufficient for the overlay's header numbers. The active slice name and task name come from `state.activeSlice` and `state.activeTask` directly. If the full slice list is needed (for the scrollable slice breakdown), `deriveLinearState` can optionally return it via an extended field; for S05, a simplified view showing active milestone/slice/task and progress counts is acceptable.

5. **TypeScript and regression check**: run `npx tsc --noEmit`; run the unit tests; verify the status/dashboard guard smoke-check passes.

## Must-Haves

- [ ] `buildLinearEntrypointGuard` "status" and "dashboard" cases return `allow: true`
- [ ] `deriveKataState(basePath)` in `commands.ts` dispatches to Linear derivation in Linear mode
- [ ] `handleStatus()` uses `deriveKataState` (not bare `deriveState`)
- [ ] `KataDashboardOverlay.loadData()` calls `deriveLinearState` in Linear mode
- [ ] `LinearClient` cached in `this.linearClient` — not re-created on every 2s refresh
- [ ] Missing `LINEAR_API_KEY` handled gracefully in both `handleStatus` and `loadData` — no crash, clear diagnostic
- [ ] File mode unchanged — all existing file-mode paths untouched
- [ ] `npx tsc --noEmit` — clean
- [ ] Unit tests still pass; integration test still passes

## Verification

```bash
# TypeScript clean
npx tsc --noEmit
# Expected: no output

# status/dashboard allowed in Linear mode
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types -e "
import { buildLinearEntrypointGuardTest } from './src/resources/extensions/kata/linear-config.ts';
" 2>&1 || true
# Simpler: grep directly
grep -A 4 '"status":' src/resources/extensions/kata/linear-config.ts | grep 'allow: true'
# Expected: match

# Unit tests still pass
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/linear-state.test.ts
# Expected: all pass

# Integration test still passes
LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/linear-state.integration.test.ts
# Expected: all pass
```

## Observability Impact

- **Signals added/changed:** `/kata status` now shows live Linear data in Linear mode; dashboard overlay refreshes from Linear API every 2s; `phase: "blocked"` with `LINEAR_API_KEY not set` message surfaced as the dashboard's loading state when key is absent
- **How a future agent inspects this:** `/kata status` is now a live-data command in Linear mode; `kata_derive_state()` provides the same data programmatically; dashboard overlay's 2s refresh is the live monitoring surface
- **Failure state exposed:** `loadData()` catch block preserves existing `milestoneData` on API error (non-crash); `handleStatus()` shows "blocked" state with diagnostic message if key missing or API errors

## Inputs

- `src/resources/extensions/linear/linear-state.ts` — `deriveLinearState`, `DeriveLinearStateConfig` (T01)
- `src/resources/extensions/linear/linear-entities.ts` — `ensureKataLabels`, `listKataMilestones` (T01)
- `src/resources/extensions/kata/commands.ts` — `handleStatus()` call site to update; `deriveState` import to supplement with mode dispatch
- `src/resources/extensions/kata/dashboard-overlay.ts` — `loadData()` method; overlay class structure; existing `MilestoneView` type
- `src/resources/extensions/kata/linear-config.ts` — `buildLinearEntrypointGuard` to update; `loadEffectiveLinearProjectConfig` for config reading
- S02 forward intelligence: `isLinearMode()` is the stable single seam for mode detection

## Expected Output

- `src/resources/extensions/kata/linear-config.ts` — "status" and "dashboard" cases changed from `blockedLinearEntrypoint` to `allow: true`
- `src/resources/extensions/kata/commands.ts` — new `deriveKataState` helper; `handleStatus` updated
- `src/resources/extensions/kata/dashboard-overlay.ts` — `LinearClient` field added; `loadData()` mode-aware dispatch; Linear mode shows live `KataState` data
