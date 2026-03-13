---
id: T01
parent: S04
milestone: M002
provides:
  - LinearDocument type with project/issue sub-objects and DocumentAttachment union
  - buildDocumentTitle and parseDocumentTitle pure naming functions
  - LinearDocumentClient structural interface
  - 35 passing unit tests covering all naming convention rows and edge cases
key_files:
  - src/resources/extensions/linear/linear-types.ts
  - src/resources/extensions/linear/linear-client.ts
  - src/resources/extensions/linear/linear-documents.ts
  - src/resources/extensions/linear/tests/document-naming.test.ts
key_decisions:
  - parseDocumentTitle uses all-uppercase-digits prefix rule to detect kataId (^[A-Z0-9]+$ before first dash); lowercase or symbol prefixes fall through to kataId=null
  - DocumentAttachment discriminated union exported from linear-types.ts (not linear-documents.ts) to keep types co-located with other Input types
  - LinearDocumentClient interface includes getDocument (matching LinearClient shape) even though T01 plan didn't explicitly list it — needed for complete LinearClient structural compatibility
patterns_established:
  - Document title codec: buildDocumentTitle(kataId, artifactType) / parseDocumentTitle(title) — use these as the canonical encode/decode pair for all document title operations
  - parseDocumentTitle returns null only for blank/empty input, never throws — callers check null to detect non-Kata document titles
observability_surfaces:
  - parseDocumentTitle(title) === null → document title does not follow Kata naming convention; safe to skip
duration: 15m
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T01: Types, naming functions, and LinearDocumentClient interface

**Established the type foundation for S04: updated `LinearDocument`, added `DocumentAttachment`, extended `DOCUMENT_FIELDS`, and created `linear-documents.ts` with pure naming functions and structural client interface — 35/35 unit tests pass, TypeScript clean.**

## What Happened

1. **`LinearDocument` updated** — added `project?: { id: string; name: string } | null` and `issue?: { id: string; identifier: string } | null`; removed stale `projectId?: string`. Added `DocumentAttachment = { projectId: string } | { issueId: string }` exported from `linear-types.ts`.

2. **`DOCUMENT_FIELDS` updated** — added `project { id name }` and `issue { id identifier }` after `color`; all four document CRUD methods pick up the new fields automatically since they all reference the static string.

3. **`linear-documents.ts` created** — exports `buildDocumentTitle`, `parseDocumentTitle`, `DocumentAttachment` (re-export), and `LinearDocumentClient` interface. The file has zero runtime imports — only type-level imports from `linear-types.ts`.

4. **`document-naming.test.ts` created** — 35 tests in 3 describe blocks: `buildDocumentTitle` (11 tests), `parseDocumentTitle` (12 tests), and round-trip (13 tests covering all naming convention rows from the research table). All pass without an API key.

One minor scope addition: `LinearDocumentClient` includes `getDocument` (not in the original plan list but needed for structural compatibility with `LinearClient` — T02 operations use `listDocuments` but the interface needs to match the real client shape). This is purely additive and has no downstream impact.

## Verification

```
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/document-naming.test.ts
```
→ 35 pass, 0 fail, 0 skip

```
npx tsc --noEmit
```
→ no output (clean)

All must-have spot checks also passed inline:
- `buildDocumentTitle(null, "DECISIONS")` → `"DECISIONS"` ✓
- `buildDocumentTitle("M001", "ROADMAP")` → `"M001-ROADMAP"` ✓
- `parseDocumentTitle("M001-ROADMAP")` → `{ kataId: "M001", artifactType: "ROADMAP" }` ✓
- `parseDocumentTitle("DECISIONS")` → `{ kataId: null, artifactType: "DECISIONS" }` ✓
- `parseDocumentTitle("")` → `null` ✓

## Diagnostics

`parseDocumentTitle(title)` is the canonical way to inspect any document title string:
- Returns `null` → blank/empty, skip
- Returns `{ kataId: null, artifactType }` → root-level artifact (DECISIONS, PROJECT)
- Returns `{ kataId, artifactType }` → scoped artifact; `kataId` identifies milestone/slice/task

## Deviations

`LinearDocumentClient` interface includes `getDocument(id: string): Promise<LinearDocument | null>` in addition to the four methods listed in the task plan. This makes `LinearClient` structurally satisfy the interface without adapter code.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/linear/linear-types.ts` — `LinearDocument` updated with `project`/`issue` sub-objects; `projectId` removed; `DocumentAttachment` union added
- `src/resources/extensions/linear/linear-client.ts` — `DOCUMENT_FIELDS` extended with `project { id name }` and `issue { id identifier }`
- `src/resources/extensions/linear/linear-documents.ts` — new file: `buildDocumentTitle`, `parseDocumentTitle`, `DocumentAttachment` re-export, `LinearDocumentClient` interface
- `src/resources/extensions/linear/tests/document-naming.test.ts` — new file: 35 unit tests
