---
id: S04
parent: M002
milestone: M002
provides:
  - buildDocumentTitle / parseDocumentTitle — pure naming codec for all Linear document titles
  - DocumentAttachment discriminated union (projectId xor issueId) enforced at type level
  - LinearDocumentClient structural interface — mockable without importing LinearClient
  - writeKataDocument — upsert by title+scope (create if missing, update if found)
  - readKataDocument — returns LinearDocument or null (canonical "not written yet" signal)
  - listKataDocuments — zero-side-effect enumeration, no title filter
  - listDocuments extended with issueId and title filter opts (backward-compatible)
  - kata_write_document, kata_read_document, kata_list_documents tools registered in registerLinearTools
  - 59 passing unit tests (35 naming + 24 mock operations); 6 passing integration tests against real Linear API
  - R103 validated: markdown artifacts survive Linear API round-trip with full fidelity (modulo known normalization)
requires:
  - slice: S01
    provides: LinearClient.{createDocument, updateDocument, listDocuments, getDocument} — all document CRUD methods
  - slice: S03
    provides: Entity IDs (issue/project) for attachment targets in integration tests
affects:
  - S05
  - S06
key_files:
  - src/resources/extensions/linear/linear-types.ts
  - src/resources/extensions/linear/linear-client.ts
  - src/resources/extensions/linear/linear-documents.ts
  - src/resources/extensions/linear/linear-tools.ts
  - src/resources/extensions/linear/tests/document-naming.test.ts
  - src/resources/extensions/linear/tests/document-operations.test.ts
  - src/resources/extensions/linear/tests/document-storage.integration.test.ts
key_decisions:
  - DocumentAttachment = { projectId: string } | { issueId: string } discriminated union; spread into listDocuments + createDocument/updateDocument calls — union guarantees mutual exclusivity at compile time, no runtime check needed
  - Document upsert is title-scoped first-match: listDocuments({ title, ...attachment }) → update result[0].id if found, create if empty — mirrors ensureLabel pattern
  - Linear normalizes list syntax on write: `- ` bullets are stored as `* `; single trailing newlines are stripped — integration test content must use canonical form for byte-identical assertions
  - parseDocumentTitle: uppercase-digits-only prefix before first dash is the kataId (^[A-Z0-9]+$); lowercase or mixed-case prefixes yield kataId=null (treated as root-level artifact type)
  - LinearDocumentClient interface includes getDocument even though T02 functions don't use it directly — ensures LinearClient satisfies the interface structurally without an adapter
  - DocumentAttachment exported from linear-types.ts (not linear-documents.ts) — keeps type definitions co-located with other Input/Output types; linear-documents.ts re-exports it
  - "Exactly one of projectId or issueId" tool-level guard: const hasProject = params.projectId !== undefined; const hasIssue = params.issueId !== undefined; if (hasProject === hasIssue) → fail — guard fires before any API call; uniform across all 3 document tools
patterns_established:
  - buildDocumentTitle / parseDocumentTitle are the canonical encode/decode pair for all document title operations; never construct titles ad hoc
  - readKataDocument returning null is the primary "document not yet written" signal in auto-mode agents; non-null with empty content means written-but-empty (distinct from missing)
  - writeKataDocument returning a LinearDocument (with id + updatedAt) is the confirmation surface for upsert vs create
  - kata_list_documents is the zero-side-effect inspection surface — call with projectId or issueId to enumerate artifact documents; returned array length 0 = empty target, not API error
observability_surfaces:
  - kata_write_document returns full LinearDocument JSON including id, updatedAt — agent confirms upsert vs create by checking updatedAt vs createdAt
  - kata_read_document returns null JSON (not error) for missing document — agent checks for null before reading content
  - kata_list_documents(projectId) / kata_list_documents(issueId) — zero-side-effect enumeration of all artifacts on a target
  - LinearGraphQLError propagates unchanged from all three operation functions; classifyLinearError(err).kind → auth_error | rate_limited | network_error | graphql_error | not_found | unknown
drill_down_paths:
  - .kata/milestones/M002/slices/S04/tasks/T01-SUMMARY.md
  - .kata/milestones/M002/slices/S04/tasks/T02-SUMMARY.md
  - .kata/milestones/M002/slices/S04/tasks/T03-SUMMARY.md
  - .kata/milestones/M002/slices/S04/tasks/T04-SUMMARY.md
