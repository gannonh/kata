---
id: S01
parent: M002
provides:
  - LinearClient class with auth, GraphQL execution, error classification, cursor pagination
  - Full CRUD for teams, projects, milestones, issues (sub-issues via parentId), labels (ensureLabel), documents, workflow states
  - 22 pi extension tools (linear_*) available in every Kata session when LINEAR_API_KEY is set
  - Integration test suite (30 tests) verifying all operations against real Linear API
  - DocumentCreateInput.issueId [Internal] field risk retired — confirmed working
requires:
  - nothing (first slice in M002)
affects: [S02, S03, S04, S05, S06]
key_files:
  - src/resources/extensions/linear/linear-client.ts
  - src/resources/extensions/linear/linear-types.ts
  - src/resources/extensions/linear/linear-tools.ts
  - src/resources/extensions/linear/http.ts
  - src/resources/extensions/linear/index.ts
  - src/resources/extensions/linear/tests/integration.test.ts
  - src/loader.ts
key_decisions:
  - "Linear API uses 'canceled' not 'cancelled' for workflow state type — fixed in types"
  - "All entity operations built in LinearClient directly (not separate files per entity) — keeps code co-located and reduces import complexity"
  - "resource-loader.ts auto-syncs linear/ via recursive cpSync of entire extensions dir — no explicit wiring needed"
  - "Extension loads silently when LINEAR_API_KEY is not set — no error, just no tools registered"
patterns_established:
  - "LinearClient.graphql<T>(query, variables) — typed GraphQL executor pattern reused by all operations"
  - "LinearClient.paginate<T>(queryFn, maxPages) — generic cursor pagination with safety cap"
  - "classifyLinearError() — error taxonomy: auth_error, rate_limited, network_error, graphql_error, etc."
  - "registerLinearTools(pi, client) — tool registration pattern: ok(data) / fail(err) helpers"
  - "ensureLabel(name, opts) — idempotent get-or-create pattern for labels"
drill_down_paths:
  - .kata/milestones/M002/slices/S01/S01-PLAN.md
  - .kata/milestones/M002/slices/S01/tasks/T01-PLAN.md
  - .kata/milestones/M002/slices/S01/tasks/T02-PLAN.md
  - .kata/milestones/M002/slices/S01/tasks/T03-PLAN.md
  - .kata/milestones/M002/slices/S01/tasks/T04-PLAN.md
duration: ~35min
verification_result: pass
completed_at: 2026-03-12T19:45:00Z
---

# S01: Linear GraphQL Client Extension

**Native Linear GraphQL client with 22 CRUD tools — all operations verified against real Linear API (30/30 tests)**

## What Happened

Built a complete Linear GraphQL client as a pi extension at `src/resources/extensions/linear/`. The client uses native `fetch` (zero external dependencies), authenticates via `LINEAR_API_KEY` header (no Bearer prefix per Linear convention), and handles all error types with a classified taxonomy mirroring the search-the-web extension pattern.

All entity CRUD operations were implemented in a single `LinearClient` class: teams (list/get), projects (CRUD), milestones (CRUD under projects), issues (CRUD with `parentId` for sub-issues), labels (CRUD with idempotent `ensureLabel`), documents (CRUD with project and issue attachment), and workflow states (list with type field).

A comprehensive integration test suite (30 tests across 10 suites) verifies every operation against a real Linear workspace. Two key risks from the roadmap were retired:
- **"Linear GraphQL API coverage"** — all required mutations exist and work
- **"DocumentCreateInput.issueId is [Internal]"** — confirmed working for document-to-issue attachment

22 tools were registered as pi tools (`linear_list_teams`, `linear_create_issue`, etc.) with JSON schema parameters and structured error responses. The extension loads silently when `LINEAR_API_KEY` is not set.

## Deviations

- T01 through T03 were executed as a single implementation pass since the entity operations are formulaic. The integration test was written and verified in the same pass. This compressed 3 planned tasks into ~1 implementation session.
- Linear uses `"canceled"` (American spelling) not `"cancelled"` (British) for workflow state types — fixed after first test run.
- `resource-loader.ts` did not need modification — it already recursively copies all of `extensions/` to agentDir.

## Files Created/Modified

- `src/resources/extensions/linear/http.ts` — HTTP error types, classification, fetch with retry
- `src/resources/extensions/linear/linear-types.ts` — TypeScript interfaces for all Linear entities and inputs
- `src/resources/extensions/linear/linear-client.ts` — LinearClient class with all CRUD operations + pagination
- `src/resources/extensions/linear/linear-tools.ts` — 22 pi tool definitions with schemas and handlers
- `src/resources/extensions/linear/index.ts` — Extension entry point with conditional tool registration
- `src/resources/extensions/linear/tests/integration.test.ts` — 30 integration tests
- `src/resources/extensions/linear/tests/resolve-ts.mjs` — TS import resolver for tests
- `src/resources/extensions/linear/tests/resolve-ts-hooks.mjs` — ESM resolve hooks
- `src/loader.ts` — Added linear extension to KATA_BUNDLED_EXTENSION_PATHS

## Verification Report

### Observable Truths
| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | LinearClient authenticates with LINEAR_API_KEY | ✓ PASS | getViewer returns user profile; invalid key throws auth error |
| 2 | All entity CRUD operations work | ✓ PASS | 30/30 integration tests pass against real Linear API |
| 3 | Sub-issues via parentId work | ✓ PASS | Created parent + child, confirmed hierarchy in getIssue response |
| 4 | ensureLabel is idempotent | ✓ PASS | Same label ID returned on second call with same name |
| 5 | DocumentCreateInput.issueId works | ✓ PASS | Document created and attached to issue successfully |
| 6 | 22 tools registered as pi tools | ✓ PASS | linear-tools.ts registers all tools; npx tsc --noEmit passes |
| 7 | Extension wired into loader | ✓ PASS | linear/index.ts added to KATA_BUNDLED_EXTENSION_PATHS |

### Key Risks Retired
| Risk | Status | Evidence |
|------|--------|----------|
| Linear GraphQL API coverage | ✓ RETIRED | All required mutations exist and pass integration tests |
| DocumentCreateInput.issueId [Internal] | ✓ RETIRED | Document-to-issue attachment works in integration test |
