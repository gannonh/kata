# S01: Linear GraphQL Client Extension — Research

**Date:** 2026-03-12

## Summary

S01 lays the entire foundation for M002. Every subsequent slice consumes the `LinearClient` and tools this slice produces. The goal is a pure Node.js TypeScript client for Linear's GraphQL API that can CRUD all Kata entity types (projects, milestones, issues/sub-issues, labels, documents), exposed as pi extension tools.

The reference implementation (`schpet/linear-cli`) uses `graphql-request` and the Deno runtime. The port is straightforward: Linear's GraphQL API is a single POST endpoint, so `graphql-request` can be replaced with native `fetch` — consistent with all other Kata extensions (search-the-web, browser-tools) which avoid third-party HTTP libraries. No new npm dependencies are required.

All required mutations confirmed exist in the Linear schema: `projectCreate`, `projectMilestoneCreate`, `issueCreate` (with `parentId` for sub-issues), `issueLabelCreate`, `documentCreate`, and their Update/Delete counterparts. One meaningful risk: `DocumentCreateInput.issueId` is flagged `[Internal]` in the Linear schema — document attachment to projects is public, but attachment to issues is an unofficial field. Linear-cli uses it successfully, but it warrants integration verification in S01 before other slices depend on it.

Auth is trivially simple: `LINEAR_API_KEY` as the `Authorization` header (no Bearer prefix). The `secure_env_collect` flow handles key storage. No OAuth, no PKCE, no token refresh.

## Recommendation

