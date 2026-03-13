---
id: S05
parent: M002
milestone: M002
provides:
  - listKataMilestones(client, projectId) exported from linear-entities.ts
  - LinearStateClient interface (listMilestones + listIssues) exported from linear-state.ts
  - DeriveLinearStateConfig type exported from linear-state.ts
  - deriveLinearState(client, config): Promise<KataState> — full phase derivation from Linear API
  - All 6 phase outcomes: pre-planning, planning, executing, verifying, summarizing, complete
  - kata_list_milestones tool — zero-side-effect milestone enumeration
  - kata_derive_state tool — zero-ceremony full KataState in one call (reads config from prefs)
  - kata_update_issue_state tool — resolves KataPhase → stateId, advances Linear issue state
  - buildLinearEntrypointGuard "status"/"dashboard" cases unblocked (return allow:true)
  - deriveKataState(basePath) helper in commands.ts — mode-aware dispatch
  - handleStatus() dispatches to deriveLinearState in Linear mode
  - KataDashboardOverlay.loadData() is mode-aware with LinearClient caching (not re-created on 2s refresh)
  - 32 unit tests in linear-state.test.ts — all pass
  - 4 integration tests in linear-state.integration.test.ts — all pass against real Linear workspace
requires:
  - slice: S03
    provides: listKataSlices, listKataTasks, parseKataEntityTitle, getKataPhaseFromLinearStateType, ensureKataLabels, Kata label conventions
  - slice: S04
    provides: DocumentAttachment pattern, D028 Linear markdown normalization awareness
affects:
  - S06
key_files:
  - src/resources/extensions/linear/linear-entities.ts
  - src/resources/extensions/linear/linear-state.ts
  - src/resources/extensions/linear/linear-tools.ts
  - src/resources/extensions/linear/tests/linear-state.test.ts
  - src/resources/extensions/linear/tests/linear-state.integration.test.ts
  - src/resources/extensions/kata/linear-config.ts
  - src/resources/extensions/kata/commands.ts
  - src/resources/extensions/kata/dashboard-overlay.ts
key_decisions:
  - D029: LinearStateClient is a named structural interface (listMilestones + listIssues) separate from LinearEntityClient — enables lightweight mocks in unit tests
  - D030: deriveLinearState is pure-issue-state — no document parsing; aligns with D009 and avoids D028 bullet-normalization pitfall
  - D031: started state type → executing/verifying/summarizing by children completion ratio (0/some/all terminal)
  - D032: kata_derive_state tool is zero-ceremony — reads config from preferences, resolves labels internally, no params required
  - Milestone "complete" requires slices.length > 0 && all terminal; zero-slice milestone stays in pre-planning
  - Missing LINEAR_API_KEY returns structured phase:"blocked" not a thrown error — agents can detect and retry
  - Dashboard caches LinearClient + sliceLabelId in instance fields — ensureKataLabels called once per overlay lifecycle
patterns_established:
  - isTerminal() helper: state.type === "completed" || "canceled"
  - milestoneRef() / issueRef() helpers extract kataId via parseKataEntityTitle with raw-id fallback
  - progress.tasks only populated when children.length > 0 (undefined otherwise)
  - loadData() dispatch pattern: isLinearMode() → loadLinearData() vs loadFileData()
  - Client caching: build once on first null check, reuse on subsequent 2s refreshes
observability_surfaces:
  - kata_derive_state() — zero-setup call, returns full KataState JSON; phase:"blocked" with blockers[] when key/config missing
  - kata_list_milestones({ projectId }) — zero-side-effect milestone enumeration
  - kata_update_issue_state({ issueId, phase }) — returns updated issue confirming state.type after transition
  - /kata status in Linear mode — dashboard overlay showing live KataState refreshed every 2s
  - phase:"blocked" with blockers:["LINEAR_API_KEY is not set"] when env key absent
  - phase:"blocked" with "Linear API error: <message>" on API failures (no crash, stale data preserved in overlay)
drill_down_paths:
  - .kata/milestones/M002/slices/S05/tasks/T01-SUMMARY.md
  - .kata/milestones/M002/slices/S05/tasks/T02-SUMMARY.md
  - .kata/milestones/M002/slices/S05/tasks/T03-SUMMARY.md
duration: ~2h25m (T01: 35m, T02: ~1h, T03: ~1h)
verification_result: passed
completed_at: 2026-03-12
---

# S05: State Derivation from Linear API

