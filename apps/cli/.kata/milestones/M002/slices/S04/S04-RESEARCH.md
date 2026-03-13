# S04: Document Storage — Artifacts as Linear Documents — Research

**Date:** 2026-03-12

## Summary

S04 adds a `linear-documents.ts` module that stores Kata planning artifacts (roadmaps, plans, summaries, decisions, etc.) as Linear Documents with full markdown round-trip fidelity. All prior API risks were retired in S01: document creation, project attachment, and issue attachment (`issueId` [Internal]) all work against the real Linear API. S04 is a clean implementation slice — no unknown API behaviors, just careful design.

The core pattern is an **upsert by title**: to write an artifact, find any existing document with the exact title on the attachment target, update it if found or create it if not. The Linear GraphQL API supports server-side title filtering (`DocumentFilter.title.eq`) so "find by title" does not require listing all documents client-side.

The current `LinearClient.listDocuments` only supports `projectId` filter. It needs to be extended with `issueId` and `title` parameters so slice/task documents (attached to issues) can be found efficiently. This is a surgical 3-line change to the filter builder.

The document naming convention mirrors the file naming convention exactly: `M001-ROADMAP`, `S01-PLAN`, `T01-SUMMARY`, `DECISIONS`, etc. This makes the Linear-mode and file-mode naming surfaces consistent and human-readable in the Linear UI.

## Recommendation

Build `linear-documents.ts` with:
1. **Pure naming functions** — `buildDocumentTitle` / `parseDocumentTitle` with flat dash format
2. **`LinearDocumentClient` interface** — same structural duck-typing pattern as `LinearEntityClient` from S03
3. **Core upsert/read/list functions** — `writeKataDocument`, `readKataDocument`, `listKataDocuments`
4. **Named attachment helpers** — thin wrappers per level (milestone, slice, task, root) that construct the title and attachment from Kata IDs
5. **Extend `LinearClient.listDocuments`** — add `issueId` and `title` opts; 3-line change
6. **3 new tools** — `kata_write_document`, `kata_read_document`, `kata_list_documents`

Do **not** build separate `writeRoadmap()`, `writeContext()` functions — the naming convention + generic functions cover all artifact types without per-type boilerplate.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Document CRUD | `LinearClient.createDocument`, `getDocument`, `updateDocument`, `deleteDocument` | All proved in S01 integration tests (30/30 pass); zero-dep fetch client |
| Idempotent label get-or-create | `ensureLabel` pattern from S01 | Exact same pattern needed for upsert — find first, then create |
| Structural interface for mocks | `LinearEntityClient` pattern from S03 | `LinearDocumentClient` follows the same named-interface pattern; enables lightweight inline mocks without importing `LinearClient` |
| TypeBox schema for tools | existing `Type.*` usage in `linear-tools.ts` | All 28 existing tools use it; continue the pattern |

## Existing Code and Patterns

- `src/resources/extensions/linear/linear-client.ts` — `createDocument`, `getDocument`, `updateDocument`, `deleteDocument`, `listDocuments` are all working. `listDocuments` currently only filters by `projectId` — needs `issueId` and `title` opts added (see Constraints)
- `src/resources/extensions/linear/linear-types.ts` — `LinearDocument` interface exists; currently missing `project` and `issue` sub-objects on the read side; `DocumentCreateInput` has `issueId?: string` (confirmed [Internal] but working in S01)
- `src/resources/extensions/linear/linear-entities.ts` — follow its module structure exactly: pure functions at top, interface after, creation functions below. `LinearEntityClient` interface pattern for structural duck-typing
- `src/resources/extensions/linear/linear-tools.ts` — `ok(data)` / `fail(err)` / `run(fn)` pattern for all tool handlers; `registerLinearTools` adds tools at the end; re-export entity functions under `kata_*` names for smoke-check
- `src/resources/extensions/linear/tests/entity-hierarchy.integration.test.ts` — integration test template: `before()` resolves team+project; `after()` cleans up tracked IDs; `skip` guard on `LINEAR_API_KEY`

## Constraints

### Linear API capabilities confirmed from schema and linear-cli reference

