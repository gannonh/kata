# S05: State Derivation from Linear API — Research

**Date:** 2026-03-12

## Summary

S05 implements `deriveLinearState(client, config) → KataState` — the Linear-mode equivalent of `deriveState(basePath)` in `state.ts`. Once shipped, `/kata status` and the dashboard overlay show live progress from Linear API queries instead of file reads, and the "status"/"dashboard" entrypoints are unblocked in `linear-config.ts`.

The derivation algorithm is deliberately simpler than the file-mode version: rather than parsing ROADMAP/PLAN document content for slice ordering and dependency graphs, state is derived purely from **Linear issue states and the milestone/issue hierarchy** that already exists in Linear. This keeps Linear as the single source of truth (D009) and avoids re-introducing the `- [ ]` vs `* [ ]` checkbox parsing problem (D028).

All three building blocks from prior slices are in place: `listKataSlices`/`listKataTasks` for querying the issue hierarchy (S03), `readKataDocument` for artifact access when needed (S04), and `getWorkflowEntrypointGuard`/`loadEffectiveLinearProjectConfig` for mode detection (S02). The one missing piece is `listKataMilestones` — S03's follow-up note explicitly flags this for S05.

The key wiring work is in two places: (1) `linear-state.ts` with the new derivation function, and (2) updating `commands.ts` + `dashboard-overlay.ts` to dispatch through Linear state when in Linear mode, while also unblocking those entrypoints in `linear-config.ts`.

## Recommendation

**Approach: Pure-issue-state derivation — no document content parsing for status.**

Derive `KataState` from Linear issue states and milestone/issue relationships only:
- Milestones → `client.listMilestones(projectId)` (sorted by `sortOrder`)
- Slices → `listKataSlices(client, projectId, labelSet.slice.id)` → client-side filter by `issue.projectMilestone?.id`
- Tasks → use `slice.children.nodes` (already returned in ISSUE_FIELDS) for task state; fall back to `listKataTasks` if needed
- Completion → `issue.state.type === "completed" || "canceled"`
- Phase → from `getKataPhaseFromLinearStateType` + sub-issue completion ratio for `verifying` vs `executing`

Do NOT parse ROADMAP/PLAN document content for completion state. The file-mode parsers use `- [ ]` checkboxes, but Linear normalizes these to `* [ ]` on storage (D028) — the existing `parseRoadmap`/`parsePlan` regexes (`/^-\s+\[/`) will silently fail on Linear content. State derivation must be document-free.

Introduce `listKataMilestones` in `linear-entities.ts` as the missing query function (S03 follow-up). Everything else is wiring existing APIs into a new `linear-state.ts` module + updating two callers.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Phase ↔ Linear state type mapping | `getKataPhaseFromLinearStateType`, `getLinearStateTypeForKataPhase` in `linear-entities.ts` | Already tested, handles all 5 state types including `canceled → done` |
| Milestone query | `client.listMilestones(projectId)` in `LinearClient` | Paginated, returns `sortOrder` for ordering |
| Slice query | `listKataSlices(client, projectId, sliceLabelId)` in `linear-entities.ts` | Already integration-tested (S03), filters by `kata:slice` label |
| Task query | `listKataTasks(client, sliceIssueId)` in `linear-entities.ts` | Already integration-tested (S03), queries by `parentId` |
| Milestone title parsing | `parseKataEntityTitle(name)` in `linear-entities.ts` | Extracts `kataId` and `title` from `[M001] Title` format |
| Mode detection | `isLinearMode()`, `loadEffectiveLinearProjectConfig()` in `linear-config.ts` | Single seam per D018 |
| Structural mock interface pattern | `LinearEntityClient`, `LinearDocumentClient` patterns | Name a `LinearStateClient` interface; lets tests mock without importing `LinearClient` |
| Workflow state resolution | `client.listWorkflowStates(teamId)` + `getLinearStateForKataPhase()` | Need state UUIDs for issue advancement tool |

## Existing Code and Patterns

