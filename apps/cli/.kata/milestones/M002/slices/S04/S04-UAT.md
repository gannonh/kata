# S04: Document Storage — Artifacts as Linear Documents — UAT

**Milestone:** M002
**Written:** 2026-03-12

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S04 is a pure integration layer — no user-visible UI, no workflow prompt changes, no auto-mode modifications. Correctness is fully verifiable by running the unit test suites (35 naming + 24 mock) and 6 integration tests against the real Linear API. The integration tests prove byte-identical round-trips, upsert idempotency, scoping isolation, and null-on-miss — all meaningful correctness properties that would surface in production usage.

## Preconditions

For unit tests only:
- Node.js ≥ 20
- Working directory: `/Volumes/EVO/kata/kata-mono/apps/cli`

For integration tests (additionally):
- `LINEAR_API_KEY` — personal Linear API key with read/write access to a team and project
- Optional: `LINEAR_TEAM_ID`, `LINEAR_PROJECT_ID` — shortcut env vars to skip resolution step

## Smoke Test

Run the unit tests (no API key required):

```
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/document-naming.test.ts \
  src/resources/extensions/linear/tests/document-operations.test.ts
```

Expected: `59 pass, 0 fail`. If this passes, naming and operation logic are correct.

## Test Cases

### 1. Naming codec — buildDocumentTitle round-trips

1. Run `document-naming.test.ts` test suite.
2. **Expected:** 35/35 pass — all title formats (`M001-ROADMAP`, `S01-PLAN`, `T01-SUMMARY`, `DECISIONS`, `PROJECT`) build and parse correctly; round-trips are lossless; lowercase and empty inputs handled correctly.

### 2. Mock operations — upsert/read/list branches

1. Run `document-operations.test.ts` test suite.
2. **Expected:** 24/24 pass — create branch fires when `listDocuments` returns empty; update branch fires when `listDocuments` returns an existing document; `readKataDocument` returns null on miss; `listKataDocuments` passes no title filter; both `projectId` and `issueId` attachment variants route correctly.

### 3. Integration — project-level write and read (R103)

1. Set `LINEAR_API_KEY` in env.
2. Run `document-storage.integration.test.ts`.
3. **Expected:** Test 1 passes — `M001-ROADMAP` content with `## Heading`, `` ``` `` code block, `* ` list items, and `**bold**` is written to a project and read back with byte-identical content.

### 4. Integration — issue-level write and read

1. Set `LINEAR_API_KEY` in env.
2. Run `document-storage.integration.test.ts`.
3. **Expected:** Test 2 passes — `S01-PLAN` written to a throwaway issue is read back correctly; content survives the round-trip with the same normalization behavior as project-level documents.

### 5. Integration — upsert idempotency

1. Set `LINEAR_API_KEY` in env.
2. Run `document-storage.integration.test.ts`.
3. **Expected:** Test 3 passes — writing the same title twice produces exactly 1 document (not 2); `readKataDocument` returns the second content (most recent write wins).

### 6. Integration — list scoping isolation

1. Set `LINEAR_API_KEY` in env.
2. Run `document-storage.integration.test.ts`.
3. **Expected:** Test 5 passes — `listKataDocuments({ projectId })` does not return issue-scoped documents; `listKataDocuments({ issueId })` does not return project-scoped documents.

### 7. Integration — null on miss

1. Set `LINEAR_API_KEY` in env.
2. Run `document-storage.integration.test.ts`.
3. **Expected:** Test 6 passes — `readKataDocument` with a title that was never written returns `null` (not an error).

## Edge Cases

### Empty document content survives round-trip

1. (Covered by mock unit tests) Call `writeKataDocument` with `content: ""`.
2. Call `readKataDocument` for the same title.
3. **Expected:** Returns the document with empty content (not null). `null` means missing; empty string means written-but-empty.

### TypeScript clean across all extension modules

1. Run `npx tsc --noEmit`.
2. **Expected:** No output (clean). Any type error in `linear-types.ts`, `linear-client.ts`, `linear-documents.ts`, or `linear-tools.ts` surfaces here.

### Tool count verification

1. Run `grep -c 'pi.registerTool' src/resources/extensions/linear/linear-tools.ts`.
2. **Expected:** 37. Confirms all three new document tools are registered alongside the existing 34.

## Failure Signals

- Unit test failures in `document-naming.test.ts` → naming convention broken; `buildDocumentTitle`/`parseDocumentTitle` logic regressed
- Unit test failures in `document-operations.test.ts` → upsert/read/list logic broken; check mock spy call assertions to identify which branch
- Integration test failure on Test 1 or 2 → check Linear API normalization; content mismatch is almost always `- ` vs `* ` bullets or trailing newline
- Integration test failure on Test 3 (upsert) → `listDocuments(title)` filter not working; check `DOCUMENT_FIELDS` and filter builder in `LinearClient.listDocuments`
- Integration test failure on Test 5 (scoping) → `issueId` filter in `listDocuments` not being applied; check filter builder
- TypeScript errors → check `LinearDocument` type fields against `DOCUMENT_FIELDS` static string; common issue is forgetting to add a new field to one but not the other
- `grep -c 'pi.registerTool' ... → < 37` → one or more document tools not registered; check `registerLinearTools` function in `linear-tools.ts`

## Requirements Proved By This UAT

- R103 — Rich artifacts stored as Linear Documents: integration tests prove that project-level and issue-level document writes are readable with byte-identical content, upsert is idempotent, scope isolation works, and non-existent documents return null (not an error). All 6 integration test cases pass against a real Linear workspace. R103 is validated.

## Not Proven By This UAT

- R104 (state derivation) — not in scope for S04; S05 will query Linear to derive active milestone/slice/task progress
- R101 (linear mode end-to-end) — documents can be stored but are not yet read back by any workflow entrypoint; S05 and S06 complete this
- Human-visible Linear UI confirmation — integration tests confirm API-level round-trips but do not verify that documents appear correctly formatted in the Linear web UI; this can be spot-checked manually by opening the Linear project and inspecting documents created during test runs (they are deleted by `after()`, so run with cleanup disabled if needed)
- Document delete as an agent tool — no `kata_delete_document` tool exists; documents persist until manually deleted or the raw `linear_delete_document` Linear client tool is used

## Notes for Tester

- The integration test `after()` deletes all documents created during the test run using `Promise.allSettled` — cleanup is tolerant of partial failures and logs any orphaned IDs
- If cleanup fails (e.g. test aborted mid-run), orphaned documents are identifiable by the `[S04-TEST]` prefix on the throwaway issue title created in `before()`
- `LINEAR_TEAM_ID` and `LINEAR_PROJECT_ID` env vars skip the first-team/first-project resolution step — set them for faster iteration against a specific workspace
- Linear normalizes `- ` bullets to `* ` on write — this is expected behavior, not a defect; the integration tests already account for it