1. **`DocumentFilter` supports title exact-match**: `{ title: { eq: "M001-ROADMAP" } }` — can find document by exact title server-side without listing all documents
2. **`DocumentFilter` supports issue filter**: `{ issue: { id: { eq: "uuid" } } }` — confirmed from both schema (`DocumentFilter.issue: IssueFilter`) and linear-cli `document-list.ts` (`filter.issue = { identifier: { eq: ... } }`)
3. **Documents attach to project OR issue, not both**: Linear-cli document create UI offers "Nothing / Project / Issue" as mutually exclusive options — do not set both `projectId` and `issueId` on the same document
4. **`content` field is optional** (`String`, not `String!`) — documents can exist without content; always pass content explicitly
5. **`LinearMilestone` entities cannot have documents attached** — milestone-level artifacts (M001-ROADMAP) must attach to the `projectId`, not the milestone UUID

### Required `LinearClient.listDocuments` change

Add `issueId?: string` and `title?: string` to opts. In the filter builder:
```typescript
if (opts?.issueId) filter.issue = { id: { eq: opts.issueId } };
if (opts?.title)   filter.title = { eq: opts.title };
```
This is backward-compatible — existing callers unaffected.

### Required `LinearDocument` type update

Currently missing `project` and `issue` sub-objects on the read side. Add:
```typescript
project?: { id: string; name: string } | null;
issue?: { id: string; identifier: string } | null;
```
Remove the stale `projectId?: string` top-level field (replaced by `project.id`).

Update `DOCUMENT_FIELDS` in `linear-client.ts` to query these:
```
project { id name }
issue { id identifier }
```

## Common Pitfalls

- **Setting both `projectId` and `issueId`** — documents attach to one target only; setting both leads to undefined behavior. Slice/task docs use `issueId` only; milestone/root docs use `projectId` only.
- **Not scoping the title filter to the attachment target** — `listDocuments({ title: "PLAN" })` without a project or issue filter could match any PLAN document in the workspace. Always combine title filter with project or issue scope.
- **Treating `content: undefined` as empty** — `getDocument()` returns `content: ""` or `content: undefined` for newly created empty docs; callers of `readKataDocument` should treat both as "no content" rather than throwing.
- **Title collision** — if a user manually creates a document with the same title on the same attachment target, `writeKataDocument` will update the first match. Document this as a known limitation.
- **`kata:milestone` label can't be applied to `ProjectMilestone`** (from S03 forward intelligence) — document attachment for milestone artifacts goes to the project, not to a milestone. The same constraint applies here.

## Open Risks

- **Document content size limit** — Linear has no documented size limit in the schema, but practical limits exist (Tiptap editor memory, request size). Large roadmaps or DECISIONS files may be truncated silently. Integration test should include a multi-section markdown document (~2KB) to stress-test. If limits surface during execution, the mitigation is to truncate or split content.
- **`issueId` [Internal] filter behavior** — the `DocumentFilter.issue` field is not marked `[Internal]` in the schema (only `DocumentCreateInput.issueId` is), but filtering by `issue.id` is confirmed from linear-cli code. Integration test must verify this works before trusting it for production use.
- **Idempotency under concurrent writes** — two agents writing to the same document title simultaneously could race. Acceptable for now: Kata runs single-threaded in auto-mode. Document as known non-issue.
- **Updating `content` clears formatting** — Linear Documents use Tiptap internally; the API's markdown content round-trips through Tiptap. Formatting that Tiptap doesn't support may be silently dropped. Integration test must verify headers, code blocks, and lists survive a write-then-read cycle.

## Artifact Naming Convention

Mirrors the file naming convention exactly (same strings, without `.md`):

| Level | File Name | Document Title | Attachment |
|-------|-----------|----------------|------------|
| Root | `DECISIONS.md` | `DECISIONS` | `projectId` |
| Root | `PROJECT.md` | `PROJECT` | `projectId` |
| Milestone | `M001-ROADMAP.md` | `M001-ROADMAP` | `projectId` |
| Milestone | `M001-CONTEXT.md` | `M001-CONTEXT` | `projectId` |
| Milestone | `M001-RESEARCH.md` | `M001-RESEARCH` | `projectId` |
| Milestone | `M001-SUMMARY.md` | `M001-SUMMARY` | `projectId` |
| Slice | `S01-PLAN.md` | `S01-PLAN` | `sliceIssueId` |
| Slice | `S01-RESEARCH.md` | `S01-RESEARCH` | `sliceIssueId` |
| Slice | `S01-CONTEXT.md` | `S01-CONTEXT` | `sliceIssueId` |
| Slice | `S01-SUMMARY.md` | `S01-SUMMARY` | `sliceIssueId` |
| Slice | `S01-UAT.md` | `S01-UAT` | `sliceIssueId` |
| Task | `T01-PLAN.md` | `T01-PLAN` | `taskIssueId` |
| Task | `T01-SUMMARY.md` | `T01-SUMMARY` | `taskIssueId` |

