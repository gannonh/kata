# S03: Entity Mapping — Hierarchy & Labels — UAT

**Milestone:** M002
**Written:** 2026-03-12

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: S03's proof requirement is integration-level — real Linear API calls that create and query the full entity hierarchy. The integration test suite (`entity-hierarchy.integration.test.ts`) exercises the complete chain against a live Linear workspace, making artifact-driven UAT insufficient. Human visual inspection of the Linear UI is documented below but not blocking.

## Preconditions

- `LINEAR_API_KEY` is set in `.env` (valid personal API key with write access to the target workspace)
- The target workspace has at least one team and one project
- `npx tsc --noEmit` is clean

## Smoke Test

Run the integration test — 7 tests should all pass in under 10 seconds:

```
cd /Volumes/EVO/kata/kata-mono/apps/cli
source .env
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/entity-hierarchy.integration.test.ts
```

Expected: `ℹ tests 7  ℹ pass 7  ℹ fail 0`

## Test Cases

### 1. Label provisioning is idempotent

1. Run `kata_ensure_labels` tool (or call `ensureKataLabels(client, teamId)` directly)
2. Inspect returned `KataLabelSet` — three labels with non-empty IDs
3. Run again
4. **Expected:** Both calls return the same `id` values for all three labels; no duplicate labels created in Linear workspace

### 2. Milestone creation with formatted name

1. Call `kata_create_milestone` with `kataId: "M001"`, `title: "Test Milestone"`
2. **Expected:** A LinearMilestone is created; its `name` field equals `"[M001] Test Milestone"`
3. Call `parseKataEntityTitle("[M001] Test Milestone")`
4. **Expected:** Returns `{ kataId: "M001", title: "Test Milestone" }` — round-trip succeeds

### 3. Slice issue created under project/milestone with label

1. Call `kata_create_slice` with `kataId: "S01"`, `title: "Test Slice"`, `sliceLabelId` from step 1
2. **Expected:** A Linear issue is created with:
   - Title `[S01] Test Slice`
   - `labelIds` contains the `kata:slice` label ID
   - `projectMilestoneId` points to the milestone from step 2 (if provided)
   - No `parentId` set (top-level project issue)

### 4. Task sub-issue created under slice

1. Call `kata_create_task` with `kataId: "T01"`, `title: "Test Task"`, `sliceIssueId` from step 3, `taskLabelId` from step 1
2. **Expected:** A Linear issue is created with:
   - Title `[T01] Test Task`
   - `labelIds` contains the `kata:task` label ID
   - `parent.id === slice issue ID` from step 3

### 5. Hierarchy is queryable

1. Call `kata_list_slices` with `projectId` and `sliceLabelId` from step 1
2. **Expected:** The slice issue from step 3 appears in the result list
3. Call `kata_list_tasks` with the slice issue ID from step 3
4. **Expected:** The task sub-issue from step 4 appears in the result list

### 6. (Optional) Visual inspection in Linear UI

1. Open the Linear project in a browser
2. Navigate to the milestone created in step 2
3. **Expected:** Milestone visible in the project; slice issue appears as a project issue with `kata:slice` label; task sub-issue appears nested under the slice issue

## Edge Cases

### parseKataEntityTitle with unexpected titles

1. Call `parseKataEntityTitle` with `"no brackets here"`, `""`, `"[lowercase] title"`, `"[M001]nospace"`
2. **Expected:** All return `null` — no exceptions thrown

### ensureKataLabels called without prior provisioning

1. Use a fresh team ID where Kata labels don't exist
2. Call `ensureKataLabels(client, teamId)`
3. **Expected:** Three new labels created; `KataLabelSet` returned with real IDs and fixed colors (`#7C3AED`, `#2563EB`, `#16A34A`)

### listKataSlices with wrong label ID

1. Call `kata_list_slices` with a random non-existent label ID
2. **Expected:** Returns empty array — no error thrown

## Failure Signals

- Any integration test fails: check `LINEAR_API_KEY` validity; check network connectivity; inspect `LinearGraphQLError` message for mutation name
- `kata_list_slices` returns empty when slice was created: verify `sliceLabelId` matches `KataLabelSet.slice.id` from `ensureKataLabels` (not the label name string)
- `task.parent` is null after `createKataTask`: verify `sliceIssueId` is the UUID from the slice issue response, not the Kata ID string "S01"
- TypeScript errors after adding imports from `linear-entities.ts`: verify the `LinearEntityClient` interface is used instead of the concrete `LinearClient` class for mock-compatible typing

## Requirements Proved By This UAT

- R102 — Kata hierarchy maps to Linear entities: integration test creates and verifies Project→Milestone→Slice(parent issue)→Task(sub-issue) with `task.parent.id === slice.id` and both queryable by label/parent filters

## Not Proven By This UAT

- R101 (Linear mode as switchable workflow alternative) — the hierarchy creation functions exist, but mode switching and per-project configuration are owned by S02/S06; this UAT does not exercise `isLinearMode()` or auto-mode dispatch
- R103 (Rich artifacts stored as Linear Documents) — document storage is S04; this slice does not write any documents
- R104 (State derived from Linear API) — state derivation is S05; this slice provides the query surfaces but not the derivation logic
- R108/R109 (Auto-mode and dashboard in Linear mode) — these require S05 and S06 to be complete

## Notes for Tester

- The integration test creates and cleans up real entities in the configured Linear workspace. Use a dedicated test project to avoid polluting production data.
- Labels (`kata:milestone`, `kata:slice`, `kata:task`) are **not deleted** during cleanup — they are idempotently provisioned and harmless to leave in the workspace.
- The integration test uses a timestamp-stamped test tag in entity names (e.g., `[M001] 1741747200000`) to avoid collisions on parallel runs. Check the test output for the exact names if you need to locate entities in the Linear UI.
- `verifying` and `executing` both map to the Linear `started` state type — they are indistinguishable at the state level until S05 adds sub-issue completion ratio logic.