**`/kata status` and the dashboard overlay now show live progress from Linear API queries; `deriveLinearState` derives the full Kata phase from issue states and sub-issue completion ratios with no local state files.**

## What Happened

Three tasks implemented the full state derivation pipeline from scratch.

**T01 — Core algorithm and unit tests.** Extended `LinearEntityClient` with `listMilestones(projectId)` and added `listKataMilestones` helper. Created `linear-state.ts` with `LinearStateClient` interface, `DeriveLinearStateConfig`, and `deriveLinearState`. The algorithm fetches milestones (sorted by `sortOrder`), fetches all slice issues in one query and groups by `projectMilestone?.id`, then walks the hierarchy to determine phase:

- No milestones → `"pre-planning"`
- Active milestone with no slices → `"pre-planning"`
- Active slice in `backlog`/`unstarted` → `"planning"`
- Active slice `started` + 0 terminal children → `"executing"`
- Active slice `started` + some terminal children → `"verifying"`
- Active slice `started` + all terminal children → `"summarizing"`
- All milestones complete (each with slices) → `"complete"`

A milestone requires `slices.length > 0 && all terminal` to be marked complete; a zero-slice milestone stays pending. Errors propagate to callers. 32 unit tests were written to cover all phase paths.

**T02 — Agent tools and integration test.** Registered three tools in `linear-tools.ts`: `kata_list_milestones` (zero-side-effect enumeration), `kata_derive_state` (zero-ceremony — reads projectId/teamId from preferences, resolves sliceLabelId via ensureKataLabels, no caller params required; missing key returns `phase:"blocked"` not a thrown error), and `kata_update_issue_state` (resolves KataPhase → Linear stateId via `getLinearStateForKataPhase`, calls `updateIssue`). Total tool count reached 40. An integration test proved the full hierarchy creation → state derivation → task state transition → re-derivation cycle against a real Linear workspace.

**T03 — Caller wiring.** In `linear-config.ts`, the `"status"` and `"dashboard"` entrypoint guard cases were changed from `blockedLinearEntrypoint(...)` to `{ allow: true, noticeLevel: "info" }`. In `commands.ts`, `deriveKataState(basePath)` helper was added (mode-aware dispatch; wraps Linear errors as `phase:"blocked"`); `handleStatus()` now calls it. In `dashboard-overlay.ts`, `loadData()` was split into `loadLinearData()` / `loadFileData()` dispatch; `LinearClient` and `sliceLabelId` are cached in instance fields so `ensureKataLabels` runs once per overlay lifecycle rather than every 2s refresh.

## Verification

```
# Unit tests — 32/32 pass
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/linear-state.test.ts
→ 32 pass, 0 fail

# Integration tests — 4/4 pass (against real Linear workspace)
LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/linear-state.integration.test.ts
→ 4 pass, 0 fail

# TypeScript — clean
npx tsc --noEmit
→ no output

# Tool count
grep -c 'pi.registerTool' src/resources/extensions/linear/linear-tools.ts
→ 40

# Status/dashboard unblocked
grep -A 6 '"status":' src/resources/extensions/kata/linear-config.ts | grep 'allow: true'
→ allow: true
```

## Requirements Advanced

- R104 (State derived from Linear API queries) — fully implemented and integration-tested; `deriveLinearState` produces correct KataState from live Linear hierarchy
- R109 (Dashboard and status work in Linear mode) — `/kata status` and dashboard overlay are now mode-aware; both dispatch to `deriveLinearState` and refresh live Linear data

## Requirements Validated

- R104 — Validated: integration test proves correct KataState derivation (activeMilestone, activeSlice, activeTask, phase, progress counts) against a real Linear workspace hierarchy; phase transition verified by advancing task state and re-deriving
- R109 — Validated: TypeScript confirms wiring compiles cleanly; entrypoint guard grep confirms `allow: true`; integration-level state is correct; dashboard overlay caches client and dispatches mode-correctly

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

**T02 phase assertion flexibility:** The plan specified asserting `phase === "summarizing"` after advancing the task to "done". Some Linear workspaces have workflow automations that auto-advance the parent slice (and subsequently the milestone) to "completed" when all child tasks complete. The integration test was updated to accept both `"summarizing"` and `"complete"` as valid post-advancement phases — both correctly reflect the task being done. The core invariants (`phase !== "executing"`, `progress.tasks.done === 1` where applicable) are still asserted.

## Known Limitations