duration: ~1h (T01: 15m, T02: 20m, T03: 15m, T04: 15m)
verification_result: passed
completed_at: 2026-03-12
---

# S04: Document Storage — Artifacts as Linear Documents

**Full document storage layer shipped: naming codec, upsert/read/list operations, 3 registered agent tools, 59 unit tests + 6 integration tests all passing against a real Linear workspace — R103 validated.**

## What Happened

**T01** established the type foundation: updated `LinearDocument` with `project`/`issue` sub-objects (removing stale `projectId`), extended `DOCUMENT_FIELDS` in `LinearClient`, created `linear-documents.ts` with pure `buildDocumentTitle`/`parseDocumentTitle` naming functions and the `LinearDocumentClient` structural interface. 35 unit tests cover all naming convention rows, null kataId paths, and parse round-trips.

**T02** delivered the three core operations. `listDocuments` was extended with backward-compatible `issueId` and `title` filter opts (two filter builder lines, zero impact on existing callers). `writeKataDocument` implements title-scoped upsert: list by scope+title, update first match if found, create new if empty. `readKataDocument` returns the first matching document or null. `listKataDocuments` enumerates all documents on a target with no title filter. 24 mock unit tests across 5 describe blocks cover create/update branches, attachment isolation, null-on-miss, empty-content handling, and no-title-filter assertion.

**T03** proved real API round-trips. The integration test scaffolding follows `entity-hierarchy.integration.test.ts` exactly: skip guard on `LINEAR_API_KEY`, `before()` resolves team+project and creates a throwaway issue, `after()` cleans up all tracked IDs via `Promise.allSettled`. Two real API normalization behaviors were discovered and accommodated: Linear converts `- ` list syntax to `* ` on storage and strips a single trailing newline. Test content was updated to use the API's canonical form — byte-identical assertions hold after adaptation. 6/6 integration tests pass.

