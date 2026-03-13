---
id: T02
parent: S03
milestone: M002
provides:
  - ensureKataLabels (linear-entities.ts) — idempotent label provisioning returning KataLabelSet
  - createKataMilestone (linear-entities.ts) — creates a Linear ProjectMilestone with formatted name
  - createKataSlice (linear-entities.ts) — creates a Linear issue with kata:slice label and optional milestone/state
  - createKataTask (linear-entities.ts) — creates a Linear sub-issue with kata:task label and parentId
  - LinearEntityClient interface (linear-entities.ts) — minimal structural interface for duck-typed mocking in tests
  - CreateKataMilestoneOpts / CreateKataSliceOpts / CreateKataTaskOpts types (linear-entities.ts) — exported option types
  - 28 new unit tests in entity-mapping.test.ts covering all four functions
key_files:
  - src/resources/extensions/linear/linear-entities.ts
  - src/resources/extensions/linear/tests/entity-mapping.test.ts
key_decisions:
  - LinearEntityClient interface exported from linear-entities.ts rather than importing LinearClient class — avoids pulling http.ts into the pure mapping module and enables lightweight inline mocks in tests
  - stateId is conditionally spread only when non-undefined (not included as undefined key) — ensures IssueCreateInput is well-formed and tests for key absence are reliable
  - projectMilestoneId likewise spread only when milestoneId is provided — tasks never receive it
  - ensureKataLabels uses Promise.all for all three label calls — parallel provisioning, no serial dependency
patterns_established:
  - ensureKataLabels must be called first; the returned KataLabelSet is passed into slice/task create functions — label IDs resolved once, not per call
  - LinearEntityClient interface pattern enables structural duck-typing for mocks without extending the full class
  - Spy mock pattern (makeMockClient returning client + call-capture arrays) used for all T02 tests
observability_surfaces:
  - LinearGraphQLError thrown by LinearClient.assertSuccess when createMilestone/createIssue returns success:false — mutation name in message for localization
  - ensureKataLabels returns the full KataLabelSet — inspectable via kata_ensure_labels tool (registered in T04)
duration: ~25min
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T02: ensureKataLabels + createKataMilestone + createKataSlice + createKataTask

**Implemented four entity-creation functions in `linear-entities.ts` with 28 unit tests; all 60 tests in `entity-mapping.test.ts` pass and `npx tsc --noEmit` is clean.**

## What Happened

Extended `linear-entities.ts` with:

1. **`LinearEntityClient` interface** — minimal structural interface (`ensureLabel`, `createMilestone`, `createIssue`) so entity functions don't import the full `LinearClient` class and test mocks can be plain inline objects.

2. **`ensureKataLabels(client, teamId)`** — calls `client.ensureLabel` in parallel for all three labels (`kata:milestone` #7C3AED, `kata:slice` #2563EB, `kata:task` #16A34A); returns `KataLabelSet`. Color is advisory — existing labels are returned unchanged.

3. **`createKataMilestone(client, { projectId }, opts)`** — passes `formatKataEntityTitle(kataId, title)` as the milestone name; no label applied (Linear milestones are `ProjectMilestone` entities, not issues).

4. **`createKataSlice(client, config, opts)`** — creates issue with `kata:slice` label; conditionally sets `projectMilestoneId` and `stateId` (from `getLinearStateForKataPhase`) only when the relevant opts are present; never sets `parentId`.

5. **`createKataTask(client, config, opts)`** — creates sub-issue with `parentId: opts.sliceIssueId` and `kata:task` label; never sets `projectMilestoneId` (tasks inherit via parent); conditionally sets `stateId` from phase mapping.

Exported option types (`CreateKataMilestoneOpts`, `CreateKataSliceOpts`, `CreateKataTaskOpts`) for downstream consumers (T03/T04).

Extended `entity-mapping.test.ts` with 28 new tests across five describe blocks (ensureKataLabels ×5, createKataMilestone ×5, createKataSlice ×10, createKataTask ×8). A `makeMockClient()` helper captures all calls in typed arrays for assertion without any real API calls.

## Verification

```
# All 60 tests pass (32 T01 + 28 T02):
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/entity-mapping.test.ts
# → ℹ tests 60  ℹ pass 60  ℹ fail 0

npx tsc --noEmit
# → (no output — clean)
```

## Diagnostics

- `LinearGraphQLError` is thrown by `LinearClient.assertSuccess` when a mutation returns `success: false`; the message includes the mutation name (e.g. `"issueCreate returned success: false"`) so `classifyLinearError` can classify it and callers can localize the failure.
- The `KataLabelSet` returned by `ensureKataLabels` contains label IDs — inspectable via the `kata_ensure_labels` tool registered in T04.
- `parseKataEntityTitle` (T01) can decode any Linear issue title created by these functions — returns `{ kataId, title }` or `null`.

## Deviations

- Introduced `LinearEntityClient` interface (not in the original plan) instead of using `Pick<LinearClient, ...>` inline. This is a cleaner pattern: a named interface is more readable, reusable, and explicit about the contract. Downstreams (T03, T04) should use this interface for mock clients.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/linear/linear-entities.ts` — extended with `LinearEntityClient` interface, `KATA_LABEL_COLORS`/`KATA_LABEL_NAMES` constants, `ensureKataLabels`, `createKataMilestone`, `createKataSlice`, `createKataTask`, and their option types
- `src/resources/extensions/linear/tests/entity-mapping.test.ts` — extended with T02 unit tests (28 new tests across 5 describe blocks using `makeMockClient` spy helper)
