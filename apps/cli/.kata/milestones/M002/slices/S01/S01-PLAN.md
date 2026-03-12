# S01: Linear GraphQL Client Extension

**Goal:** Ship a native Linear GraphQL client as a pi extension — CRUD for all Kata entity types (teams, projects, milestones, issues/sub-issues, labels, documents) exposed as agent tools.
**Demo:** Agent can authenticate with a Linear API key and perform CRUD on all entity types against a real Linear workspace via extension tools visible in the pi session.

## Must-Haves

- LinearClient class authenticates with `LINEAR_API_KEY` and executes arbitrary GraphQL against `https://api.linear.app/graphql`
- All required CRUD operations work against real Linear API: teams (list/get), projects (CRUD), milestones (CRUD), issues with parentId for sub-issues (CRUD), labels with ensureLabel idempotency (CRUD), documents with project and issue attachment (CRUD)
- Extension registers all operations as pi tools accessible to the agent
- Extension wired into Kata's loader and resource-syncer — tools appear in every Kata session when `LINEAR_API_KEY` is set
- Error handling follows Kata's established pattern (classified errors, structured messages, auth/rate-limit/network distinction)
- Cursor pagination utility works for list operations returning >50 results
- `DocumentCreateInput.issueId` verified working (retires risk from roadmap)

## Proof Level

- This slice proves: **integration** — real GraphQL operations against a live Linear workspace
- Real runtime required: **yes** — `LINEAR_API_KEY` env var and network access to Linear API
- Human/UAT required: **no** — automated integration test script validates all operations

## Verification

- `LINEAR_API_KEY=<key> node --import ./src/resources/extensions/linear/tests/resolve-ts.mjs --experimental-strip-types src/resources/extensions/linear/tests/integration.test.ts` — full integration test exercising all entity CRUD against real Linear API
- `npx tsc --noEmit` — type-checks cleanly with no errors
- Agent session shows `linear_*` tools in tool list when `LINEAR_API_KEY` is set

## Observability / Diagnostics

- Runtime signals: Classified error types (`auth_error`, `rate_limited`, `network_error`, `server_error`, `invalid_request`) with structured messages. `X-RateLimit-Remaining` surfaced on rate limit errors.
- Inspection surfaces: Each tool returns structured JSON with operation result or error detail. Integration test script can be re-run at any time.
- Failure visibility: Auth failures surface "LINEAR_API_KEY missing or invalid" with `secure_env_collect` remediation hint. Rate limits surface remaining quota and retry-after. Network errors surface connection detail.
- Redaction constraints: `LINEAR_API_KEY` never logged or surfaced in error messages. Only "missing" or "invalid" status exposed.

## Integration Closure

- Upstream surfaces consumed: none (S01 is the first slice in M002)
- New wiring introduced in this slice: `src/resources/extensions/linear/index.ts` registered in `KATA_BUNDLED_EXTENSION_PATHS` (loader.ts) and synced by `resource-loader.ts` — tools available in every Kata session
- What remains before the milestone is truly usable end-to-end: S02 (project config + mode switching), S03 (Kata hierarchy mapping), S04 (document-based artifacts), S05 (state derivation), S06 (workflow prompt + auto-mode). This slice delivers the raw client and tools — downstream slices add Kata-specific semantics.

## Tasks

- [ ] **T01: Extension scaffold, types, and LinearClient core with team and project operations** `est:45m`
  - Why: Establishes the extension structure, core client with auth/error handling, and first real entity operations (teams, projects) — proves the client pattern works against live API
  - Files: `src/resources/extensions/linear/index.ts`, `src/resources/extensions/linear/linear-types.ts`, `src/resources/extensions/linear/linear-client.ts`, `src/resources/extensions/linear/http.ts`
  - Do: Create extension directory. Define TypeScript interfaces for all Linear entities. Implement LinearClient with constructor(apiKey), raw `graphql<T>(query, variables)` executor using native fetch, error classification mirroring search-the-web/http.ts. Add team list/get and project CRUD methods. Stub index.ts with extension entry point. Use `.js` import extensions for Node ESM.
  - Verify: `npx tsc --noEmit` passes. Manual test: instantiate LinearClient with real key, call `listTeams()` and `createProject()` / `getProject()` — results match Linear UI.
  - Done when: LinearClient can authenticate, execute GraphQL, classify errors, and CRUD teams and projects against real Linear API.