**T04** registered the three tools in `registerLinearTools`: `kata_write_document`, `kata_read_document`, `kata_list_documents`. Each enforces "exactly one of projectId or issueId" before constructing a `DocumentAttachment`. Total tool count is 37 (the slice plan's target of 31 was a stale estimate from before S03 added more tools than anticipated — not a regression).

## Verification

```
# Unit tests (naming) — 35/35 pass
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/document-naming.test.ts

# Unit tests (operations mock) — 24/24 pass
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/document-operations.test.ts

# Integration tests — 6/6 pass against real Linear API
LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/document-storage.integration.test.ts

# TypeScript — clean
npx tsc --noEmit

# Tool count
grep -c 'pi.registerTool' src/resources/extensions/linear/linear-tools.ts
# → 37
```

## Requirements Advanced

- R103 — Document storage layer implemented and integration-tested: roadmap, plan, and decision artifacts write/read correctly against the real Linear API with full markdown fidelity

## Requirements Validated

- R103 — Validated by integration test T03: project-level write+read, issue-level write+read, upsert idempotency (1 document, not 2), markdown fidelity (headers/code blocks/lists survive), list scoping (project docs don't appear in issue scope), and null-on-miss — all 6 cases pass against real Linear workspace

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

**Linear markdown normalization** — Linear normalizes `- ` bullet syntax to `* ` and strips trailing newlines on document write. This is real API behavior, not a defect. Integration test content was updated to use the API's canonical form; byte-identical assertions hold. This normalization will affect any S05/S06 content that parses document markdown — plan/summary parsers must handle `* ` bullets, not `- `.

**Tool count** — Slice plan predicted 31 tools after S04; actual is 37. Pre-S04 baseline was 34 (S03 added more tools than the plan anticipated). Adding 3 document tools yields 37. No functional impact.

**LinearDocumentClient includes getDocument** — T01 plan did not list `getDocument` in the interface, but it was added for structural compatibility with `LinearClient`. Purely additive; no downstream impact.

## Known Limitations

- Linear markdown normalization is one-way: `- ` bullets written by the agent are stored as `* ` by Linear. Any future parser that reads plans/summaries from Linear must expect `* ` list syntax, not `- `. No auto-conversion on write is implemented.
- Trailing newline stripping: content ending with `\n` is stored without it. Not a problem in practice (markdown content is meaningful without trailing newlines) but auto-mode agents should not rely on trailing newlines surviving a round-trip.
- No document delete operation is exposed as an agent tool — documents accumulate on a target until manually deleted in Linear's UI. This is acceptable for planning artifacts (they should persist) but callers cannot clean up test or draft documents programmatically without using the raw `linear_delete_document` tool.

## Follow-ups

- S05 plan/summary parsers must handle `* ` bullets (Linear canonical form) in addition to `- ` bullets
- S05 state derivation will consume `readKataDocument` to read roadmap and plan content from Linear; the `null` return is the "plan not yet written" signal for first-run detection
- S06 auto-mode will use `writeKataDocument` for writing summaries and `readKataDocument` for reading plans during task execution

## Files Created/Modified

- `src/resources/extensions/linear/linear-types.ts` — `LinearDocument` updated: `project`/`issue` sub-objects added, `projectId` removed; `DocumentAttachment` union added
- `src/resources/extensions/linear/linear-client.ts` — `DOCUMENT_FIELDS` extended with `project { id name }` and `issue { id identifier }`; `listDocuments` opts extended with `issueId` and `title` (backward-compatible)
- `src/resources/extensions/linear/linear-documents.ts` — new: `buildDocumentTitle`, `parseDocumentTitle`, `DocumentAttachment` re-export, `LinearDocumentClient` interface, `writeKataDocument`, `readKataDocument`, `listKataDocuments`
- `src/resources/extensions/linear/linear-tools.ts` — 3 new tools registered: `kata_write_document`, `kata_read_document`, `kata_list_documents`; re-exports added
- `src/resources/extensions/linear/tests/document-naming.test.ts` — new: 35 unit tests for naming functions and round-trips
- `src/resources/extensions/linear/tests/document-operations.test.ts` — new: 24 mock unit tests for write/read/list operations
- `src/resources/extensions/linear/tests/document-storage.integration.test.ts` — new: 6 integration test cases against real Linear API; R103 validated

## Forward Intelligence

### What the next slice should know

- `readKataDocument(client, title, attachment)` is the correct call for S05 to fetch roadmap/plan content; it returns `null` when the document hasn't been written yet (first-run signal), not an error
- `listKataDocuments(client, { projectId })` is the zero-cost way to enumerate all artifact documents on a milestone or project target — use this for the dashboard document inventory in S05
- The integration test `before()` creates a throwaway issue with `client.createIssue` for issue-level attachment tests; this same pattern is immediately usable in S05 integration tests for slice-level document reads
- `LINEAR_TEAM_ID` and `LINEAR_PROJECT_ID` env vars bypass the team/project resolution step in integration tests — set them for faster test iterations

### What's fragile

- Linear bullet normalization (`- ` → `* `) — S05/S06 plan/summary parsers that look for `- [ ]` checkbox syntax in roadmap content must also handle `* [ ]` syntax returned by the API; if parsers are strict about bullet style, they will silently miss all items
- "Title collision by user manual creation" — if a user creates a Linear document with the same title as a Kata artifact on the same target, `writeKataDocument` will overwrite it on the next upsert; this is the documented acceptable limitation of the title-scoped first-match strategy (D027)

### Authoritative diagnostics

- `kata_list_documents({ projectId })` — zero-side-effect source of truth for all documents on a project; returned array length and titles are the definitive state of what Kata has written
- `kata_read_document({ title, projectId })` returning `null` means the document doesn't exist — not an API error; check this before any parse attempt in S05/S06
- Integration test logs the Linear UUID of each created document — visible in test output; if a test fails mid-run, the last logged ID identifies the orphaned document for manual inspection

### What assumptions changed

- **Bullet syntax in Linear** — assumed markdown would survive byte-identical; actual behavior: `- ` bullets are normalized to `* ` on storage. Any downstream consumer of Linear document content must treat these as equivalent.
- **Tool count baseline** — assumed 28 pre-S04 tools (plan estimate); actual was 34 (S03 delivered more than estimated). Final count after S04 is 37.