- `src/resources/extensions/kata/state.ts` — the file-mode `deriveState(basePath)` is the canonical model for `deriveLinearState`. Study its output shape and phase logic carefully; `KataState` is the return type S05 must produce.
- `src/resources/extensions/kata/types.ts` — `KataState`, `Phase`, `ActiveRef`, `MilestoneRegistryEntry`, `RequirementCounts` — all must be returned faithfully.
- `src/resources/extensions/linear/linear-entities.ts` — `listKataSlices`, `listKataTasks`, `parseKataEntityTitle`, `getKataPhaseFromLinearStateType`, `LinearEntityClient` interface pattern. S05 adds `listKataMilestones` here.
- `src/resources/extensions/linear/linear-documents.ts` — `readKataDocument`, `buildDocumentTitle`, `LinearDocumentClient` interface pattern. S05 uses `readKataDocument` only for optional document-presence checks (e.g., detecting "roadmap not yet written").
- `src/resources/extensions/linear/linear-client.ts` — `listMilestones(projectId)` is already implemented; `updateIssue(id, input)` is the mutation for advancing issue state. `ISSUE_FIELDS` already includes `children.nodes` with `state.type`.
- `src/resources/extensions/linear/linear-tools.ts` — `ok(data)` / `fail(err)` helpers; `run(fn)` wrapper; `registerLinearTools(pi, client)` is the registration point. S05 adds ~3 new tools here.
- `src/resources/extensions/kata/linear-config.ts` — `getWorkflowEntrypointGuard("status")` and `("dashboard")` currently return `allow: false`. S05 must update `buildLinearEntrypointGuard` to allow these after wiring.
- `src/resources/extensions/kata/commands.ts` — `handleStatus()` calls `getWorkflowEntrypointGuard("status")` then `deriveState(basePath)`. After S05, must dispatch to `deriveLinearState` in linear mode.
- `src/resources/extensions/kata/dashboard-overlay.ts` — `KataDashboardOverlay.loadData()` calls `deriveState(base)` directly. Needs mode-aware dispatch; overlay refreshes every 2 seconds so client construction must be lightweight/lazy.
- `src/resources/extensions/linear/tests/entity-hierarchy.integration.test.ts` — follow this exact pattern for the S05 integration test: `before()` resolves team+project, creates full hierarchy; `after()` cleans up with `Promise.allSettled`; uses `LINEAR_API_KEY` gate + skip.

## Constraints