- [ ] **T02: Issue, sub-issue, milestone, and label CRUD operations** `est:40m`
  - Why: Adds the entity operations that S03 (hierarchy mapping) and S05 (state derivation) depend on — issues with parentId for sub-issues, milestones under projects, and idempotent label management
  - Files: `src/resources/extensions/linear/linear-client.ts`, `src/resources/extensions/linear/linear-types.ts`
  - Do: Add milestone CRUD (create under project, get, list, update). Add issue CRUD (create with optional parentId/labelIds/projectId/milestoneId, get, list with filters, update). Add label CRUD (create with optional teamId, list, get) plus `ensureLabel(name, opts)` get-or-create helper. Add workflow state query (list states for a team). All methods return typed results.
  - Verify: Manual test: create a milestone under a project, create a parent issue, create a sub-issue under it, create a label and attach it, query back — all match Linear UI.
  - Done when: LinearClient can CRUD milestones, issues (including sub-issues via parentId), labels (including idempotent ensureLabel), and query workflow states.

- [ ] **T03: Document CRUD, cursor pagination, and integration test** `est:40m`
  - Why: Completes the client's entity coverage (documents are how artifacts are stored in S04), adds pagination for large result sets (needed by S05), and produces the integration test that proves all operations work — retiring the "API coverage" and "DocumentCreateInput.issueId" risks from the roadmap
  - Files: `src/resources/extensions/linear/linear-client.ts`, `src/resources/extensions/linear/linear-types.ts`, `src/resources/extensions/linear/tests/integration.test.ts`, `src/resources/extensions/linear/tests/resolve-ts.mjs`
  - Do: Add document CRUD (create with projectId and/or issueId, get, list, update). Add generic cursor pagination helper method `paginate<T>()` that handles `pageInfo.hasNextPage` / `endCursor` loops. Refactor list methods to use paginate internally. Write integration test script that exercises every operation type against a real Linear workspace (gated by `LINEAR_API_KEY`). Explicitly test `documentCreate` with `issueId` to retire the `[Internal]` field risk.
  - Verify: `LINEAR_API_KEY=<key> node --experimental-strip-types src/resources/extensions/linear/tests/integration.test.ts` — all operations pass. Document-to-issue attachment confirmed working.
  - Done when: All entity CRUD operations pass integration tests against real Linear. DocumentCreateInput.issueId risk retired. Cursor pagination works for list operations.

- [ ] **T04: Pi extension tools registration and Kata wiring** `est:35m`
  - Why: Makes the client user-facing — without tool registration and loader wiring, the client exists but the agent can't use it. This is the task that delivers the slice's demo outcome.
  - Files: `src/resources/extensions/linear/index.ts`, `src/resources/extensions/linear/linear-tools.ts`, `src/loader.ts`, `src/resource-loader.ts`
  - Do: Create `linear-tools.ts` with tool definition functions — one pi tool per operation (e.g., `linear_list_teams`, `linear_create_project`, `linear_create_issue`, `linear_create_document`, etc.). Each tool: validates inputs, calls LinearClient method, returns structured JSON result. Tools only register when `LINEAR_API_KEY` is present (skip registration with info log if missing). Wire `index.ts` to register all tools via `pi.addTool()`. Add linear extension path to `KATA_BUNDLED_EXTENSION_PATHS` in `loader.ts`. Add linear extension to resource sync in `resource-loader.ts`. Verify end-to-end: start a Kata session and confirm `linear_*` tools appear.
  - Verify: `npx tsc --noEmit` passes. Start Kata session with `LINEAR_API_KEY` set — `linear_*` tools listed. Call `linear_list_teams` from agent — returns real team data.
  - Done when: All Linear tools appear in the agent's tool palette. Agent can call any linear tool and get real results from the Linear API.

## Files Likely Touched

- `src/resources/extensions/linear/index.ts` — Extension entry point
- `src/resources/extensions/linear/linear-types.ts` — TypeScript interfaces for Linear entities
- `src/resources/extensions/linear/linear-client.ts` — LinearClient class with all CRUD operations
- `src/resources/extensions/linear/http.ts` — HTTP utilities (error classification, fetch wrapper)
- `src/resources/extensions/linear/linear-tools.ts` — Pi tool definitions
- `src/resources/extensions/linear/tests/integration.test.ts` — Integration tests
- `src/resources/extensions/linear/tests/resolve-ts.mjs` — TS import resolver for tests
- `src/loader.ts` — Add linear to KATA_BUNDLED_EXTENSION_PATHS
- `src/resource-loader.ts` — Add linear extension to resource sync