Build the extension as a standalone pi extension at `src/resources/extensions/linear/` following the exact same structure as `kata/`. The client layer should be a thin wrapper around `fetch` — zero external dependencies. Register all CRUD operations as individual pi tools (matching the existing linear MCP tools' naming) so the agent has fine-grained access. Keep the extension unopinionated about Kata semantics — S03 adds the Kata entity mapping on top of these raw tools.

For integration testing, a `test-linear-client.ts` script that runs real API calls against a sandbox workspace (gated by `LINEAR_API_KEY` env var) is the right verification vehicle. Unit tests cover types and error handling; integration tests cover actual API coverage.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| HTTP with retry + timeout | `search-the-web/http.ts` pattern | Already battle-tested in Kata; native fetch, structured error taxonomy, abort signal merging |
| Auth from env var | `process.env.LINEAR_API_KEY` + `secure_env_collect` | Standard Kata pattern for API keys |
| Extension registration | `index.ts` + `pi.addTool()` | Identical to all other Kata extensions — no new pattern needed |
| GraphQL POST body | Plain `fetch` with JSON body | Linear's API is a single endpoint; no codegen, no `graphql-request`, no schema parsing at runtime |

## Existing Code and Patterns

- `src/resources/extensions/search-the-web/http.ts` — Reuse the `fetchWithRetry` / `HttpError` / `classifyError` pattern directly for the Linear client. Same error taxonomy (auth_error, rate_limited, network_error, server_error) fits perfectly.
- `src/resources/extensions/kata/index.ts` — Exact pattern for extension entry point, tool registration, and session hooks. Linear extension should mirror this structure.
- `src/resources/extensions/kata/types.ts` — Precedent for pure-interface type files with no runtime dependencies. `linear-types.ts` should follow the same convention.
- `/tmp/linear-cli-inspect/src/utils/graphql.ts` — Reference for auth header (`Authorization: apiKey`, no Bearer prefix), client construction, API key resolution precedence chain.
- `/tmp/linear-cli-inspect/src/utils/linear.ts` — Reference for all GraphQL queries/mutations, including cursor-based pagination pattern (`pageInfo.hasNextPage` / `pageInfo.endCursor`).
- `/tmp/linear-cli-inspect/src/commands/document/document-create.ts` — Confirms `documentCreate` mutation signature and the `issueId` field usage.
- `/tmp/linear-cli-inspect/src/commands/milestone/milestone-create.ts` — `projectMilestoneCreate` mutation signature (requires `projectId`, not just team).
- `/tmp/linear-cli-inspect/src/commands/issue/issue-create.ts` — `issueCreate` with `parentId` for sub-issues, `labelIds` array, `stateId`, `projectMilestoneId`.
- `/tmp/linear-cli-inspect/src/commands/label/label-create.ts` — `issueLabelCreate` — accepts optional `teamId`; omitting creates a workspace-level label.

## Constraints

- Extension must be pure Node.js TypeScript — no Deno APIs (`Deno.env`, `Deno.readTextFile`, etc.). Replace with `process.env` and `fs/promises`.
- `graphql-request` is NOT in `package.json` and should NOT be added — use native `fetch`.
- Linear API endpoint: `https://api.linear.app/graphql` (no trailing slash). Single POST endpoint for all operations.
- Auth header: `Authorization: <apiKey>` — no "Bearer" prefix. Raw key only (confirmed in linear-cli source).
- Extension loads from `src/resources/extensions/linear/` and is synced to `~/.kata-cli/agent/extensions/linear/` by `resource-loader.ts`. Must be added to `KATA_BUNDLED_EXTENSION_PATHS` in `loader.ts`.
- TypeScript compilation: `tsconfig.json` extends the root config. Module output is ESM (`.js` imports). The extension must use `.js` extensions on imports (Node.js ESM resolution).
- `LINEAR_API_KEY` must never appear in committed files. Key is stored via `secure_env_collect` → `.env` file.

## Common Pitfalls

- **`issueId` in DocumentCreateInput is marked `[Internal]`** — The field exists and works (linear-cli uses it), but it is not in the official public API contract. Verify it works in integration tests. Fall back to project-level document attachment if it's blocked in some workspaces.
- **Issue IDs vs Identifiers** — Linear has two ID types: UUID (`id`, used in mutations like `issueCreate parentId`) and identifier (`identifier`, the human-readable `KAT-123`). Mutations require UUID; queries can often accept either. Build a `resolveIssueId(identifier)` helper early — S03 will need it constantly.
- **Milestone belongs to Project, not Team** — `projectMilestoneCreate` requires `projectId` (UUID), not `teamId`. The project must exist first. Don't try to create a milestone directly under a team.
- **Labels are team-scoped by default** — `issueLabelCreate` with no `teamId` creates a workspace label. `issueLabelCreate` with `teamId` creates a team label. Kata labels (`kata:milestone`, etc.) should be workspace labels for cross-team portability.
- **Cursor pagination required for large result sets** — All list queries (`issues`, `documents`, `teams`) return 50 results by default. Issue `first: 250` for bulk fetches. Implement cursor loop for completeness even if S01's tools don't need it immediately — S05 (state derivation) will need to page through all issues.
- **`parentId` must be UUID, not identifier** — When creating sub-issues, `parentId` in `IssueCreateInput` is the issue's UUID (`id` field), not its identifier (`KAT-42`). Always resolve identifier → UUID via a `getIssueId(identifier)` query before using as `parentId`.
- **No `graphql-tag` / `gql` template literals** — Linear-cli uses codegen'd `gql` tags. In the Kata extension, write GraphQL operations as plain strings inside the mutation/query calls. No schema codegen needed.
- **Node.js ESM `.js` import extensions** — The kata extension imports look like `import { foo } from "./files.js"` (not `.ts`). The linear extension must do the same. TypeScript compiles `.ts` → `.js`; runtime resolves `.js`.

## Open Risks

- **`DocumentCreateInput.issueId` is `[Internal]`** — Works in practice but could be silently dropped or rate-limited. If document-to-issue attachment breaks, the fallback is: attach documents to the project and embed the issue identifier in the document title (`"S01-PLAN [KAT-42]"`). This needs verification before S04 is planned.
- **Linear API rate limits** — Linear's API is rate-limited at ~1500 requests/hour (complexity-based). Auto-mode running many issue updates could approach limits. The client should surface `X-RateLimit-Remaining` headers in error context. No mitigation needed for S01, but document it.
- **`project(id: String!)` accepts both UUID and slugId** — Linear-cli code shows `project(id: ...)` accepting slugId strings. This behavior is documented in the schema but worth verifying: if the UUID is not deterministically available, slug lookup could be needed. Verify in integration tests.
- **Workspace document vs project document visibility** — Documents created without `projectId` are workspace-level; not sure if they appear in project views in the Linear UI. For artifact discoverability, all documents should be attached to the relevant project. Verify in integration test by checking Linear UI.
- **`issueLabelCreate` idempotency** — Linear doesn't guarantee that creating a label with the same name twice will deduplicate. A "get or create" helper (`ensureLabel`) should be built in S01 and used by S03 to avoid duplicate `kata:milestone` labels.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Linear API | `linear` — manage issues/projects via Linear MCP | installed (but irrelevant — this skill is for using MCP tools, not building the client) |
| Linear workflow | `kata-linear` — Linear ticket lifecycle | installed (but irrelevant — this is for using Linear for Kata tickets, not building the extension) |

No skill is directly applicable to building a raw GraphQL client for Linear. Proceed without skill loading for this slice.

## Sources

- Linear GraphQL schema (`/tmp/linear-cli-inspect/graphql/schema.graphql`) — Confirmed all required mutations exist: `projectCreate`, `projectMilestoneCreate`, `issueCreate` (with `parentId`), `issueLabelCreate`, `documentCreate`, and Update/Delete counterparts. `DocumentCreateInput.issueId` is marked `[Internal]`.
- `schpet/linear-cli` (`/tmp/linear-cli-inspect/src/`) — Reference implementation: GraphQL client construction, auth header format, query/mutation patterns for all entity types, pagination patterns.
- Kata extension source (`src/resources/extensions/`) — Established patterns for extension structure, tool registration, fetch-based HTTP clients, `.js` import resolution.
