---
estimated_steps: 3
estimated_files: 1
---

# T04: Register tools and smoke check

**Slice:** S04 — Document Storage — Artifacts as Linear Documents
**Milestone:** M002

## Description

Wire the three document operation functions into `registerLinearTools` as pi agent tools. Re-export them under `kata_*` aliases for smoke-check parity with S03. Total tool count after this task: 31. TypeScript must remain clean.

## Steps

1. **Import and re-export in `linear-tools.ts`**: Add `writeKataDocument`, `readKataDocument`, `listKataDocuments` to the import from `linear-documents.ts`. Re-export under `kata_*` aliases alongside the existing S03 re-exports:
   ```typescript
   export {
     writeKataDocument as kata_write_document,
     readKataDocument as kata_read_document,
     listKataDocuments as kata_list_documents,
   };
   ```

2. **Register the 3 tools** in `registerLinearTools`, after the existing `kata_list_tasks` registration. For each tool, follow the existing `ok(data) / fail(err) / run(fn)` pattern. Tool parameter schemas and handler logic:

   - `kata_write_document`: params `{ title: Type.String(), content: Type.String(), projectId: Type.Optional(Type.String()), issueId: Type.Optional(Type.String()) }`. Handler: validate that exactly one of `projectId`/`issueId` is provided; if neither or both, return `fail(new Error("Exactly one of projectId or issueId is required"))`. Construct `attachment` as `{ projectId }` or `{ issueId }`. Call `writeKataDocument(client, title, content, attachment)`.

   - `kata_read_document`: params `{ title: Type.String(), projectId: Type.Optional(Type.String()), issueId: Type.Optional(Type.String()) }`. Handler: same one-of validation; call `readKataDocument(client, title, attachment)`; return `ok(result)` (result may be `null` — that is a valid success response).

   - `kata_list_documents`: params `{ projectId: Type.Optional(Type.String()), issueId: Type.Optional(Type.String()) }`. Handler: same one-of validation; call `listKataDocuments(client, attachment)`.

3. **Smoke check**: Verify tool count and re-exports are correct:
   ```bash
   grep -c 'pi.registerTool' src/resources/extensions/linear/linear-tools.ts
   # → 31
   npx tsc --noEmit
   # → (clean)
   ```

## Must-Haves

- [ ] `writeKataDocument`, `readKataDocument`, `listKataDocuments` imported from `linear-documents.ts`
- [ ] Re-exported as `kata_write_document`, `kata_read_document`, `kata_list_documents`
- [ ] `kata_write_document` tool registered with `title`, `content`, `projectId?`, `issueId?` params
- [ ] `kata_read_document` tool registered with `title`, `projectId?`, `issueId?` params
- [ ] `kata_list_documents` tool registered with `projectId?`, `issueId?` params
- [ ] All three tools validate "exactly one of projectId/issueId" and return a classified error if violated
- [ ] `grep -c 'pi.registerTool' src/resources/extensions/linear/linear-tools.ts` → 31
- [ ] `npx tsc --noEmit` → clean

## Verification

- `grep -c 'pi.registerTool' src/resources/extensions/linear/linear-tools.ts` → `31`
- `npx tsc --noEmit` → no output (clean)
- Re-run all linear unit tests to confirm no regressions:
  ```
  node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test \
    src/resources/extensions/linear/tests/document-naming.test.ts \
    src/resources/extensions/linear/tests/document-operations.test.ts \
    src/resources/extensions/linear/tests/entity-mapping.test.ts
  ```
  → all pass (0 failures)

## Observability Impact

- Signals added/changed: Three new agent-callable tools exposed; `kata_write_document` returns the full `LinearDocument` JSON including `id`, `title`, `content`, `project { id name }` / `issue { id identifier }`, `createdAt`, `updatedAt` — agent can log or surface any field; `kata_read_document` returning `null` JSON is the explicit "not found" signal
- How a future agent inspects this: `kata_list_documents` with a `projectId` or `issueId` is the zero-side-effect inspection surface; returned array shows all artifact documents and their current content
- Failure state exposed: The "exactly one of projectId/issueId" validation returns a descriptive error immediately, before any API call — surfaces misconfigured agent prompts early

## Inputs

- `src/resources/extensions/linear/linear-documents.ts` — `writeKataDocument`, `readKataDocument`, `listKataDocuments`, `DocumentAttachment` from T02
- `src/resources/extensions/linear/linear-tools.ts` — existing tool registration structure (28 tools post-S03); `ok`, `fail`, `run` helpers; re-export pattern from S03

## Expected Output

- `src/resources/extensions/linear/linear-tools.ts` — 3 new tool registrations + 3 re-exports; total 31 `pi.registerTool` calls
