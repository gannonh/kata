# S03: Entity Mapping — Hierarchy & Labels

**Goal:** Implement `linear-entities.ts` with typed creation functions for the Kata→Linear entity hierarchy (milestone→slice parent issue→task sub-issue), idempotent label provisioning (`kata:milestone`, `kata:slice`, `kata:task`), workflow-state mapping conventions, and query functions for slices and tasks. Prove the full hierarchy is created and queryable against a real Linear workspace.

**Demo:** Agent runs `ensureKataLabels`, then `createKataMilestone`, `createKataSlice`, and `createKataTask` against a real Linear workspace. The resulting hierarchy is visible in Linear's UI: a milestone with a labeled parent issue (slice) containing a labeled sub-issue (task), all identified by their Kata IDs.

## Must-Haves

- `linear-entities.ts` exists with `ensureKataLabels`, `createKataMilestone`, `createKataSlice`, `createKataTask`, `listKataSlices`, `listKataTasks`, `formatKataEntityTitle`, `parseKataEntityTitle`, `getLinearStateForKataPhase`, `getKataPhaseFromLinearStateType` exported
- Title format `[M001] Title` / `[S01] Title` / `[T01] Title` is applied on creation and parsed back correctly
- `ensureKataLabels` is idempotent — calling it twice returns the same label IDs
- `createKataSlice` creates a Linear issue with `kata:slice` label, attached to the configured project + milestone
- `createKataTask` creates a Linear sub-issue with `kata:task` label and `parentId` pointing to the slice issue
- `listKataSlices` queries by `projectId` + `kata:slice` label ID and returns slice issues
- `listKataTasks` queries by `parentId` and returns task sub-issues
- Integration test creates the full M001→S01→T01 hierarchy in a real Linear workspace, verifies all structural contracts, and cleans up after
- 6 new pi tools registered: `kata_ensure_labels`, `kata_create_milestone`, `kata_create_slice`, `kata_create_task`, `kata_list_slices`, `kata_list_tasks`
- `npx tsc --noEmit` passes with no new errors

## Proof Level

- This slice proves: **integration** — real Linear API calls in an integration test create and query the full entity hierarchy
- Real runtime required: yes — integration test requires `LINEAR_API_KEY`; unit tests run without it
- Human/UAT required: no — hierarchy structure is verifiable from API responses; visual Linear UI check is documented in UAT but not blocking

## Verification

Unit tests (no API key required):
```
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/entity-mapping.test.ts
```

Integration test (requires `LINEAR_API_KEY`):
```
LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/entity-hierarchy.integration.test.ts
```

TypeScript build:
```
npx tsc --noEmit
```

## Observability / Diagnostics

- Runtime signals: `ensureKataLabels` logs label IDs on creation vs. cache hit; creation functions surface `LinearGraphQLError` with mutation name on failure
- Inspection surfaces: `kata_list_slices` and `kata_list_tasks` tools give agents a stable query surface for the created hierarchy; `kata_ensure_labels` tool returns the full `KataLabelSet` for inspection
- Failure visibility: `classifyLinearError()` from S01 classifies all errors (auth, rate_limited, network, not_found); mutation failures include the mutation name in the error message
- Redaction constraints: no secrets passed through or logged; `LINEAR_API_KEY` stays in environment

## Integration Closure

- Upstream surfaces consumed:
  - `src/resources/extensions/linear/linear-client.ts` → `LinearClient` (issue CRUD, milestone CRUD, label CRUD, `ensureLabel`, `listIssues`, `listWorkflowStates`)
  - `src/resources/extensions/linear/linear-types.ts` → `LinearIssue`, `LinearMilestone`, `LinearLabel`, `LinearWorkflowState`, `IssueCreateInput`
  - `src/resources/extensions/kata/linear-config.ts` → `getLinearTeamId()`, `getLinearProjectId()` (consumed by tools in T04, not by the entity module itself)
  - `classifyLinearError` via `http.ts` — reused for error taxonomy
- New wiring introduced in this slice:
  - `src/resources/extensions/linear/linear-entities.ts` — new module; tools registered via existing `registerLinearTools` pattern in `linear-tools.ts`
  - 6 new pi tools (`kata_*`) registered in `linear-tools.ts`
  - `KataPhase`, `KataEntityType`, `KataLabelSet` added to `linear-types.ts`
- What remains before the milestone is truly usable end-to-end:
  - S04: Document storage — plans/summaries not yet writable to Linear
  - S05: State derivation — `/kata status` and dashboard still blocked in Linear mode
  - S06: Workflow prompt + auto-mode wiring — `/kata auto` not yet dispatching to Linear

## Tasks

- [ ] **T01: Types, title conventions, and phase-state mapping** `est:45m`
  - Why: Foundation types and pure functions that T02–T04 build on; must be unit-tested before create functions depend on them
  - Files: `src/resources/extensions/linear/linear-types.ts`, `src/resources/extensions/linear/linear-entities.ts` (create), `src/resources/extensions/linear/tests/entity-mapping.test.ts` (create)
  - Do: Add `KataPhase`, `KataEntityType`, `KataLabelSet`, `KataEntityCreationConfig` to `linear-types.ts`; create `linear-entities.ts` with `formatKataEntityTitle`, `parseKataEntityTitle`, `getLinearStateTypeForKataPhase`, `getKataPhaseFromLinearStateType`, `getLinearStateForKataPhase`; write unit tests covering title round-trips, phase mapping, and edge cases (unknown state types, missing match)
  - Verify: unit test suite passes; `npx tsc --noEmit` clean
  - Done when: all unit tests pass and TypeScript builds without errors

