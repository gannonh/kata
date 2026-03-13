---
id: T03
parent: S03
milestone: M002
provides:
  - listKataSlices (linear-entities.ts) — queries Linear issues by projectId + kata:slice labelId
  - listKataTasks (linear-entities.ts) — queries Linear sub-issues by parentId (slice issue UUID)
  - entity-hierarchy.integration.test.ts — end-to-end integration test proving full hierarchy creation and query
key_files:
  - src/resources/extensions/linear/linear-entities.ts
  - src/resources/extensions/linear/tests/entity-hierarchy.integration.test.ts
key_decisions:
  - listKataSlices uses labelIds filter (not parentId) — slices are top-level project issues identified by label, not by parent
  - listKataTasks uses parentId filter — tasks are identified by their parent relationship, not by label (more robust)
  - LinearEntityClient interface extended with listIssues signature to support structural duck-typing in both real client and future mocks
  - Integration test uses per-test variable progression (each test accesses ids from prior tests) — not a flat setup block — so partial failure leaves only that test's artifacts uncleaned
patterns_established:
  - listKataSlices(client, projectId, sliceLabelId) — pass the resolved label ID from KataLabelSet.slice.id, not the label name
  - listKataTasks(client, sliceIssueId) — pass the slice issue UUID, not the slice kataId string
  - Cleanup order for hierarchy: task issue → slice issue → milestone (never delete labels — idempotent provisioning means they're harmless to leave)
observability_surfaces:
  - listKataSlices/listKataTasks propagate LinearGraphQLError on API failure; empty result (wrong label ID or projectId) is distinguishable from error
  - Integration test log confirms entity creation by asserting IDs and names at each step — inspect test output for which step produced a failure
duration: ~20m
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T03: listKataSlices + listKataTasks + Integration Test

**Added `listKataSlices` and `listKataTasks` to `linear-entities.ts` and proved the full Kata hierarchy end-to-end with a passing 7-test integration suite against a real Linear workspace.**

## What Happened

Extended `linear-entities.ts` with two query functions:

- **`listKataSlices(client, projectId, sliceLabelId)`** — delegates to `client.listIssues({ projectId, labelIds: [sliceLabelId] })`. Returns all issues in the project carrying the `kata:slice` label.
- **`listKataTasks(client, sliceIssueId)`** — delegates to `client.listIssues({ parentId: sliceIssueId })`. Returns all direct sub-issues of the given slice.

The `LinearEntityClient` interface was extended with a `listIssues` signature so structural duck-typing works for both the real `LinearClient` and inline test mocks (no mock needed for the integration test — the real client is used directly).

Created `entity-hierarchy.integration.test.ts` with 7 sequential tests:

1. `ensureKataLabels` — provisions kata:milestone/slice/task labels; verifies idempotency (second call returns same IDs)
2. `createKataMilestone` — creates `[M001] <tag>` milestone; verifies `parseKataEntityTitle` round-trip
3. `createKataSlice` — creates `[S01] <tag>` slice issue with `kata:slice` label and milestone attachment
4. `createKataTask` — creates `[T01] <tag>` task sub-issue under slice; asserts `task.parent.id === slice.id`
5. `listKataSlices` — finds the created slice in the label-filtered result set
6. `listKataTasks` — finds the created task in the parent-filtered result set
7. `parseKataEntityTitle` round-trip — recovers `{ kataId: 'S01', title: <tag> }` and `{ kataId: 'T01', title: <tag> }` from both issue titles

Cleanup in `after()` deletes task → slice → milestone in order; silently ignores not-found errors from partial failure. Labels are not deleted (idempotent provisioning).

## Verification

Unit tests — no regressions:
```
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/entity-mapping.test.ts
# ✔ 60/60 pass
```

Integration test — full hierarchy end-to-end:
```
LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/entity-hierarchy.integration.test.ts
# ✔ 7/7 pass (4.4s)
```

TypeScript build:
```
npx tsc --noEmit
# (no output — clean)
```

## Diagnostics

- `listKataSlices` and `listKataTasks` are the primary query surfaces for S05 state derivation. If they return empty, check: (1) correct `projectId`, (2) correct `sliceLabelId` from `KataLabelSet.slice.id`, (3) `parentId` matches the slice issue UUID (not the Kata string "S01").
- `LinearGraphQLError` propagates from both functions on API failure — classifiable via `classifyLinearError()`.
- Empty result vs API error: empty array = wrong filter params; thrown error = API/auth failure.

## Deviations

None. Plan executed as written.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/linear/linear-entities.ts` — added `listKataSlices`, `listKataTasks`; extended `LinearEntityClient` interface with `listIssues`
- `src/resources/extensions/linear/tests/entity-hierarchy.integration.test.ts` — new 7-test integration suite proving full hierarchy
