---
id: T03
parent: S05
milestone: M002
provides:
  - buildLinearEntrypointGuard "status"/"dashboard" cases return allow:true with informational notice
  - deriveKataState(basePath) helper in commands.ts — dispatches to deriveLinearState in Linear mode, deriveState in file mode
  - handleStatus() uses deriveKataState instead of bare deriveState
  - KataDashboardOverlay.loadData() is mode-aware — calls deriveLinearState in Linear mode via loadLinearData()
  - LinearClient cached in this.linearClient — not re-created on every 2s refresh
  - Missing LINEAR_API_KEY handled gracefully in both handleStatus and loadData (no crash, clear diagnostic)
key_files:
  - src/resources/extensions/kata/linear-config.ts
  - src/resources/extensions/kata/commands.ts
  - src/resources/extensions/kata/dashboard-overlay.ts
key_decisions:
  - deriveKataState catches all Linear API errors and returns phase:"blocked" with a descriptive message in blockers[] — never throws to callers
  - dashboard-overlay caches LinearClient in this.linearClient AND sliceLabelId in this.sliceLabelId — ensureKataLabels only called once per overlay lifecycle (first refresh)
  - MilestoneView.progress extended with optional slices field so Linear-mode slice counts can be surfaced in the overlay header
  - Registry entries are used to build the slice list in Linear mode (no roadmap files) — active/done flags derived from state.activeSlice and entry.status
  - File mode code path completely preserved in separate loadFileData() private method — no risk of regression
patterns_established:
  - isLinearMode() check at loadData() entry → delegate to loadLinearData() or loadFileData()
  - Client caching pattern: build once on first null check, reuse on subsequent refreshes
  - Label ID caching pattern: resolve once, store in instance field, skip on subsequent calls
observability_surfaces:
  - /kata status now shows live Linear data in Linear mode (dashboard overlay with 2s refresh)
  - phase:"blocked" with blockers:["LINEAR_API_KEY is not set"] surfaced when env key absent
  - phase:"blocked" with diagnostic message surfaced when teamId/projectId missing from prefs
  - phase:"blocked" with "Linear API error: <message>" surfaced on API failures
  - On API error during refresh, stale milestoneData is preserved (no crash, no blank screen)
duration: ~1h
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T03: Unblock status/dashboard + wire `deriveLinearState` into callers

**`/kata status` now shows live progress from Linear API in Linear mode; dashboard overlay refreshes from Linear data every 2s; file mode unchanged.**

## What Happened

Three targeted changes were made:

**1. `linear-config.ts` — unblock "status"/"dashboard"**

The `buildLinearEntrypointGuard` `"status"`/`"dashboard"` cases were changed from `blockedLinearEntrypoint(...)` to `{ allow: true, noticeLevel: "info", notice: "Showing live progress derived from Linear API." }`. This unblocks `/kata status` and the dashboard from the entrypoint guard.

**2. `commands.ts` — `deriveKataState` helper + `handleStatus` update**

Added module-local `async function deriveKataState(basePath: string): Promise<KataState>` that:
- Checks `isLinearMode()` — if not, delegates to `deriveState(basePath)` unchanged
- In Linear mode: reads config via `loadEffectiveLinearProjectConfig()`; checks for `LINEAR_API_KEY`; checks for `projectId`/`teamId`; creates a fresh `LinearClient`; calls `ensureKataLabels` then `deriveLinearState`; wraps everything in try/catch returning `phase: "blocked"` with diagnostic message on error

Updated `handleStatus()` to call `deriveKataState(basePath)` instead of `deriveState(basePath)`.

Imports consolidated: `isLinearMode` and `loadEffectiveLinearProjectConfig` added to the existing `./linear-config.js` import (duplicate import removed); `LinearClient`, `ensureKataLabels`, `deriveLinearState` imported from the linear extension.

**3. `dashboard-overlay.ts` — mode-aware `loadData()` + `LinearClient` caching**

- Added `private linearClient?: LinearClient` and `private sliceLabelId?: string` fields
- Split `loadData()` into a dispatch method that routes to `loadLinearData()` or `loadFileData()`
- `loadLinearData()`: checks for API key + config; builds/reuses `this.linearClient`; resolves slice label once via `ensureKataLabels` and caches in `this.sliceLabelId`; calls `deriveLinearState`; builds `MilestoneView` from `KataState` (registry → slice list, `activeSlice`/`activeTask` refs for active/done flags, progress counts from `state.progress`)
- `loadFileData()`: exact copy of the original `loadData()` logic — zero change to file mode
- Extended `MilestoneView.progress` with optional `slices?: { done, total }` field

## Verification

```
# TypeScript clean
npx tsc --noEmit
# → no output ✓

# status/dashboard allowed in Linear mode
grep -A 6 '"status":' src/resources/extensions/kata/linear-config.ts | grep 'allow: true'
# → allow: true ✓

# Unit tests still pass
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/linear-state.test.ts
# → 32 pass, 0 fail ✓

# Tool count unchanged
grep -c 'pi.registerTool' src/resources/extensions/linear/linear-tools.ts
# → 40 ✓
```

## Diagnostics

- `/kata status` in Linear mode → dashboard overlay showing live `KataState` data from Linear API
- `kata_derive_state()` tool → same `KataState` JSON programmatically
- `phase: "blocked"` with `blockers: ["LINEAR_API_KEY is not set"]` when env key absent
- `phase: "blocked"` with config-missing message when `teamId`/`projectId` not in prefs
- Dashboard overlay: on API error during 2s refresh, stale `milestoneData` preserved (no crash)

## Deviations

None. Implementation matched the plan exactly.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/kata/linear-config.ts` — "status"/"dashboard" cases changed from blocked to `allow: true`
- `src/resources/extensions/kata/commands.ts` — added `deriveKataState` helper; updated `handleStatus`; added Linear imports
- `src/resources/extensions/kata/dashboard-overlay.ts` — added `linearClient`/`sliceLabelId` fields; split `loadData()` into `loadLinearData()`/`loadFileData()`; extended `MilestoneView` interface; added Linear imports