- [ ] **T02: ensureKataLabels + createKataMilestone + createKataSlice + createKataTask** `est:1h`
  - Why: Core entity-creation logic from the boundary map contract — the functions that make Kata→Linear entity mapping real
  - Files: `src/resources/extensions/linear/linear-entities.ts` (extend), `src/resources/extensions/linear/tests/entity-mapping.test.ts` (extend)
  - Do: Implement `ensureKataLabels(client, teamId)` using `LinearClient.ensureLabel` with fixed label names (`kata:milestone`, `kata:slice`, `kata:task`) and fixed colors; implement `createKataMilestone(client, { projectId }, opts)` using `client.createMilestone` with `[M001] Title` formatted name; implement `createKataSlice(client, { teamId, projectId, labelSet }, opts)` using `client.createIssue` with `projectMilestoneId`, `labelIds: [labelSet.slice.id]`, and formatted title; implement `createKataTask(client, { teamId, projectId, labelSet }, opts)` using `client.createIssue` with `parentId: opts.sliceIssueId`, `labelIds: [labelSet.task.id]`; write unit tests using a minimal mock `LinearClient` verifying label IDs are applied, title format is correct, and parentId is set
  - Verify: unit tests pass; `npx tsc --noEmit` clean
  - Done when: all unit tests pass with mock client verifying structural invariants

- [ ] **T03: listKataSlices + listKataTasks + integration test** `est:1h30m`
  - Why: Proves the full hierarchy (milestone→slice→task) actually works in a real Linear workspace and the query functions return the right entities — retires the S03 risk in the roadmap
  - Files: `src/resources/extensions/linear/linear-entities.ts` (extend), `src/resources/extensions/linear/tests/entity-hierarchy.integration.test.ts` (create)
  - Do: Implement `listKataSlices(client, projectId, sliceLabelId)` using `client.listIssues({ projectId, labelIds: [sliceLabelId] })`; implement `listKataTasks(client, sliceIssueId)` using `client.listIssues({ parentId: sliceIssueId })`; write integration test that: (1) gets team + project via client, (2) calls `ensureKataLabels`, (3) creates a milestone with `createKataMilestone` using tag-stamped name, (4) gets workflow states, (5) creates a slice issue with `createKataSlice`, (6) creates a task sub-issue with `createKataTask`, (7) asserts `task.parent.id === slice.id`, (8) calls `listKataSlices` and finds the created slice, (9) calls `listKataTasks(sliceId)` and finds the created task, (10) asserts `parseKataEntityTitle` recovers the Kata IDs from the issue titles, (11) cleans up all created entities
  - Verify: `LINEAR_API_KEY=<key> node ... entity-hierarchy.integration.test.ts` passes end-to-end
  - Done when: integration test creates, verifies, and cleans up the full hierarchy with all assertions passing

- [ ] **T04: Register kata_* pi tools in linear-tools.ts** `est:30m`
  - Why: Makes the entity-mapping functions available as pi agent tools — this is how the agent will call them in S06; closes the S03 demo requirement
  - Files: `src/resources/extensions/linear/linear-tools.ts`
  - Do: Import from `linear-entities.ts`; add 6 tools using the existing `ok(data)/fail(err)` pattern: `kata_ensure_labels` (input: `teamId`), `kata_create_milestone` (input: `projectId`, `kataId`, `title`, optional `description`/`targetDate`), `kata_create_slice` (input: `teamId`, `projectId`, `labelSet`, `kataId`, `title`, optional `milestoneId`/`description`/`initialPhase`), `kata_create_task` (input: `teamId`, `projectId`, `labelSet`, `sliceIssueId`, `kataId`, `title`, optional `description`/`initialPhase`), `kata_list_slices` (input: `projectId`, `sliceLabelId`), `kata_list_tasks` (input: `sliceIssueId`); verify `npx tsc --noEmit` still passes; smoke-check with `node -e "import('./src/resources/extensions/linear/linear-tools.ts').then(m => console.log(Object.keys(m)))"` (or equivalent import check)
  - Verify: `npx tsc --noEmit` passes; import check confirms new tool functions are exported
  - Done when: 6 new tools registered, TypeScript clean

## Files Likely Touched

- `src/resources/extensions/linear/linear-types.ts` — add `KataPhase`, `KataEntityType`, `KataLabelSet`, `KataEntityCreationConfig`
- `src/resources/extensions/linear/linear-entities.ts` — create: title format/parse, phase-state mapping, label provisioning, entity creation, query functions
- `src/resources/extensions/linear/linear-tools.ts` — extend: 6 new `kata_*` tool definitions
- `src/resources/extensions/linear/tests/entity-mapping.test.ts` — create: unit tests for pure functions
- `src/resources/extensions/linear/tests/entity-hierarchy.integration.test.ts` — create: integration test for full hierarchy
