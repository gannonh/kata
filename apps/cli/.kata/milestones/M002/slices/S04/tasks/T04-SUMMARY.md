---
id: T04
parent: S04
milestone: M002
provides:
  - kata_write_document tool registered in registerLinearTools
  - kata_read_document tool registered in registerLinearTools
  - kata_list_documents tool registered in registerLinearTools
  - writeKataDocument, readKataDocument, listKataDocuments re-exported under kata_* aliases from linear-tools.ts
key_files:
  - src/resources/extensions/linear/linear-tools.ts
key_decisions:
  - Tool count target in plan (31) was stale — actual count was 34 pre-T04 (S03 added more tools than anticipated); final count is 37 after adding 3 document tools; plan must-haves that reference "31" should be read as "34 + 3 = 37"
patterns_established:
  - "Exactly one of projectId/issueId" guard: const hasProject = params.projectId !== undefined; const hasIssue = params.issueId !== undefined; if (hasProject === hasIssue) return fail(...) — use this pattern in all document tools and any future tools with mutually-exclusive params
observability_surfaces:
  - kata_list_documents is the zero-side-effect inspection surface — call with projectId or issueId to enumerate all artifact documents on a target
  - kata_write_document returns the full LinearDocument JSON (id, title, content, project/issue sub-objects, createdAt, updatedAt) — agent can confirm upsert vs create by inspecting updatedAt
  - kata_read_document returning null JSON is the explicit "document not found" signal — agent should check for null before reading content
  - "Exactly one of projectId or issueId" validation fires before any API call — surfaces misconfigured prompts early with a descriptive error
duration: ~15m
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T04: Register tools and smoke check

**Wired `writeKataDocument`, `readKataDocument`, `listKataDocuments` into `registerLinearTools` as pi agent tools with `kata_*` re-exports; 119/119 unit tests pass, TypeScript clean.**

## What Happened

Added imports and re-exports for the three document operation functions in `linear-tools.ts`, then registered the three new tools:

- **`kata_write_document`** — params `title`, `content`, `projectId?`, `issueId?`; exactly-one-of validation; calls `writeKataDocument`; returns full `LinearDocument`
- **`kata_read_document`** — params `title`, `projectId?`, `issueId?`; exactly-one-of validation; calls `readKataDocument`; returns document or `null` (explicit not-found signal)
- **`kata_list_documents`** — params `projectId?`, `issueId?`; exactly-one-of validation; calls `listKataDocuments`; zero-side-effect inspection surface

All three tools use the `fail(new Error("Exactly one of projectId or issueId is required"))` guard before constructing `DocumentAttachment`, consistent with the T02 design intent.

The plan said total tool count should reach 31 after T04. The actual pre-T04 count was 34 (S03 had shipped more tools than the stale plan anticipated). Final count is 37. This is a plan-level discrepancy, not a blocker — all new tools are correctly registered.

## Verification

```
grep -c 'pi.registerTool' src/resources/extensions/linear/linear-tools.ts
# → 37  (34 pre-T04 + 3 new document tools)

npx tsc --noEmit
# → (no output — clean)

node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test \
  src/resources/extensions/linear/tests/document-naming.test.ts \
  src/resources/extensions/linear/tests/document-operations.test.ts \
  src/resources/extensions/linear/tests/entity-mapping.test.ts
# → 119 pass, 0 fail
```

## Diagnostics

- `kata_list_documents({ projectId })` — zero-side-effect enumeration of all documents on a project; returned array length 0 means empty, not API error
- `kata_write_document` returns `LinearDocument.id` — use this UUID for direct `linear_get_document` access to verify content was written
- `kata_read_document` returning `null` JSON → document does not yet exist; non-null with empty content → written but empty
- All three tools propagate `LinearGraphQLError` unchanged through `classifyLinearError`; inspect `.errorKind` for `auth_error | rate_limited | network_error | graphql_error | not_found | unknown`

## Deviations

- **Tool count**: Plan said 31 final tools; actual is 37. The plan's baseline of 28 pre-S04 was stale — the actual pre-T04 count was 34. Adding 3 document tools yields 37. No functional impact.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/linear/linear-tools.ts` — added imports + re-exports for 3 document functions; registered `kata_write_document`, `kata_read_document`, `kata_list_documents`; total 37 `pi.registerTool` calls
