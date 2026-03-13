---
estimated_steps: 4
estimated_files: 2
---

# T04: Register kata_* pi Tools in linear-tools.ts

**Slice:** S03 — Entity Mapping — Hierarchy & Labels
**Milestone:** M002

## Description

Wire the six entity-mapping functions from `linear-entities.ts` into the pi tool registry so the agent can call them directly. This closes the S03 demo: an agent session with `LINEAR_API_KEY` set can now call `kata_ensure_labels`, then `kata_create_milestone` / `kata_create_slice` / `kata_create_task` to create the Kata hierarchy in Linear, and `kata_list_slices` / `kata_list_tasks` to query it.

All six tools use the existing `ok(data) / fail(err)` pattern from S01. The `kata_*` tool namespace is distinct from the existing `linear_*` tools — the latter are low-level CRUD; the former are Kata-semantics wrappers.

**Tool input design principles:**
- Tools that need a `KataLabelSet` accept `sliceLabelId` and `taskLabelId` as flat string inputs (not a nested object) — JSON Schema is simpler and callers can destructure from a prior `kata_ensure_labels` call
- `kata_ensure_labels` returns the full `KataLabelSet` as JSON so callers can capture label IDs
- `initialPhase` is optional on create tools; omit it to use the team's default state
- `kata_create_task` does NOT accept `milestoneId` — tasks attach to the milestone via their slice parent

**No new test file needed for this task** — the tools are thin wrappers over already-tested functions. TypeScript compilation and an import smoke check are sufficient.

## Steps

1. In `linear-tools.ts`: import `ensureKataLabels`, `createKataMilestone`, `createKataSlice`, `createKataTask`, `listKataSlices`, `listKataTasks` from `./linear-entities.js`.
2. Register `kata_ensure_labels` (input: `teamId: string`) and `kata_create_milestone` (input: `projectId`, `kataId`, `title`, optional `description`, `targetDate`) using `ok(result)/fail(err)` pattern; include JSON Schema for each parameter.
3. Register `kata_create_slice` (input: `teamId`, `projectId`, `kataId`, `title`, optional `milestoneId`, `sliceLabelId`, `taskLabelId`, `description`, `initialPhase`) and `kata_create_task` (input: `teamId`, `projectId`, `kataId`, `title`, `sliceIssueId`, `sliceLabelId`, `taskLabelId`, optional `description`, `initialPhase`) — note: tools receive flat `sliceLabelId`/`taskLabelId` strings and construct the `KataLabelSet` inline before passing to entity functions.
4. Register `kata_list_slices` (input: `projectId`, `sliceLabelId`) and `kata_list_tasks` (input: `sliceIssueId`); run `npx tsc --noEmit` and confirm no errors; verify with a quick module import check that the new tool names appear in the registered tools list.

## Must-Haves

- [ ] `kata_ensure_labels` tool registered with `teamId` string parameter
- [ ] `kata_create_milestone` tool registered with `projectId`, `kataId`, `title` required params
- [ ] `kata_create_slice` tool registered with `teamId`, `projectId`, `kataId`, `title` required; `milestoneId`, `description`, `initialPhase` optional
- [ ] `kata_create_task` tool registered with `teamId`, `projectId`, `kataId`, `title`, `sliceIssueId` required; `description`, `initialPhase` optional
- [ ] `kata_list_slices` tool registered with `projectId`, `sliceLabelId` required
- [ ] `kata_list_tasks` tool registered with `sliceIssueId` required
- [ ] All 6 tools use `ok(data)/fail(err)` and call the correct `linear-entities.ts` function
- [ ] `npx tsc --noEmit` passes with no new errors

## Verification

```bash
npx tsc --noEmit
```

Import smoke check (confirms tools are exported without loading pi runtime):
```bash
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types -e \
  "import('./src/resources/extensions/linear/linear-tools.ts').then(m => { const keys = Object.keys(m); console.log(keys.filter(k => k.startsWith('kata') || k === 'registerLinearTools')); })"
```

Expected output: lists the new `kata_*` function names alongside `registerLinearTools`.

## Observability Impact

- Signals added/changed: All 6 tools surface `LinearGraphQLError` and `LinearHttpError` as `fail(err)` results — callers see the error classification from S01's `classifyLinearError`; a future agent calling `kata_ensure_labels` gets label IDs it can pass to the create tools
- How a future agent inspects this: `kata_ensure_labels` is idempotent — a fresh agent session can call it on every startup to recover label IDs without side effects; `kata_list_slices` and `kata_list_tasks` are pure reads — safe to call for inspection at any time
- Failure state exposed: tool `fail` results include the classified error message; a caller can distinguish `auth_error` (bad key) from `not_found` (wrong projectId) from `network_error` (Linear unreachable)

## Inputs

- `src/resources/extensions/linear/linear-entities.ts` — T01+T02+T03's complete output: all 8 exported functions must be present
- `src/resources/extensions/linear/linear-tools.ts` — existing 22-tool file from S01; follow the exact same `registerLinearTools(pi, client)` pattern and `ok`/`fail` helpers
- `src/resources/extensions/linear/linear-types.ts` — `KataPhase` from T01 used for `initialPhase` tool parameter schema (`enum: ['backlog', 'planning', 'executing', 'verifying', 'done']`)

## Expected Output

- `src/resources/extensions/linear/linear-tools.ts` — extended with 6 new `kata_*` tool registrations; `registerLinearTools` now registers 28 total tools (22 from S01 + 6 from S03); TypeScript clean
