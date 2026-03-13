---
id: S03
parent: M002
milestone: M002
provides:
  - linear-entities.ts with formatKataEntityTitle, parseKataEntityTitle, getLinearStateTypeForKataPhase, getKataPhaseFromLinearStateType, getLinearStateForKataPhase, ensureKataLabels, createKataMilestone, createKataSlice, createKataTask, listKataSlices, listKataTasks
  - LinearEntityClient interface for structural duck-typing and test mocking
  - KataPhase, KataEntityType, KataLabelSet, KataEntityCreationConfig types in linear-types.ts
  - 6 new pi tools registered in linear-tools.ts: kata_ensure_labels, kata_create_milestone, kata_create_slice, kata_create_task, kata_list_slices, kata_list_tasks
  - 60 unit tests (entity-mapping.test.ts) + 7 integration tests (entity-hierarchy.integration.test.ts)
requires:
  - slice: S01
    provides: LinearClient with createMilestone, createIssue, ensureLabel, listIssues, listWorkflowStates; LinearGraphQLError; classifyLinearError
affects:
  - S04 (document storage attaches to project/milestone/issue IDs produced here)
  - S05 (state derivation queries by kata:slice label and parentId)
  - S06 (auto-mode calls kata_create_* tools to create hierarchy)
key_files:
  - src/resources/extensions/linear/linear-entities.ts
  - src/resources/extensions/linear/linear-types.ts
  - src/resources/extensions/linear/linear-tools.ts
  - src/resources/extensions/linear/tests/entity-mapping.test.ts
  - src/resources/extensions/linear/tests/entity-hierarchy.integration.test.ts
key_decisions:
  - D021: Kata entity title format is [M001] Title bracket prefix — parseable via regex, visually distinct in Linear UI, round-trips cleanly
  - D022: Three flat labels (kata:milestone provisioned only, kata:slice on slice issues, kata:task on task sub-issues) with fixed colors
  - D023: Kata phase→Linear state type — backlog/planning/executing/verifying/done maps; verifying=started; canceled=done
  - D024: linear-entities.ts lives in linear extension, takes explicit client+config args — no kata-extension imports
  - D025: LinearEntityClient interface exported from linear-entities.ts as structural contract for mocks — avoids importing full LinearClient class into the pure mapping module
patterns_established:
  - ensureKataLabels must be called first; the returned KataLabelSet is passed into slice/task create functions — label IDs resolved once
  - LinearEntityClient interface pattern for structural duck-typing enables lightweight inline mocks without extending the full class
  - All pure mapping functions (format/parse/phase-state) import nothing beyond types — safe to import anywhere without side effects
  - parseKataEntityTitle returns null on mismatch, never throws — safe for unknown titles from Linear API
  - Cleanup order for hierarchy: task issue → slice issue → milestone (never delete labels — idempotent provisioning)
observability_surfaces:
  - kata_ensure_labels is idempotent — call once at session start to recover all three label UUIDs; returned KataLabelSet JSON shows id/name/color
  - kata_list_slices and kata_list_tasks are read-only inspection surfaces; empty array = wrong filter params, not API error
  - LinearGraphQLError propagates from all entity functions with mutation name in message; classifyLinearError classifies kind
  - parseKataEntityTitle is the primary Kata ID decoding surface; call on any Linear issue title to recover kataId
drill_down_paths:
  - .kata/milestones/M002/slices/S03/tasks/T01-SUMMARY.md
  - .kata/milestones/M002/slices/S03/tasks/T02-SUMMARY.md
  - .kata/milestones/M002/slices/S03/tasks/T03-SUMMARY.md
  - .kata/milestones/M002/slices/S03/tasks/T04-SUMMARY.md
duration: ~85min across 4 tasks
verification_result: passed
completed_at: 2026-03-12
---

# S03: Entity Mapping — Hierarchy & Labels

**Complete Kata→Linear entity hierarchy with typed creation functions, idempotent label provisioning, phase-state mapping, and 6 registered pi tools — proved end-to-end against a real Linear workspace.**

## What Happened

S03 delivered the full Kata→Linear entity mapping layer in four tasks, building from pure types up to registered agent tools.