`buildDocumentTitle("M001", "ROADMAP")` → `"M001-ROADMAP"`. Root-level: `buildDocumentTitle(null, "DECISIONS")` → `"DECISIONS"`.

Note: document titles use plain dash format (no brackets), unlike issue titles which use `[M001] Title` bracket format (D021). Documents are not parsed for Kata IDs from the Linear list API — they're always accessed by explicit title, so the bracket format's parseability benefit doesn't apply.

## Module Architecture (linear-documents.ts)

```typescript
// Pure naming — no imports beyond types
buildDocumentTitle(kataId: string | null, artifactType: string): string
parseDocumentTitle(title: string): { kataId: string | null; artifactType: string } | null

// Structural interface for mocks
LinearDocumentClient: { createDocument, getDocument, updateDocument, listDocuments }

// Core operations
writeKataDocument(client, title, content, attachment): Promise<LinearDocument>
// attachment: { projectId: string } | { issueId: string }

readKataDocument(client, title, attachment): Promise<LinearDocument | null>
// returns null when not found; returns document with full content when found

listKataDocuments(client, attachment): Promise<LinearDocument[]>
// list all documents for a given attachment target

// Re-exports in linear-tools.ts
kata_write_document as kata_write_document (runtime tool + named re-export)
kata_read_document as kata_read_document
kata_list_documents as kata_list_documents
```

## Task Decomposition Hint

**T01** — Types, pure functions, LinearDocumentClient interface
- Update `LinearDocument` to include `project` and `issue` sub-objects; remove stale `projectId?: string`
- Update `DOCUMENT_FIELDS` in `LinearClient` to query `project { id name }` and `issue { id identifier }`
- Add `buildDocumentTitle` + `parseDocumentTitle` pure functions in new `linear-documents.ts`
- Add `LinearDocumentClient` structural interface
- Unit tests: ~20 covering all title formats, null kataId, parse round-trips

**T02** — LinearClient extension + core write/read/list functions
- Extend `listDocuments` with `issueId` and `title` opts; update GraphQL filter builder (3 lines)
- `writeKataDocument` — upsert: `listDocuments({ projectId|issueId, title })` → update or create
- `readKataDocument` — find: `listDocuments({ projectId|issueId, title })` → first match or null
- `listKataDocuments` — list: `listDocuments({ projectId|issueId })`
- Unit tests: mock client pattern from S03 (`makeMockClient` spy approach)

**T03** — Integration tests (document round-trips)
- Create project-level document: write `M001-ROADMAP` with markdown content → read back → assert content identical
- Create issue-level document: write `S01-PLAN` to slice issue → read back → assert content identical
- Upsert: write → write again with new content → list shows 1 document, not 2; read returns new content
- Markdown fidelity: content with headers, lists, code blocks survives round-trip
- `listKataDocuments` returns both documents for correct attachment target; other target returns only its own
- Cleanup: delete all created documents in `after()`

**T04** — Tools + smoke check
- Register `kata_write_document`, `kata_read_document`, `kata_list_documents` tools
- Re-export under `kata_*` names in `linear-tools.ts` for smoke-check
- Total tool count after S04: 28 + 3 = 31

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Linear GraphQL API | none needed (S01 retired all API unknowns) | none found |
| Node.js TypeScript | core toolchain already in use | n/a |

## Sources

- `DocumentFilter` supports `title: { eq: ... }` and `issue: IssueFilter` (source: `/tmp/linear-cli-inspect/graphql/schema.graphql` lines 5025-5055)
- `document-list.ts` confirms `filter.issue = { identifier: { eq: ... } }` works in production (source: `/tmp/linear-cli-inspect/src/commands/document/document-list.ts`)
- `DocumentCreateInput.issueId` [Internal] confirmed working against real API (source: S01 integration test, 30/30 pass)
- Documents attach to project OR issue, not both (source: `/tmp/linear-cli-inspect/src/commands/document/document-create.ts`, interactive mode logic)
- `Document.content` is `String` not `String!` — can be null/undefined (source: `/tmp/linear-cli-inspect/graphql/schema.graphql` line ~7940)
