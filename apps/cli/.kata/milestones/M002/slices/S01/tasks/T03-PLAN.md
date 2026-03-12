---
estimated_steps: 5
estimated_files: 5
---

# T03: Document CRUD, cursor pagination, and integration test

**Slice:** S01 — Linear GraphQL Client Extension
**Milestone:** M002

## Description

Complete the LinearClient's entity coverage with document operations (the storage mechanism for all Kata artifacts in S04), add a generic cursor pagination utility for large result sets, and write the integration test that proves every operation works against a real Linear workspace. This task retires two key risks from the roadmap: "Linear GraphQL API coverage" and "DocumentCreateInput.issueId is [Internal]".

## Steps

1. Add document operations to LinearClient: `createDocument(input: DocumentCreateInput)` supporting `projectId` and `issueId` (the `[Internal]` field from research). `getDocument(id: string)` returning full content. `listDocuments(filter?: { projectId?: string })` returning document list. `updateDocument(id: string, input: DocumentUpdateInput)` for content updates. Include `title`, `content` (markdown), `projectId`, `issueId`, `id`, `createdAt`, `updatedAt` in the `LinearDocument` type.

2. Implement a generic cursor pagination helper: `paginate<T>(queryFn: (cursor?: string) => Promise<{ nodes: T[], pageInfo: LinearPageInfo }>, maxPages?: number): Promise<T[]>`. This collects all pages by following `pageInfo.hasNextPage` / `pageInfo.endCursor`. Add a safety cap (`maxPages` default 10, ~2500 results) to prevent runaway pagination. Refactor `listTeams`, `listProjects`, `listIssues`, `listLabels`, `listDocuments`, `listMilestones`, `listWorkflowStates` to use the paginator internally.

3. Create `src/resources/extensions/linear/tests/resolve-ts.mjs` — the TypeScript import resolver for Node's `--experimental-strip-types` test runner, matching the pattern used by Kata's own tests. This enables running `.ts` test files directly without a build step.

4. Write `src/resources/extensions/linear/tests/integration.test.ts` — a comprehensive integration test gated by `LINEAR_API_KEY` env var. Test structure: setup (get team, create a test project with unique name), exercise all operations (create milestone under project, create parent issue, create sub-issue with parentId, create label via ensureLabel, attach label to issue, create document with projectId, create document with issueId, update document content, list operations with pagination), verify (all reads return expected data, document-to-issue attachment works), teardown (delete test entities in reverse order). Skip all tests with clear message if `LINEAR_API_KEY` is not set.

5. Run the integration test against real Linear API. Verify: all CRUD operations pass, document with `issueId` succeeds (retires `[Internal]` risk), pagination works for list operations, errors are properly classified. Fix any failures discovered.

## Must-Haves

- [ ] `createDocument()` works with `projectId` — document appears in project's documents in Linear UI
- [ ] `createDocument()` works with `issueId` — document attached to issue (retires `[Internal]` field risk)
- [ ] `getDocument()` returns full markdown `content` field
- [ ] `updateDocument()` modifies content and returns updated document
- [ ] `paginate<T>()` generic helper collects all pages with safety cap
- [ ] All list methods use cursor pagination internally
- [ ] Integration test exercises every entity type's CRUD operations
- [ ] Integration test passes with `LINEAR_API_KEY` set
- [ ] Integration test skips gracefully when `LINEAR_API_KEY` is not set

## Verification

- `LINEAR_API_KEY=<key> node --import ./src/resources/extensions/linear/tests/resolve-ts.mjs --experimental-strip-types src/resources/extensions/linear/tests/integration.test.ts` — all tests pass
- Confirm in Linear UI: test document appears attached to test issue (issueId wiring works)
- `npx tsc --noEmit` passes

## Observability Impact

- Signals added/changed: Integration test produces structured pass/fail output for each operation type — serves as a runnable health check for the Linear client at any time.
- How a future agent inspects this: Re-run integration test to verify API connectivity and coverage. Test output shows which operations pass/fail.
- Failure state exposed: Test failures include Linear API error messages, classified error kinds, and the specific operation that failed.

## Inputs

- `src/resources/extensions/linear/linear-client.ts` — T01+T02's LinearClient with team/project/issue/milestone/label ops
- `src/resources/extensions/linear/linear-types.ts` — T01+T02's type definitions
- `src/resources/extensions/kata/tests/resolve-ts.mjs` — Pattern reference for TS import resolver
- `/tmp/linear-cli-inspect/src/commands/document/document-create.ts` — Reference for `documentCreate` mutation with `issueId`
- S01-RESEARCH.md — Risk: `DocumentCreateInput.issueId` is `[Internal]`, needs explicit verification

## Expected Output

- `src/resources/extensions/linear/linear-client.ts` — Extended with document CRUD + paginate utility
- `src/resources/extensions/linear/linear-types.ts` — Extended with document-related types
- `src/resources/extensions/linear/tests/resolve-ts.mjs` — TS import resolver for tests
- `src/resources/extensions/linear/tests/integration.test.ts` — Full integration test suite
- Risk retired: "DocumentCreateInput.issueId" confirmed working or fallback documented
