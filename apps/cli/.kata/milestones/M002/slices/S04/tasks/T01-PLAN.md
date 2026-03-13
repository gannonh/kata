---
estimated_steps: 4
estimated_files: 4
---

# T01: Types, naming functions, and LinearDocumentClient interface

**Slice:** S04 — Document Storage — Artifacts as Linear Documents
**Milestone:** M002

## Description

Establish the type foundation for S04. Update `LinearDocument` to carry `project` and `issue` sub-objects (replacing the stale `projectId?: string` top-level field). Update `DOCUMENT_FIELDS` in `LinearClient` to query these new sub-objects. Create `linear-documents.ts` with pure naming functions (`buildDocumentTitle`, `parseDocumentTitle`), a `DocumentAttachment` discriminated union type, and the `LinearDocumentClient` structural interface. Write ~20 unit tests for the naming functions — all passing without an API key.

## Steps

1. **Update `LinearDocument` in `linear-types.ts`**: Add `project?: { id: string; name: string } | null` and `issue?: { id: string; identifier: string } | null`. Remove the stale `projectId?: string` top-level field. Add `DocumentAttachment = { projectId: string } | { issueId: string }` as an exported type.

2. **Update `DOCUMENT_FIELDS` in `LinearClient`**: Change the static `DOCUMENT_FIELDS` string to include `project { id name }` and `issue { id identifier }` after the existing `color` field. All `createDocument`, `getDocument`, `updateDocument`, and `listDocuments` queries that use `DOCUMENT_FIELDS` will pick up the new fields automatically.

3. **Create `linear-documents.ts`**: Implement:
   - `buildDocumentTitle(kataId: string | null, artifactType: string): string` — returns `"${kataId}-${artifactType}"` when `kataId` is non-null, otherwise returns `artifactType` alone (e.g. `"DECISIONS"`)
   - `parseDocumentTitle(title: string): { kataId: string | null; artifactType: string } | null` — parses dash-separated format; returns `{ kataId: null, artifactType: title }` for root-level titles (no dash or no uppercase prefix before the dash); returns `null` only if the title is empty/blank
   - `LinearDocumentClient` structural interface: `{ createDocument(input: DocumentCreateInput): Promise<LinearDocument>; updateDocument(id: string, input: DocumentUpdateInput): Promise<LinearDocument>; listDocuments(opts?: { projectId?: string; issueId?: string; title?: string; first?: number }): Promise<LinearDocument[]>; }` — mirrors `LinearEntityClient` pattern from S03; enables mocks without importing `LinearClient`

4. **Write `document-naming.test.ts`** with ~20 unit tests in 4 describe blocks:
   - `buildDocumentTitle`: milestone artifacts (`M001-ROADMAP`), slice artifacts (`S01-PLAN`), task artifacts (`T01-SUMMARY`), root-level artifact with null kataId (`DECISIONS`, `PROJECT`), uppercase kataId variants
   - `parseDocumentTitle`: round-trips for milestone/slice/task titles; root-level title (kataId is null, artifactType is the whole string); title with internal dash (e.g. `KATA-WORKFLOW` → kataId `KATA`, artifactType `WORKFLOW`); empty string → null; whitespace-only → null
   - `buildDocumentTitle + parseDocumentTitle round-trip`: all naming convention rows from the research table; each title built then parsed must recover original inputs

## Must-Haves

- [ ] `LinearDocument.project` and `LinearDocument.issue` sub-objects added; `projectId?: string` removed
- [ ] `DocumentAttachment` discriminated union exported from `linear-types.ts`
- [ ] `DOCUMENT_FIELDS` queries `project { id name }` and `issue { id identifier }`
- [ ] `buildDocumentTitle(null, "DECISIONS")` → `"DECISIONS"`
- [ ] `buildDocumentTitle("M001", "ROADMAP")` → `"M001-ROADMAP"`
- [ ] `parseDocumentTitle("M001-ROADMAP")` → `{ kataId: "M001", artifactType: "ROADMAP" }`
- [ ] `parseDocumentTitle("DECISIONS")` → `{ kataId: null, artifactType: "DECISIONS" }`
- [ ] `parseDocumentTitle("")` → `null`
- [ ] `LinearDocumentClient` interface exported from `linear-documents.ts`
- [ ] All ~20 naming unit tests pass without API key
- [ ] `npx tsc --noEmit` clean

## Verification

- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/linear/tests/document-naming.test.ts` → all tests pass, 0 failures
- `npx tsc --noEmit` → no output (clean)

## Observability Impact

- Signals added/changed: None — pure type/function layer; no runtime effects
- How a future agent inspects this: `buildDocumentTitle` and `parseDocumentTitle` are the canonical document title codec; call them to verify naming convention compliance for any document title string
- Failure state exposed: `parseDocumentTitle` returns `null` for invalid/empty inputs (never throws) — a future agent can use the null return as a signal that a document title from Linear does not follow Kata's naming convention

## Inputs

- `src/resources/extensions/linear/linear-types.ts` — existing `LinearDocument` interface to extend; existing `DocumentCreateInput` and `DocumentUpdateInput` types needed for `LinearDocumentClient` interface
- `src/resources/extensions/linear/linear-client.ts` — `DOCUMENT_FIELDS` static string to extend
- `src/resources/extensions/linear/tests/entity-mapping.test.ts` — reference for test file structure (describe/it pattern, resolve-ts.mjs import)
- S04-RESEARCH.md naming convention table — defines all artifact types and their attachment levels

## Expected Output

- `src/resources/extensions/linear/linear-types.ts` — `LinearDocument` updated, `DocumentAttachment` added
- `src/resources/extensions/linear/linear-client.ts` — `DOCUMENT_FIELDS` updated
- `src/resources/extensions/linear/linear-documents.ts` — new file: `buildDocumentTitle`, `parseDocumentTitle`, `DocumentAttachment`, `LinearDocumentClient`
- `src/resources/extensions/linear/tests/document-naming.test.ts` — new file: ~20 passing unit tests
