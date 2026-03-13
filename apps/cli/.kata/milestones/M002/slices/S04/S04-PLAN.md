# S04: Document Storage — Artifacts as Linear Documents

**Goal:** Agent can create and update Kata planning artifacts (roadmaps, plans, summaries, decisions) as Linear Documents attached to the correct project or issue, and read them back with full markdown fidelity.
**Demo:** Integration test writes `M001-ROADMAP` with multi-section markdown to a project, writes `S01-PLAN` to a slice issue, reads both back, asserts content is byte-identical, confirms upsert creates exactly one document (not two), and verifies `listKataDocuments` scoping returns only the documents belonging to each attachment target. All 6 integration test cases pass against a real Linear workspace.

## Must-Haves

- `LinearDocument` type updated with `project?: { id: string; name: string } | null` and `issue?: { id: string; identifier: string } | null`; stale `projectId?: string` top-level field removed
- `DOCUMENT_FIELDS` in `LinearClient` queries `project { id name }` and `issue { id identifier }`
- `buildDocumentTitle(kataId: string | null, artifactType: string): string` — `"M001-ROADMAP"`, `"S01-PLAN"`, `"DECISIONS"` etc.
- `parseDocumentTitle(title: string)` — returns `{ kataId, artifactType }` or `null`
- `LinearDocumentClient` structural interface: `{ createDocument, getDocument, updateDocument, listDocuments }`
- `LinearClient.listDocuments` extended with `issueId?: string` and `title?: string` opts (backward-compatible; 3-line change)
- `writeKataDocument(client, title, content, attachment)` — upsert: find by title+scope → update if found, create if not
- `readKataDocument(client, title, attachment)` — returns first matching `LinearDocument` or `null`
- `listKataDocuments(client, attachment)` — returns all documents for the given attachment target
- `attachment` parameter is a discriminated union `{ projectId: string } | { issueId: string }` — prevents setting both fields
- 3 new pi tools: `kata_write_document`, `kata_read_document`, `kata_list_documents` (total: 31 tools after S04)
- ~20 unit tests for naming functions pass without API key
- ~15 mock unit tests for document operations pass without API key
- 6 integration test cases pass against real Linear API with `LINEAR_API_KEY`

## Proof Level

- This slice proves: integration
- Real runtime required: yes (T03 integration tests require `LINEAR_API_KEY`)
- Human/UAT required: no

## Verification

- Unit tests (naming): `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/linear/tests/document-naming.test.ts`
- Unit tests (operations mock): `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/linear/tests/document-operations.test.ts`
- Integration tests: `LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/linear/tests/document-storage.integration.test.ts`
- TypeScript: `npx tsc --noEmit` (clean)
- Tool count: `grep -c 'pi.registerTool' src/resources/extensions/linear/linear-tools.ts` → 31

## Observability / Diagnostics

- Runtime signals: `writeKataDocument` returns the full `LinearDocument` (including Linear UUID) on every write — callers can confirm the ID and check `updatedAt` to verify upsert vs create; `readKataDocument` returns `null` on miss (not an error) — the primary signal for "document does not exist yet"
- Inspection surfaces: `kata_list_documents` tool is a zero-side-effect inspection surface — call with `projectId` or `issueId` to enumerate all documents on a target; returned array length of 0 = empty target, not API error
- Failure visibility: `LinearGraphQLError` propagates from all operations with mutation/query name in message; `classifyLinearError` maps it to `auth_error | rate_limited | network_error | graphql_error | not_found | unknown` — same taxonomy as S01
- Redaction constraints: document content may contain Kata planning text — no secrets; no redaction needed

## Integration Closure

- Upstream surfaces consumed: `LinearClient.{createDocument, updateDocument, listDocuments, getDocument}` from S01; issue/project IDs from S03 entity creation functions
- New wiring introduced in this slice: `linear-documents.ts` module + 3 tools registered in `registerLinearTools`; `LinearDocumentClient` interface importable from `linear-documents.ts`
- What remains before the milestone is truly usable end-to-end: S05 (state derivation reads plans/summaries from Linear documents), S06 (auto-mode writes summaries and reads plans via these document functions)

## Tasks

