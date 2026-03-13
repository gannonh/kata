---
estimated_steps: 5
estimated_files: 2
---

# T03: listKataSlices + listKataTasks + Integration Test

**Slice:** S03 — Entity Mapping — Hierarchy & Labels
**Milestone:** M002

## Description

Implement the two query functions that downstream slices (S05, S06) will use to inspect Kata hierarchy state, then prove the entire hierarchy works end-to-end against a real Linear workspace. This integration test is the primary evidence for S03's demo claim.

**`listKataSlices(client, projectId, sliceLabelId)`:** calls `client.listIssues({ projectId, labelIds: [sliceLabelId] })`. Returns only issues that have the `kata:slice` label, scoped to the project.

**`listKataTasks(client, sliceIssueId)`:** calls `client.listIssues({ parentId: sliceIssueId })`. Returns all sub-issues of the given slice issue.

**Integration test structure:** Uses a timestamp tag (`kata-s03-${Date.now()}`) to prevent collisions with other runs. The test project ID is taken from the first project accessible to the first team (same pattern as S01 integration test). All created entities are deleted in `after()` — the test leaves the workspace clean even on partial failure (track IDs as they're created; delete what was created).

**Cleanup order:** delete sub-issue (task) → delete parent issue (slice) → delete milestone. Labels are NOT deleted — they may already exist from prior runs and `ensureLabel` idempotency means they're harmless to leave.

## Steps

1. In `linear-entities.ts`: implement `listKataSlices(client, projectId, sliceLabelId)` using `client.listIssues({ projectId, labelIds: [sliceLabelId] })`.
2. In `linear-entities.ts`: implement `listKataTasks(client, sliceIssueId)` using `client.listIssues({ parentId: sliceIssueId })`.
3. Create `tests/entity-hierarchy.integration.test.ts`: set up the test scaffolding with `before`/`after` hooks, timestamp tag, `LINEAR_API_KEY` skip guard (same pattern as S01 integration test).
4. Write the main integration test scenario: call `ensureKataLabels` → `createKataMilestone` → get workflow states → `createKataSlice` → `createKataTask` → assert `task.parent.id === slice.id` → `listKataSlices` and find the slice → `listKataTasks` and find the task → `parseKataEntityTitle` on both issue titles and verify recovered `kataId`s match.
5. Wire cleanup in `after()`: delete task issue → delete slice issue → delete milestone (skip any `not_found` errors silently).

## Must-Haves

- [ ] `listKataSlices` returns slice issues filtered by `kata:slice` label for the given project
- [ ] `listKataTasks` returns sub-issues with the given slice issue as parent
- [ ] Integration test creates `[M001] <tag>` milestone, `[S01] <tag>` slice issue, `[T01] <tag>` task sub-issue
- [ ] Integration test asserts `task.parent.id === slice.id` (sub-issue hierarchy confirmed)
- [ ] Integration test asserts `slice.labels` contains an entry with `name === 'kata:slice'`
- [ ] Integration test asserts `task.labels` contains an entry with `name === 'kata:task'`
- [ ] `listKataSlices` result contains the created slice
- [ ] `listKataTasks(slice.id)` result contains the created task
- [ ] `parseKataEntityTitle(slice.title)` returns `{ kataId: 'S01', title: ... }`
- [ ] `parseKataEntityTitle(task.title)` returns `{ kataId: 'T01', title: ... }`
- [ ] All created entities deleted in `after()`; integration test passes end-to-end

## Verification

```bash
LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/entity-hierarchy.integration.test.ts
```

Expected: all assertions pass, cleanup completes, no leaked entities. The integration test output should include confirmation of entity creation and deletion.

Also run unit tests to confirm no regressions:
```bash
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/entity-mapping.test.ts
```

## Observability Impact

- Signals added/changed: `listKataSlices` and `listKataTasks` are the primary query surfaces that S05 and S06 will use to derive Kata state from Linear; if they return empty or wrong results, S05 state derivation will fail visibly
- How a future agent inspects this: call `kata_list_slices` (T04's tool) with a projectId and sliceLabelId to enumerate slices; call `kata_list_tasks` with a sliceIssueId to enumerate tasks
- Failure state exposed: `listIssues` propagates `LinearGraphQLError` on API failure; empty result (wrong label ID or projectId) is distinguishable from API error

## Inputs

- `src/resources/extensions/linear/linear-entities.ts` — T01 + T02's output: all creation functions and pure helpers must be present
- `src/resources/extensions/linear/linear-client.ts` — S01's `listIssues({ parentId })` and `deleteIssue`/`deleteMilestone` confirmed working in S01's integration test
- `src/resources/extensions/linear/tests/integration.test.ts` — S01's integration test: use same scaffold pattern (before/after hooks, timestamp tag, skip guard, single-describe structure)
- S01-SUMMARY: `listIssues({ parentId })` and `listIssues({ labelIds })` both confirmed working; cleanup pattern established

## Expected Output

- `src/resources/extensions/linear/linear-entities.ts` — extended with `listKataSlices` and `listKataTasks`; this file is now complete for S03
- `src/resources/extensions/linear/tests/entity-hierarchy.integration.test.ts` — new integration test; all assertions passing against real Linear API
