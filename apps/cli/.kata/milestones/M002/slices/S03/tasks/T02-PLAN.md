---
estimated_steps: 5
estimated_files: 2
---

# T02: ensureKataLabels + createKataMilestone + createKataSlice + createKataTask

**Slice:** S03 — Entity Mapping — Hierarchy & Labels
**Milestone:** M002

## Description

Implement the four core entity-creation functions in `linear-entities.ts` that map Kata entities onto Linear. This task uses a minimal mock `LinearClient` in tests — no real API calls. The integration proof comes in T03.

**Label colors (fixed conventions):**
- `kata:milestone` — `#7C3AED` (violet — milestone-level)
- `kata:slice` — `#2563EB` (blue — in-progress work unit)
- `kata:task` — `#16A34A` (green — leaf task)

These colors are constants defined in the module, not user-configurable. If a label already exists (different color), `ensureLabel` returns the existing one — color is advisory only.

**`ensureKataLabels` must be called before any create function.** The resulting `KataLabelSet` is passed to `createKataSlice` and `createKataTask` so label IDs are resolved once, not on every call. This avoids redundant API calls and makes the label dependency explicit.

**`createKataMilestone`** does NOT take a `KataLabelSet` — Linear milestones are `ProjectMilestone` entities (not issues) and cannot have labels. `kata:milestone` label is provisioned by `ensureKataLabels` for potential future use but not applied here.

**Initial state:** When creating slice and task issues, if `opts.initialPhase` is provided, call `getLinearStateForKataPhase(states, phase)` to find the stateId. If no `opts.initialPhase` (or no matching state), omit `stateId` from `IssueCreateInput` and let Linear assign the team's default state.

## Steps

1. In `linear-entities.ts`: implement `ensureKataLabels(client, teamId)` — calls `client.ensureLabel` three times with fixed names and colors; returns `KataLabelSet`.
2. In `linear-entities.ts`: implement `createKataMilestone(client, { projectId }, opts)` — calls `client.createMilestone({ name: formatKataEntityTitle(opts.kataId, opts.title), projectId, description: opts.description, targetDate: opts.targetDate })`; returns `LinearMilestone`.
3. In `linear-entities.ts`: implement `createKataSlice(client, { teamId, projectId, labelSet }, opts)` — calls `client.createIssue` with formatted title, `projectId`, `labelIds: [labelSet.slice.id]`, optional `projectMilestoneId`, optional `stateId` from phase mapping; returns `LinearIssue`.
4. In `linear-entities.ts`: implement `createKataTask(client, { teamId, projectId, labelSet }, opts)` — calls `client.createIssue` with formatted title, `parentId: opts.sliceIssueId`, `teamId`, `projectId`, `labelIds: [labelSet.task.id]`, optional `stateId` from phase mapping; returns `LinearIssue`.
5. Extend `tests/entity-mapping.test.ts` with unit tests using a minimal mock `LinearClient` (inline object with stubbed `ensureLabel`, `createMilestone`, `createIssue`): assert label names and colors are passed correctly, assert titles are formatted with bracket prefix, assert `kata:slice` label ID appears in `labelIds` for slice, assert `parentId` equals `opts.sliceIssueId` for task, assert `kata:milestone` label is NOT applied to milestones.

## Must-Haves

- [ ] `ensureKataLabels` calls `client.ensureLabel` with `'kata:milestone'`, `'kata:slice'`, `'kata:task'` and fixed hex colors
- [ ] `createKataMilestone` passes `formatKataEntityTitle(kataId, title)` as the milestone name
- [ ] `createKataSlice` passes `labelIds: [labelSet.slice.id]` to `createIssue`
- [ ] `createKataSlice` passes `projectMilestoneId: opts.milestoneId` when milestone ID is provided
- [ ] `createKataTask` passes `parentId: opts.sliceIssueId` to `createIssue`
- [ ] `createKataTask` passes `labelIds: [labelSet.task.id]` to `createIssue`
- [ ] `createKataTask` does NOT pass `projectMilestoneId` (tasks inherit the milestone via parent)
- [ ] `createKataMilestone` does NOT receive or use a `KataLabelSet`
- [ ] Unit tests pass without API calls; `npx tsc --noEmit` clean

## Verification

```bash
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/entity-mapping.test.ts

npx tsc --noEmit
```

All tests in `entity-mapping.test.ts` should pass, including the new T02 tests.

## Observability Impact

- Signals added/changed: `ensureKataLabels` creates/confirms labels in Linear (visible in Linear's label list for the team); creation functions throw `LinearGraphQLError` with the mutation name if Linear returns `success: false`
- How a future agent inspects this: `kata_ensure_labels` tool (registered in T04) returns the `KataLabelSet`; a future agent can call it to get label IDs before creating entities
- Failure state exposed: `LinearGraphQLError` message includes mutation name (e.g., `"issueCreate returned success: false"`); `classifyLinearError` from S01 classifies the error type for callers

## Inputs

- `src/resources/extensions/linear/linear-entities.ts` — T01's output; must have `formatKataEntityTitle`, `getLinearStateForKataPhase`, `KataLabelSet`
- `src/resources/extensions/linear/linear-types.ts` — T01's type additions; must have `KataEntityCreationConfig`, `KataPhase`
- `src/resources/extensions/linear/linear-client.ts` — S01's `LinearClient`; use `ensureLabel`, `createMilestone`, `createIssue` — do NOT call `getTeam`/`getProject` from within entity functions (callers have already resolved those)
- S01-SUMMARY: `createIssue({ parentId })` confirmed working; `ensureLabel` is idempotent; `projectMilestoneId` accepted in `IssueCreateInput`

## Expected Output

- `src/resources/extensions/linear/linear-entities.ts` — extended with `ensureKataLabels`, `createKataMilestone`, `createKataSlice`, `createKataTask`
- `src/resources/extensions/linear/tests/entity-mapping.test.ts` — extended with T02 unit tests; all tests (T01 + T02) still passing
