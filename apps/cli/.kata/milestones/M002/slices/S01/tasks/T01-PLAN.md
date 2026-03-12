---
estimated_steps: 5
estimated_files: 4
---

# T01: Extension scaffold, types, and LinearClient core with team and project operations

**Slice:** S01 — Linear GraphQL Client Extension
**Milestone:** M002

## Description

Create the `src/resources/extensions/linear/` extension directory with the core LinearClient class, TypeScript type definitions for all Linear entities, HTTP error handling utilities, and the first real entity operations (teams and projects). This task proves the client pattern works: auth, GraphQL execution, error classification, and CRUD against the live Linear API.

## Steps

1. Create the `src/resources/extensions/linear/` directory structure. Create `http.ts` with `LinearHttpError` class, error kind taxonomy (`auth_error`, `rate_limited`, `network_error`, `server_error`, `invalid_request`, `graphql_error`), `classifyLinearError()` function, and `RateLimitInfo` extraction — modeled on `search-the-web/http.ts` but adapted for Linear's GraphQL error responses (errors come in `{ errors: [...] }` JSON body, not HTTP status alone).

2. Create `linear-types.ts` with TypeScript interfaces for all Linear entities the client will handle: `LinearTeam`, `LinearProject`, `LinearMilestone`, `LinearIssue`, `LinearLabel`, `LinearDocument`, `LinearWorkflowState`, `LinearUser`, `LinearPageInfo`, `LinearConnection<T>`. Include input types: `ProjectCreateInput`, `ProjectUpdateInput`, `IssueCreateInput`, `IssueUpdateInput`, `MilestoneCreateInput`, `MilestoneUpdateInput`, `LabelCreateInput`, `DocumentCreateInput`, `DocumentUpdateInput`. Keep interfaces minimal — only fields Kata needs, not the full Linear schema.

3. Create `linear-client.ts` with the `LinearClient` class. Constructor takes `apiKey: string` and stores the endpoint `https://api.linear.app/graphql`. Implement the core `graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T>` method using native `fetch` — POST with `Content-Type: application/json`, `Authorization: <apiKey>` header (no Bearer prefix per D008 and research). Parse response JSON, check for `errors` array in GraphQL response, classify and throw structured errors. Extract rate limit info from response headers.

4. Add team operations to LinearClient: `listTeams()` returning `LinearTeam[]` and `getTeam(idOrKey: string)` returning `LinearTeam | null`. Add project operations: `createProject(input: ProjectCreateInput)` returning `LinearProject`, `getProject(id: string)` returning `LinearProject | null`, `listProjects(teamId?: string)` returning `LinearProject[]`, `updateProject(id: string, input: ProjectUpdateInput)` returning `LinearProject`.

5. Create `index.ts` as the pi extension entry point — export the `activate` function following the pattern in `kata/index.ts`. For now, just initialize the extension context and log availability. Tool registration happens in T04. Import and re-export `LinearClient` for use by other modules.

## Must-Haves

- [ ] `http.ts` exists with `LinearHttpError`, error kind taxonomy, `classifyLinearError()`, rate limit extraction
- [ ] `linear-types.ts` exists with interfaces for all entity types (Team, Project, Milestone, Issue, Label, Document, WorkflowState, User) and input types
- [ ] `linear-client.ts` exists with `LinearClient` class, `graphql<T>()` core executor, auth header, error handling
- [ ] `LinearClient.listTeams()` and `getTeam()` return real data from Linear API
- [ ] `LinearClient.createProject()`, `getProject()`, `listProjects()`, `updateProject()` work against real API
- [ ] `index.ts` exists as valid pi extension entry point
- [ ] All imports use `.js` extensions for Node ESM compatibility
- [ ] `npx tsc --noEmit` passes with no type errors

## Verification

- `npx tsc --noEmit` — compiles cleanly
- Manual: `const client = new LinearClient(process.env.LINEAR_API_KEY!); const teams = await client.listTeams(); console.log(teams)` — returns real team data
- Manual: create a project, read it back, verify fields match

## Observability Impact

- Signals added/changed: `classifyLinearError()` produces structured error kinds for all Linear API failures. Rate limit info extracted from response headers.
- How a future agent inspects this: Call any LinearClient method — errors return classified kind + message. Rate limit warnings include remaining quota.
- Failure state exposed: Auth failures → `auth_error` kind with remediation hint. Rate limits → `rate_limited` kind with retry-after. GraphQL errors → `graphql_error` kind with Linear's error message.

## Inputs

- `src/resources/extensions/search-the-web/http.ts` — Pattern reference for error classification and fetch wrapper
- `src/resources/extensions/kata/index.ts` — Pattern reference for extension entry point structure
- `/tmp/linear-cli-inspect/src/utils/graphql.ts` — Reference for auth header format and client construction
- `/tmp/linear-cli-inspect/src/utils/linear.ts` — Reference for team/project query shapes
- S01-RESEARCH.md — Constraints (no Bearer prefix, native fetch, `.js` extensions, no graphql-request)

## Expected Output

- `src/resources/extensions/linear/http.ts` — HTTP error types and classification for Linear API
- `src/resources/extensions/linear/linear-types.ts` — All TypeScript interfaces for Linear entities and inputs
- `src/resources/extensions/linear/linear-client.ts` — LinearClient with core executor + team + project operations
- `src/resources/extensions/linear/index.ts` — Pi extension entry point (stub, tools registered in T04)
