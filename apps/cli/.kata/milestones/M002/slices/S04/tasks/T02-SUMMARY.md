---
id: T02
parent: S04
milestone: M002
provides:
  - writeKataDocument (upsert by title — update if exists, create if not)
  - readKataDocument (returns LinearDocument or null — canonical "not yet written" signal)
  - listKataDocuments (enumerate all docs on a project or issue, no title filter)
  - listDocuments extended with issueId and title filter opts in LinearClient
key_files:
  - src/resources/extensions/linear/linear-client.ts
  - src/resources/extensions/linear/linear-documents.ts
  - src/resources/extensions/linear/tests/document-operations.test.ts
key_decisions:
  - listDocuments filter builder follows existing pattern — only add filter key when opt is present, never send empty filter objects
  - writeKataDocument spreads DocumentAttachment into both listDocuments and createDocument calls — spread is safe because the union type guarantees mutual exclusivity (projectId xor issueId)
  - readKataDocument treats content="" as valid document (not null/not-found) — callers distinguish "empty document" from "no document" by checking the return value itself
patterns_established:
  - "writeKataDocument is the canonical upsert: call listDocuments({ title, ...attachment }) → if result[0] exists call updateDocument(result[0].id, { content }) → else call createDocument({ title, content, ...attachment })"
  - "readKataDocument returning null is the canonical 'document not written yet' signal; non-null with empty content means 'written but empty'"
  - "listKataDocuments passes no title filter — use it for full enumeration; call readKataDocument or writeKataDocument for title-scoped access"
observability_surfaces:
  - "writeKataDocument returns full LinearDocument including id and updatedAt — log result.id to confirm Linear UUID for later getDocument access"
  - "readKataDocument returning null is the primary signal for 'document does not exist yet' in auto-mode agents"
  - "LinearGraphQLError propagates unchanged from all three functions — classifyLinearError maps kind for callers"
duration: ~20min
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T02: Extend LinearClient.listDocuments and implement core document operations

**Extended `listDocuments` with `issueId`/`title` filters and shipped the three core document operation functions (`writeKataDocument`, `readKataDocument`, `listKataDocuments`) with 24 mock unit tests — all passing, TypeScript clean.**

## What Happened

**Step 1 — `listDocuments` extension:** Added `issueId?: string` and `title?: string` to the opts type in `LinearClient.listDocuments`. Added two filter builder lines inside the existing paginate closure:
```typescript
if (opts?.issueId) filter.issue = { id: { eq: opts.issueId } };
if (opts?.title)   filter.title = { eq: opts.title };
```
All existing callers pass only `projectId` or nothing — zero impact.

**Step 2 — `writeKataDocument`:** Upsert by title. Calls `client.listDocuments({ title, ...attachment })`. If the result has at least one document, calls `client.updateDocument(result[0].id, { content })` and returns the updated document. If result is empty, calls `client.createDocument({ title, content, ...attachment })` and returns the created document. The `DocumentAttachment` discriminated union guarantees only one of `projectId`/`issueId` is present in the spread, so `createDocument` can never receive both.

**Step 3 — `readKataDocument`:** Single lookup. Calls `client.listDocuments({ title, ...attachment })` and returns `result[0] ?? null`. Documents with empty content are valid and returned (not null) — the caller receives `null` only when no document exists at all.

**Step 4 — `listKataDocuments`:** Pass-through with no title filter. Calls `client.listDocuments({ ...attachment })` and returns the full result array.

**Step 5 — `document-operations.test.ts`:** 24 tests across 5 describe blocks using a `makeMockDocumentClient` closure-based spy factory. Tests cover create/update branches, attachment isolation, empty-content behavior, null-on-miss, no-title-filter assertion for `listKataDocuments`, and both `projectId`/`issueId` attachment variants for all three operations.

## Verification

```
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/document-operations.test.ts
# → 24 pass, 0 fail

node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/document-naming.test.ts
# → 35 pass, 0 fail (regression)

npx tsc --noEmit
# → clean (no output)
```

## Diagnostics

- Call `writeKataDocument` and inspect the returned `LinearDocument.id` — this is the Linear UUID for direct `getDocument` access.
- `readKataDocument` returning `null` means no document with that title exists in the attachment target. Non-null return with empty content means the document was created but not yet written with content.
- `LinearGraphQLError` propagates from all three functions unchanged. Use `classifyLinearError(err).kind` to distinguish `auth_error | rate_limited | network_error | graphql_error | not_found | unknown`.

## Deviations

None. Implementation followed the task plan exactly.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/linear/linear-client.ts` — `listDocuments` opts extended with `issueId` and `title`; two filter builder lines added
- `src/resources/extensions/linear/linear-documents.ts` — `writeKataDocument`, `readKataDocument`, `listKataDocuments` added with full JSDoc observability comments
- `src/resources/extensions/linear/tests/document-operations.test.ts` — new file: 24 mock unit tests across 5 describe blocks