**T01** extended `linear-types.ts` with four new types (`KataPhase`, `KataEntityType`, `KataLabelSet`, `KataEntityCreationConfig`) and created `linear-entities.ts` with five pure functions: `formatKataEntityTitle`, `parseKataEntityTitle`, `getLinearStateTypeForKataPhase`, `getKataPhaseFromLinearStateType`, and `getLinearStateForKataPhase`. The title format `[M001] Title` was established using an uppercase-only bracket prefix regex so lowercase strings never accidentally match. Phase mapping uses Linear's five guaranteed state types; `verifying` shares `started` with `executing` and is distinguished by sub-issue completion ratio (deferred to S05). `canceled` maps to `done` to prevent phantom active issues. All five functions are pure imports with no side effects. 32 unit tests verified all edge cases.

**T02** added four entity-creation functions: `ensureKataLabels` (parallel `Promise.all` provisioning of three labels with fixed colors), `createKataMilestone` (LinearMilestone with formatted name), `createKataSlice` (issue with `kata:slice` label, optional milestone and state assignment), and `createKataTask` (sub-issue with `parentId` and `kata:task` label). A `LinearEntityClient` interface was introduced to avoid importing the full `LinearClient` class into the mapping module — this enables lightweight inline mocks and clean structural duck-typing. The `stateId` and `projectMilestoneId` fields are conditionally spread only when provided. 28 new unit tests using a `makeMockClient` spy helper verified all structural invariants without any real API calls.

**T03** added `listKataSlices` (queries by `projectId` + `sliceLabelId`) and `listKataTasks` (queries by `parentId`), extending the `LinearEntityClient` interface with `listIssues`. The 7-test integration suite proved the complete hierarchy end-to-end against a real Linear workspace: label provisioning (idempotency verified), milestone creation, slice issue creation with label and milestone attachment, task sub-issue creation with `parent.id === slice.id`, label-filtered slice listing, parent-filtered task listing, and `parseKataEntityTitle` round-trip recovery of Kata IDs from Linear issue titles. Cleanup deletes task → slice → milestone in order; labels are left (idempotent provisioning makes deletion unnecessary).

**T04** registered all 6 entity functions as pi tools in `linear-tools.ts` using the existing `ok/fail` pattern: `kata_ensure_labels`, `kata_create_milestone`, `kata_create_slice`, `kata_create_task`, `kata_list_slices`, `kata_list_tasks`. Entity functions are re-exported under `kata_*` aliases so the module is importable without the pi runtime. The `initialPhase` schema uses `Type.Union([Type.Literal(...)])` for proper enum typing. `registerLinearTools` now registers 28 total tools (22 from S01 + 6 from S03). Smoke-check confirmed all 6 `kata_*` names appear in module exports; TypeScript remained clean.

## Verification

**Unit tests (60 pass, 0 fail):**
```
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/entity-mapping.test.ts
# ℹ tests 60  ℹ pass 60  ℹ fail 0
```

**Integration test (7 pass, 0 fail, 3.0s):**
```
LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/entity-hierarchy.integration.test.ts
# ℹ tests 7  ℹ pass 7  ℹ fail 0  ℹ duration_ms 3162
```

**TypeScript build:**
```
npx tsc --noEmit
# (no output — clean)
```

## Requirements Advanced

- R102 — Kata hierarchy maps to Linear entities: integration test proves Project→Milestone→Slice→Task chain is created, queried, and structurally correct against a real Linear workspace

## Requirements Validated

- R102 — Integration test creates and verifies the full M001→S01→T01 hierarchy; `task.parent.id === slice.id` assertion proves sub-issue structure; `listKataSlices`/`listKataTasks` prove the hierarchy is queryable; `parseKataEntityTitle` proves IDs survive the round-trip through Linear

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- **LinearEntityClient interface** (T02): Plan called for `Pick<LinearClient, ...>` inline. A named exported interface was introduced instead — clearer, reusable, and more explicit about the structural contract. All downstream consumers (T03 integration test, T04 tools) benefit from the named type.
- **Re-exports in linear-tools.ts** (T04): Plan expected tool *names* to appear in module exports; tool names are registered at runtime, not as named exports. Entity functions were re-exported under `kata_*` aliases to satisfy the smoke-check verification requirement. This is additive and useful.
- **sliceLabelId / taskLabelId optional** (T04): Task plan silently omitted these from the "must-have" list but the step-by-step included them as optional schema fields. Treated as optional with inline `KataLabelSet` construction using empty strings for missing IDs.

