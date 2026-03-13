---
estimated_steps: 4
estimated_files: 1
---

# T03: Integration tests for document round-trips

**Slice:** S04 — Document Storage — Artifacts as Linear Documents
**Milestone:** M002

## Description

Prove that the real Linear API accepts document writes and returns byte-identical content — including the `issueId` filter behavior that is the only API assumption not yet exercised in a real workspace. Follow the `entity-hierarchy.integration.test.ts` template exactly: `describe` with skip guard, `before()` provisioning, `after()` cleanup. Six test cases cover project-level and issue-level documents, upsert idempotency, markdown fidelity, list scoping, and read-not-found. This is the validation gate for R103.

## Steps

1. **Scaffold `document-storage.integration.test.ts`** following `entity-hierarchy.integration.test.ts` exactly: `const API_KEY = process.env.LINEAR_API_KEY;` at top, `describe("...", { skip: !API_KEY ? "LINEAR_API_KEY not set" : undefined }, () => { ... })`. In `before()`: create a `LinearClient`, call `client.listTeams()` + `client.listProjects()` to resolve `teamId` and `projectId` (or use env vars `LINEAR_TEAM_ID` / `LINEAR_PROJECT_ID` if set). Also create a throwaway issue with `client.createIssue({ title: "[S04-TEST] Document test issue", teamId, projectId })` to serve as the issue-level attachment target. Track its ID for cleanup. Initialize `createdDocumentIds: string[] = []` for cleanup tracking.

2. **Write `after()` cleanup**: delete all `createdDocumentIds` in order (use `Promise.allSettled` so one failure doesn't abort cleanup). Delete the throwaway issue. Leave workspace clean even on partial test failure.

3. **Implement the 6 test cases**:
   - **Test 1 — project-level write + read**: call `writeKataDocument(client, "M001-ROADMAP", markdownContent, { projectId })`; assert returned document has `title === "M001-ROADMAP"` and `content === markdownContent`; call `readKataDocument(client, "M001-ROADMAP", { projectId })`; assert returned document's `content === markdownContent`. Track doc ID.
   - **Test 2 — issue-level write + read**: call `writeKataDocument(client, "S01-PLAN", planContent, { issueId })`; assert title and content match; read back via `readKataDocument`; assert content identical. Track doc ID.
   - **Test 3 — upsert idempotency**: write `"M001-CONTEXT"` to project with content v1; write `"M001-CONTEXT"` again with content v2; call `listKataDocuments(client, { projectId })`; assert only 1 document with title `"M001-CONTEXT"` exists (filter manually); call `readKataDocument`; assert content === v2 (second write won). Track doc ID (only one created).
   - **Test 4 — markdown fidelity**: write content with `## Heading`, `` ``` `` code block, `- list item`, `**bold**`; read back; assert `content` is exactly equal to written content including all markdown syntax. (Same document as Test 1 is sufficient if content includes all these elements — or create a dedicated document.)
   - **Test 5 — list scoping**: call `listKataDocuments(client, { projectId })`; assert it includes project-level documents (M001-ROADMAP) and excludes the issue-level document (S01-PLAN). Call `listKataDocuments(client, { issueId })`; assert it includes S01-PLAN and excludes M001-ROADMAP.
   - **Test 6 — read not-found**: call `readKataDocument(client, "DOES-NOT-EXIST-${Date.now()}", { projectId })`; assert result is `null` (not an error).

4. **Use real markdown content for Test 1 / Test 4**: include at minimum a multi-line string with a `#` heading, a `##` subheading, a fenced code block, a bullet list, and inline bold. ~200 chars is sufficient to stress-test content round-trip without hitting size limits.

## Must-Haves

- [ ] `LINEAR_API_KEY` skip guard present — test file runs cleanly without API key (skips instead of errors)
- [ ] `before()` resolves `teamId` and `projectId` and creates a throwaway issue
- [ ] `after()` deletes all tracked document IDs and the throwaway issue; uses `Promise.allSettled` so cleanup doesn't abort on partial failure
- [ ] Test 1 passes: project-level document content round-trips without modification
- [ ] Test 2 passes: issue-level document content round-trips without modification (proves `issueId` filter works in real API)
- [ ] Test 3 passes: upsert creates exactly 1 document (not 2); read returns second-write content
- [ ] Test 4 passes: markdown syntax (`##`, `` ``` ``, `- `, `**`) survives round-trip byte-identical
- [ ] Test 5 passes: project-scoped list does not include issue-scoped documents and vice versa
- [ ] Test 6 passes: `readKataDocument` returns `null` for a title that was never written
- [ ] All 6 tests pass with `LINEAR_API_KEY` set; workspace is clean afterward

## Verification

- `LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/linear/tests/document-storage.integration.test.ts` → 6/6 pass, clean workspace after `after()` runs
- `npx tsc --noEmit` → clean

## Observability Impact

- Signals added/changed: Integration test output shows document IDs at each step — this is the primary evidence that API round-trips work; if a test fails, the last created document ID is visible in test output for manual inspection
- How a future agent inspects this: run the integration test with `LINEAR_API_KEY` to re-verify the full round-trip at any time; the test is self-contained and self-cleaning
- Failure state exposed: `after()` uses `Promise.allSettled` — on cleanup failure, settled results show which deletes failed (visible in test runner output); orphaned documents in Linear are detectable by their `[S04-TEST]` title prefix

## Inputs

- `src/resources/extensions/linear/linear-documents.ts` — `writeKataDocument`, `readKataDocument`, `listKataDocuments` from T02
- `src/resources/extensions/linear/linear-client.ts` — `LinearClient` class with extended `listDocuments`
- `src/resources/extensions/linear/tests/entity-hierarchy.integration.test.ts` — template for before/after/skip guard pattern

## Expected Output

- `src/resources/extensions/linear/tests/document-storage.integration.test.ts` — new file: 6 integration test cases, all passing with `LINEAR_API_KEY`; R103 validated