- `IssueFilter` has no `projectMilestoneId` field — cannot filter slices by milestone server-side. Must fetch all slices for a project via `listKataSlices` and filter client-side by `issue.projectMilestone?.id`. This is acceptable (projects won't have thousands of slices).
- `LinearMilestone` has no `status` field — milestone completeness must be inferred from whether all associated slice issues are in `completed`/`canceled` state.
- `ISSUE_FIELDS` includes `children.nodes` but without explicit `first: N` — uses Linear's API default pagination (50 nodes). Sufficient for realistic task counts (<20/slice), but not for unusual projects. Mention in forward intelligence.
- The `parseRoadmap` / `parsePlan` parsers in `files.ts` use `/^-\s+\[([ xX])\]/` — they do NOT handle `* [ ]` format from Linear storage. S05 state derivation must NOT call these functions on Linear document content.
- `KataState` requires a `requirements` field (`RequirementCounts`) — but REQUIREMENTS.md is a local file. In Linear mode, return `undefined` for this field (the type is `requirements?: RequirementCounts`). Verified in `types.ts`.
- `KataState` has `activeBranch?: string` — this comes from `getActiveSliceBranch(basePath)` in `worktree.ts`. In Linear mode, call the same function (it reads git state, not `.kata/` files) or omit the field.
- Dashboard overlay creates a new `LinearClient` per `loadData()` cycle (every 2s) if not cached — store the client in the overlay instance to avoid re-constructing on every refresh.
- `LINEAR_API_KEY` must be present in the environment for `deriveLinearState` to be called — if missing, fall back gracefully (return a `KataState` with phase `"blocked"` and a diagnostic message).

## Common Pitfalls

- **Parsing document checkboxes for completion** — the `parseRoadmap` regex `/^-\s+\[([ xX])\]/` silently fails on Linear-normalized `* [ ]` content. Avoid using `parseRoadmap`/`parsePlan` on Linear document content entirely; use issue states instead.
- **Missing `listKataMilestones`** — S03 explicitly left this as a follow-up for S05. Don't try to derive milestone list from somewhere else; add the function to `linear-entities.ts` first.
- **`kata:slice` label ID not available at derivation time** — `deriveLinearState` needs the `KataLabelSet` from `ensureKataLabels`, but that's an async API call. The config struct passed to `deriveLinearState` must carry `labelSet` (same pattern as `KataEntityCreationConfig`). Callers (commands.ts, dashboard-overlay) must call `ensureKataLabels` once and cache the result. Alternative: pass `sliceLabelId` directly in the config.
- **Empty milestone (no slices yet)** — `deriveLinearState` must handle a milestone that exists in Linear but has zero associated slice issues. Return `phase: "pre-planning"` and `activeSlice: null`, analogous to `state.ts`'s "no roadmap" path.
- **`children.nodes` vs. `listKataTasks`** — `ISSUE_FIELDS` already returns `children.nodes` with state info, so a separate `listKataTasks` call is usually redundant. But `children.nodes` only contains `id, identifier, title, state` — no `labels` or `parent`. For task counting and phase derivation, `children.nodes` is sufficient and saves an extra API call per slice.
- **Milestone with all slices canceled** — treat as "done" (same as completed), not "active". `canceled` → `done` per D023.
- **`getWorkflowEntrypointGuard` cache** — `loadEffectiveKataPreferences()` reads from disk on each call. In `dashboard-overlay.ts`'s 2-second refresh loop, this adds a file read every cycle. Acceptable for now but worth noting.
- **Tool count baseline** — current count is 37 tools. S05 adds ~3 more (`kata_derive_state`, `kata_list_milestones`, `kata_update_issue_state`). Don't assert the exact count in tests.

## Open Risks

- **`children.nodes` pagination cutoff at 50** — if a slice has >50 tasks (unlikely but possible in large projects), `children.nodes` is silently truncated. `listKataTasks` would be the fallback for accurate counting. Mitigation: add a note in forward intelligence; add `first: 100` to the children GraphQL subquery if feasible.
- **Linear API latency per status refresh** — deriving state requires: (1) `listMilestones`, (2) `listIssues` for slices, (3) optionally task queries. At ~100–200ms per call, a full derive takes ~300–500ms. For the dashboard's 2s refresh interval, this is acceptable. But if the project has many milestones/slices, pagination adds overhead. For S05, document this rather than optimize.
- **`listKataMilestones` ordering** — milestones are sorted by `sortOrder` from the API. If a user manually reorders them in Linear's UI, the "active milestone" selection might differ from the intended ordering. Kata has no dependency-graph-based gate in Linear mode (unlike file mode). This is an acceptable simplification; document in forward intelligence.
- **Dashboard Linear client lifecycle** — if `LINEAR_API_KEY` is missing or rotated while the dashboard is open, API calls will fail. Need to catch errors in `loadData()` gracefully (already done with `try/catch` in the current implementation — Linear errors must not crash the overlay).
- **`handleStatus` currently returns after showing overlay** — the existing `handleStatus` opens the overlay, waits for it to close (via `ctx.ui.custom` with a `done()` callback), then returns. The Linear mode path must preserve this same modal behavior. A simple mode-aware `deriveKataState` helper that returns the correct `KataState` based on mode is the clean approach; the overlay rendering code stays unchanged.
- **`kata_update_issue_state` needs stateId, not phase** — agents need to advance issue states, but `updateIssue` requires a concrete `stateId` UUID (team-specific), not a phase name. The tool must accept either a `phase: KataPhase` + do the `listWorkflowStates` → `getLinearStateForKataPhase` resolution internally, OR expose `stateId` directly and require callers to resolve it first. Recommend the former for S05 (one-step UX for agents).

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| TypeScript / Node.js | (no external skill needed) | n/a |
| Linear GraphQL API | (existing codebase patterns sufficient) | n/a |

## Sources

- `KataState` interface shape and all `Phase` literals: `src/resources/extensions/kata/types.ts`
- `deriveState` algorithm (the file-mode model): `src/resources/extensions/kata/state.ts`
- `linear-entities.ts` entity functions and `LinearEntityClient` interface: `src/resources/extensions/linear/linear-entities.ts`
- `LinearClient.listMilestones`, `updateIssue`, `children.nodes` in `ISSUE_FIELDS`: `src/resources/extensions/linear/linear-client.ts`
- D028 (Linear markdown normalization `- ` → `* `): `.kata/DECISIONS.md`
- D023 (Kata phase → Linear state type mapping): `.kata/DECISIONS.md`
- `buildLinearEntrypointGuard` for "status"/"dashboard" currently blocked: `src/resources/extensions/kata/linear-config.ts`
- `handleStatus` and `KataDashboardOverlay.loadData` call sites: `src/resources/extensions/kata/commands.ts`, `src/resources/extensions/kata/dashboard-overlay.ts`
- `parseRoadmap` / `parsePlan` checkbox regex (does not handle `* [ ]`): `src/resources/extensions/kata/files.ts` lines 203–233 and 289–332
- S03 forward intelligence ("S05 needs `listKataMilestones`"): `.kata/milestones/M002/slices/S03/S03-SUMMARY.md`
- S04 forward intelligence ("Linear bullet normalization affects S05 parsers"): `.kata/milestones/M002/slices/S04/S04-SUMMARY.md`