## Known Limitations

- **kata:milestone label is provisioned but never applied** — Linear `ProjectMilestone` entities don't support labels. The label is provisioned for forward compatibility (e.g., if a future Linear API version adds label support to milestones, or if it's used as a query signal elsewhere).
- **verifying phase shares `started` state with executing** — S05 state derivation will need to distinguish them by sub-issue completion ratio, not by Linear state type.
- **No list function for milestones** — `listKataSlices` and `listKataTasks` exist; a `listKataMilestones` function was not needed for S03 but will be needed for S05 state derivation. S05 should add it.

## Follow-ups

- S04 needs document attachment to project (for roadmap/context/decisions) and to slice issue (for plan/summary); entity IDs from this slice are consumed as `issueId`/`projectId` params
- S05 needs `listKataMilestones` query function and status transition logic that resolves `verifying` vs `executing` via sub-issue completion counts
- S05 state derivation should use `kata_list_slices` and `kata_list_tasks` directly; these are the stable query surfaces

## Files Created/Modified

- `src/resources/extensions/linear/linear-types.ts` — added KataPhase, KataEntityType, KataLabelSet, KataEntityCreationConfig
- `src/resources/extensions/linear/linear-entities.ts` — new file: 5 pure mapping functions + LinearEntityClient interface + KATA_LABEL_* constants + ensureKataLabels + createKataMilestone + createKataSlice + createKataTask + listKataSlices + listKataTasks + exported option types
- `src/resources/extensions/linear/linear-tools.ts` — added 6 imports, 6 kata_* re-exports, 6 new tool registrations; total 28 tools
- `src/resources/extensions/linear/tests/entity-mapping.test.ts` — new file: 60 unit tests across 9 describe blocks
- `src/resources/extensions/linear/tests/entity-hierarchy.integration.test.ts` — new file: 7-test integration suite proving full hierarchy

## Forward Intelligence

### What the next slice should know
- `ensureKataLabels` must be called before any create function — the returned `KataLabelSet` contains the label IDs needed for `createKataSlice` and `createKataTask`. Store the IDs at session start, pass them to all subsequent calls.
- For documents (S04): use the `LinearMilestone.id` from `createKataMilestone`, the `LinearIssue.id` from `createKataSlice`, and `projectId` as attachment points. These are UUID strings, not Kata IDs.
- For state derivation (S05): `listKataSlices(client, projectId, labelSet.slice.id)` and `listKataTasks(client, sliceIssueId)` are the stable query surfaces. S05 also needs to add `listKataMilestones`.

### What's fragile
- `kata_create_slice` and `kata_create_task` tools take flat `sliceLabelId`/`taskLabelId` string params and construct a `KataLabelSet` inline with empty strings for unused fields — callers must pass real label IDs (from `kata_ensure_labels`) for label assignment to work. The schema accepts empty strings without error.
- `listKataSlices` will return an empty array (not an error) if the `sliceLabelId` is wrong. If the hierarchy seems missing, verify the label ID matches `KataLabelSet.slice.id` from `ensureKataLabels`.

### Authoritative diagnostics
- `parseKataEntityTitle(issue.title)` — call on any Linear issue title to recover `{ kataId, title }` or `null`. The primary decoding surface for all downstream agents.
- `kata_ensure_labels` tool output — the returned JSON `{ milestone, slice, task }` each with `{ id, name, color }` is the ground truth for label IDs used throughout the hierarchy.
- Integration test output at each step asserts IDs and names — run it with `LINEAR_API_KEY` to verify the full hierarchy creates/queries/cleans correctly.

### What assumptions changed
- LinearMilestones don't support labels — `kata:milestone` label cannot be applied to the milestone entity; it's provisioned only. The label name scheme assumed all entity types could be labeled.
- The `LinearEntityClient` interface (not in the original plan) proved more useful than `Pick<LinearClient, ...>` — the named interface is reusable across the codebase as the stable structural contract.
