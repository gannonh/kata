---
estimated_steps: 5
estimated_files: 3
---

# T02: Extend LinearClient.listDocuments and implement core document operations

**Slice:** S04 — Document Storage — Artifacts as Linear Documents
**Milestone:** M002

## Description

Deliver the three core document operation functions (`writeKataDocument`, `readKataDocument`, `listKataDocuments`) in `linear-documents.ts`. These depend on a 3-line extension to `LinearClient.listDocuments` that adds `issueId` and `title` filter opts — the prerequisite for the title-scoped upsert pattern. Write ~15 unit tests using a lightweight `makeMockDocumentClient` spy that follows the S03 `makeMockClient` pattern. No API key required.

## Steps

1. **Extend `listDocuments` in `linear-client.ts`**: Add `issueId?: string` and `title?: string` to the `opts` parameter type. In the filter builder, add two lines:
   ```typescript
   if (opts?.issueId) filter.issue = { id: { eq: opts.issueId } };
   if (opts?.title)   filter.title = { eq: opts.title };
   ```
   This is backward-compatible — all existing callers pass only `projectId` or nothing.

2. **Implement `writeKataDocument`** in `linear-documents.ts`:
   ```typescript
   async function writeKataDocument(
     client: LinearDocumentClient,
     title: string,
     content: string,
     attachment: DocumentAttachment,
   ): Promise<LinearDocument>
   ```
   Logic: (1) call `client.listDocuments({ title, ...attachment })` — pass `projectId` or `issueId` from attachment, plus `title`; (2) if result has at least one document, call `client.updateDocument(result[0].id, { content })` and return the updated document; (3) if result is empty, call `client.createDocument({ title, content, ...attachment })` and return the created document. Never set both `projectId` and `issueId` on the create call — the `DocumentAttachment` union guarantees mutual exclusivity.

3. **Implement `readKataDocument`** in `linear-documents.ts`:
   ```typescript
   async function readKataDocument(
     client: LinearDocumentClient,
     title: string,
     attachment: DocumentAttachment,
   ): Promise<LinearDocument | null>
   ```
   Logic: call `client.listDocuments({ title, ...attachment })`; return `result[0] ?? null`. Treat `content: ""` or `content: undefined` as valid (empty document) rather than null/not-found.

4. **Implement `listKataDocuments`** in `linear-documents.ts`:
   ```typescript
   async function listKataDocuments(
     client: LinearDocumentClient,
     attachment: DocumentAttachment,
   ): Promise<LinearDocument[]>
   ```
   Logic: call `client.listDocuments({ ...attachment })`; return result array.

5. **Write `document-operations.test.ts`** with ~15 mock-based unit tests. Define a `makeMockDocumentClient` helper that returns spy functions with configurable return values (following S03's `makeMockClient` pattern — no `sinon` dependency, just closure-based spies). Test cases:
   - `writeKataDocument` — create branch: `listDocuments` returns `[]` → `createDocument` is called with correct title/content/projectId; returns created document
   - `writeKataDocument` — update branch: `listDocuments` returns `[existingDoc]` → `updateDocument` is called with existing doc's id and new content; `createDocument` is NOT called
   - `writeKataDocument` — projectId isolation: attachment `{ projectId }` passes `projectId` to listDocuments, not `issueId`
   - `writeKataDocument` — issueId isolation: attachment `{ issueId }` passes `issueId` to listDocuments, not `projectId`
   - `readKataDocument` — found: `listDocuments` returns `[doc]` → returns `doc`
   - `readKataDocument` — not found: `listDocuments` returns `[]` → returns `null`
   - `readKataDocument` — empty content: `listDocuments` returns `[docWithEmptyContent]` → returns the document (not null)
   - `listKataDocuments` — project: `listDocuments` called with `{ projectId }` (no title); returns full array
   - `listKataDocuments` — issue: `listDocuments` called with `{ issueId }` (no title); returns full array
   - `listKataDocuments` — empty: returns `[]` when `listDocuments` returns `[]`

## Must-Haves

- [ ] `listDocuments` opts extended with `issueId?: string` and `title?: string`; existing callers unaffected
- [ ] GraphQL filter builder correctly sets `filter.issue = { id: { eq: opts.issueId } }` when `issueId` provided
- [ ] GraphQL filter builder correctly sets `filter.title = { eq: opts.title }` when `title` provided
- [ ] `writeKataDocument` calls `updateDocument` when a matching document exists (not `createDocument`)
- [ ] `writeKataDocument` calls `createDocument` when no document exists (not `updateDocument`)
- [ ] `writeKataDocument` never sets both `projectId` and `issueId` on the create call
- [ ] `readKataDocument` returns `null` (not throws) when no document found
- [ ] `readKataDocument` treats empty-content documents as valid (returns them, not null)
- [ ] `listKataDocuments` does not pass a `title` filter to `listDocuments`
- [ ] All ~15 mock unit tests pass without API key
- [ ] `npx tsc --noEmit` clean

## Verification

- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/linear/tests/document-operations.test.ts` → all tests pass, 0 failures
- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/linear/tests/document-naming.test.ts` → still passes (regression check)
- `npx tsc --noEmit` → clean

## Observability Impact

- Signals added/changed: `writeKataDocument` returns the full `LinearDocument` including `id` and `updatedAt` — callers can log or surface the UUID for later direct `getDocument` access; `readKataDocument` returning `null` is the canonical "document not written yet" signal for auto-mode agents
- How a future agent inspects this: call `kata_list_documents` (registered in T04) to enumerate all documents on a target; call `kata_read_document` to check existence by title
- Failure state exposed: `LinearGraphQLError` propagates unchanged from `writeKataDocument` and `readKataDocument` when the API fails; `classifyLinearError` maps the kind so callers can distinguish transient network errors from auth failures

## Inputs

- `src/resources/extensions/linear/linear-documents.ts` — `buildDocumentTitle`, `parseDocumentTitle`, `DocumentAttachment`, `LinearDocumentClient` from T01
- `src/resources/extensions/linear/linear-types.ts` — `LinearDocument`, `DocumentCreateInput`, `DocumentUpdateInput`
- `src/resources/extensions/linear/linear-client.ts` — `listDocuments` method to extend
- `src/resources/extensions/linear/tests/entity-mapping.test.ts` — `makeMockClient` spy pattern reference for `makeMockDocumentClient`

## Expected Output

- `src/resources/extensions/linear/linear-client.ts` — `listDocuments` opts extended (3-line change)
- `src/resources/extensions/linear/linear-documents.ts` — `writeKataDocument`, `readKataDocument`, `listKataDocuments` added
- `src/resources/extensions/linear/tests/document-operations.test.ts` — new file: ~15 passing mock unit tests