- `deriveLinearState` fetches all slices for the project in a single query. For very large projects (hundreds of slices across many milestones), this could hit Linear's pagination limit. Pagination is not implemented — a future slice could add cursor-based pagination if needed.
- Dashboard overlay calls `ensureKataLabels` once and caches `sliceLabelId`. If labels are deleted from Linear and recreated, the overlay's cached ID would be stale until the overlay is destroyed and recreated (a page reload in the TUI). This is acceptable for normal usage.
- `requirements` field is always `undefined` in `KataState` returned by `deriveLinearState` — there is no REQUIREMENTS.md equivalent in Linear mode. S06 will need to be aware of this when building the workflow prompt injection.

## Follow-ups

- S06 needs `deriveLinearState` for auto-mode advancement state checks — the `kata_derive_state` tool and `deriveLinearState` function are ready to consume directly.
- `kata_update_issue_state` was built for S05 diagnostics but will be the primary advancement primitive for S06's auto-mode loop.
- The `MilestoneView.progress.slices` field added to the overlay interface in T03 should eventually drive slice count display in the overlay header (currently used but rendering depends on overlay template — worth verifying visually in S06 dogfooding).

## Files Created/Modified

- `src/resources/extensions/linear/linear-entities.ts` — Added `listMilestones(projectId)` to `LinearEntityClient` interface; added `listKataMilestones` function
- `src/resources/extensions/linear/linear-state.ts` — New file: `LinearStateClient`, `DeriveLinearStateConfig`, `deriveLinearState`
- `src/resources/extensions/linear/linear-tools.ts` — Added imports; registered `kata_list_milestones`, `kata_derive_state`, `kata_update_issue_state` (total: 40 tools); added 2 re-exports
- `src/resources/extensions/linear/tests/linear-state.test.ts` — New file: 32 unit tests covering all phase derivation paths
- `src/resources/extensions/linear/tests/linear-state.integration.test.ts` — New file: 4 integration tests proving full hierarchy → state derivation → state transition → re-derivation
- `src/resources/extensions/kata/linear-config.ts` — "status"/"dashboard" entrypoint guard cases changed from blocked to `allow: true`
- `src/resources/extensions/kata/commands.ts` — Added `deriveKataState` helper; updated `handleStatus`; added Linear imports
- `src/resources/extensions/kata/dashboard-overlay.ts` — Added `linearClient`/`sliceLabelId` fields; split `loadData()` into `loadLinearData()`/`loadFileData()`; extended `MilestoneView` interface; added Linear imports

## Forward Intelligence

### What the next slice should know
- `kata_derive_state()` (no args) is the canonical single call to get full project state in Linear mode — S06 auto-mode should use this at the top of each task loop iteration to know where it is.
- `kata_update_issue_state({ issueId, phase })` resolves `teamId` from preferences automatically — S06 advancement calls don't need to pass it explicitly.
- `deriveLinearState` returns `requirements: undefined` always (no REQUIREMENTS.md in Linear mode) — S06 workflow prompt injection should not attempt to display or parse the requirements field.
- The integration test revealed that some Linear workspace automations auto-advance parent issues when all children complete. S06 state advancement should not double-advance — check current state before calling `updateIssue`.

### What's fragile
- `ensureKataLabels` is called inside `kata_derive_state` every invocation (not cached at tool level) — if the tool is called in a tight loop, this adds latency. The dashboard overlay caches it; the agent tool does not. Acceptable for now.
- Dashboard `loadLinearData()` catches errors and preserves stale `milestoneData` — silent failures are suppressed in favor of non-crash UX. If the Linear API key expires mid-session, the dashboard will show stale data without a clear error surfaced to the user. The `phase:"blocked"` path in `handleStatus()` does surface errors; the dashboard overlay just silently preserves last-known-good state.

### Authoritative diagnostics
- `kata_derive_state()` — single zero-setup call that returns full KataState JSON with all phase/progress/active-entity info; check `phase` and `blockers[]` first
- `kata_list_milestones({ projectId })` — raw milestone list for verifying what Linear sees
- `kata_update_issue_state({ issueId, phase })` — returns updated issue with `state.type` for confirming transitions

### What assumptions changed
- Original plan assumed S05 state derivation would not need document parsing; confirmed correct — all state is derivable from Linear issue states alone.
- Integration test design assumed `phase === "summarizing"` after task completion; discovered that Linear workspace automations can auto-advance parents, making `"complete"` the correct answer in that workspace.