- [x] **T01: Types, naming functions, and LinearDocumentClient interface** `est:30m`
  - Why: Establishes the type foundation and pure naming layer that all document operations depend on; unit tests verify the naming convention end-to-end without any API calls
  - Files: `src/resources/extensions/linear/linear-types.ts`, `src/resources/extensions/linear/linear-documents.ts` (new), `src/resources/extensions/linear/linear-client.ts`, `src/resources/extensions/linear/tests/document-naming.test.ts` (new)
  - Do: (1) Update `LinearDocument` interface — add `project?: { id: string; name: string } | null` and `issue?: { id: string; identifier: string } | null`, remove `projectId?: string`. (2) Update `DOCUMENT_FIELDS` static field in `LinearClient` to include `project { id name }` and `issue { id identifier }`. (3) Create `linear-documents.ts` with `buildDocumentTitle`, `parseDocumentTitle`, `DocumentAttachment` discriminated union type, and `LinearDocumentClient` interface — no API calls, no imports beyond types. (4) Write `document-naming.test.ts` with ~20 unit tests covering all title formats, null kataId, parse round-trips, and non-matching inputs.
  - Verify: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/linear/tests/document-naming.test.ts` → all pass; `npx tsc --noEmit` → clean
  - Done when: All naming unit tests pass; TypeScript is clean; `linear-documents.ts` exports `buildDocumentTitle`, `parseDocumentTitle`, `DocumentAttachment`, `LinearDocumentClient`

- [x] **T02: Extend LinearClient.listDocuments and implement core document operations** `est:45m`
  - Why: Delivers the actual write/read/list functions that S05 and S06 will call; the `issueId` + `title` filter extension on `listDocuments` is the prerequisite for the upsert pattern
  - Files: `src/resources/extensions/linear/linear-client.ts`, `src/resources/extensions/linear/linear-documents.ts`, `src/resources/extensions/linear/tests/document-operations.test.ts` (new)
  - Do: (1) Extend `listDocuments` opts type with `issueId?: string` and `title?: string`; add two filter lines in the filter builder — `if (opts?.issueId) filter.issue = { id: { eq: opts.issueId } };` and `if (opts?.title) filter.title = { eq: opts.title };` (backward-compatible). (2) Implement `writeKataDocument(client, title, content, attachment)` — calls `listDocuments` scoped to attachment + title, updates first match if found, creates new if empty; returns the `LinearDocument`. (3) Implement `readKataDocument(client, title, attachment)` — calls `listDocuments` scoped to attachment + title, returns first match or `null`. (4) Implement `listKataDocuments(client, attachment)` — calls `listDocuments` scoped to attachment only. (5) Write `document-operations.test.ts` using a `makeMockDocumentClient` spy helper following the S03 `makeMockClient` pattern; ~15 tests covering upsert (create branch), upsert (update branch), read found, read not-found, list scoping, projectId vs issueId attachment routing.
  - Verify: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/linear/tests/document-operations.test.ts` → all pass; `npx tsc --noEmit` → clean
  - Done when: Both unit test files pass; `linear-documents.ts` exports `writeKataDocument`, `readKataDocument`, `listKataDocuments`; `listDocuments` signature is backward-compatible

- [x] **T03: Integration tests for document round-trips** `est:30m`
  - Why: Proves the real Linear API accepts writes and returns byte-identical content including markdown formatting — and verifies the `issueId` filter behavior that is the only unproven part of this slice
  - Files: `src/resources/extensions/linear/tests/document-storage.integration.test.ts` (new)
  - Do: Follow the `entity-hierarchy.integration.test.ts` template exactly: `describe` with `skip` guard on `LINEAR_API_KEY`, `before()` resolves team+project, `after()` deletes all tracked document IDs. Write 6 test cases: (1) project-level write + read — verify content round-trip for `M001-ROADMAP` with headers/code blocks/lists; (2) issue-level write + read — attach `S01-PLAN` to a real issue created in `before()`; (3) upsert idempotency — write same title twice with different content; `listKataDocuments` returns 1, not 2; `readKataDocument` returns the second content; (4) markdown fidelity — content with `##` heading, `\`\`\`` code block, `- ` list, `**bold**` survives unmodified; (5) `listKataDocuments` scoping — project docs don't appear in issue scope and vice versa; (6) `readKataDocument` returns `null` for a title that was never written. Create a throwaway issue in `before()` using `client.createIssue` for issue-level tests; track its ID for cleanup.
  - Verify: `LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/linear/tests/document-storage.integration.test.ts` → 6/6 pass
  - Done when: All 6 integration test cases pass against a real Linear workspace; workspace is clean after `after()` runs; R103 is validated

- [x] **T04: Register tools and smoke check** `est:20m`
  - Why: Exposes the document operations as agent-callable tools, completing the S04 deliverable; re-exports maintain the smoke-check pattern from S03
  - Files: `src/resources/extensions/linear/linear-tools.ts`
  - Do: (1) Import `writeKataDocument`, `readKataDocument`, `listKataDocuments` from `linear-documents.ts`. (2) Re-export under `kata_*` aliases alongside the existing S03 re-exports. (3) Register `kata_write_document` (params: `title: string`, `content: string`, `projectId?: string`, `issueId?: string`; exactly one of projectId/issueId required; tool handler validates and calls `writeKataDocument`). (4) Register `kata_read_document` (params: `title`, `projectId?`, `issueId?`). (5) Register `kata_list_documents` (params: `projectId?`, `issueId?`). Total tools after registration: 31. (6) Smoke check: confirm `kata_write_document`, `kata_read_document`, `kata_list_documents` appear in module exports; TypeScript clean.
  - Verify: `grep -c 'pi.registerTool' src/resources/extensions/linear/linear-tools.ts` → 31; `npx tsc --noEmit` → clean; `node -e "import('./src/resources/extensions/linear/linear-tools.ts').then(m => { ['kata_write_document','kata_read_document','kata_list_documents'].forEach(n => { if (!m[n]) throw new Error('missing: '+n); }); console.log('ok'); })"` — but since this requires ESM resolution use the resolve-ts.mjs approach or just check TS exports
  - Done when: 31 `pi.registerTool` calls in `linear-tools.ts`; `kata_write_document`, `kata_read_document`, `kata_list_documents` re-exported; TypeScript clean

## Files Likely Touched

- `src/resources/extensions/linear/linear-types.ts` — update `LinearDocument`, add `DocumentAttachment`
- `src/resources/extensions/linear/linear-client.ts` — update `DOCUMENT_FIELDS`, extend `listDocuments` opts
- `src/resources/extensions/linear/linear-documents.ts` — new module
- `src/resources/extensions/linear/linear-tools.ts` — 3 new tools + re-exports
- `src/resources/extensions/linear/tests/document-naming.test.ts` — new
- `src/resources/extensions/linear/tests/document-operations.test.ts` — new
- `src/resources/extensions/linear/tests/document-storage.integration.test.ts` — new
