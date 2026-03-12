---
estimated_steps: 5
estimated_files: 5
---

# T04: Pi extension tools registration and Kata wiring

**Slice:** S01 — Linear GraphQL Client Extension
**Milestone:** M002

## Description

Make the Linear client user-facing by registering all CRUD operations as pi tools and wiring the extension into Kata's startup pipeline. Without this task, the client exists as dead code — this is the task that delivers the slice's demo outcome: agent can call `linear_*` tools in a live session.

## Steps

1. Create `src/resources/extensions/linear/linear-tools.ts` defining all tool registration functions. Each tool: name following `linear_<operation>` convention (e.g., `linear_list_teams`, `linear_create_project`, `linear_get_issue`, `linear_create_document`), JSON schema for parameters, description string, handler that validates inputs → calls LinearClient method → returns structured JSON. Tools to register: `linear_list_teams`, `linear_get_team`, `linear_create_project`, `linear_get_project`, `linear_list_projects`, `linear_update_project`, `linear_create_milestone`, `linear_get_milestone`, `linear_list_milestones`, `linear_update_milestone`, `linear_create_issue`, `linear_get_issue`, `linear_list_issues`, `linear_update_issue`, `linear_create_label`, `linear_list_labels`, `linear_ensure_label`, `linear_list_workflow_states`, `linear_create_document`, `linear_get_document`, `linear_list_documents`, `linear_update_document`.

2. Wire tool registration into `index.ts`. On `activate`: check for `LINEAR_API_KEY` in `process.env`. If present: instantiate `LinearClient`, call `registerLinearTools(pi, client)` to add all tools. If absent: log info message ("Linear tools unavailable — set LINEAR_API_KEY via secure_env_collect") and skip registration. Do NOT throw — the extension should load silently when unconfigured.

3. Add the linear extension to `KATA_BUNDLED_EXTENSION_PATHS` in `src/loader.ts`. Add the entry: `join(agentDir, "extensions", "linear", "index.ts")` to the existing array. This makes pi discover and load the extension on every Kata session.

4. Add the linear extension directory to the resource sync in `src/resource-loader.ts`. The `initResources()` or `reload()` function must copy `src/resources/extensions/linear/` to `~/.kata-cli/agent/extensions/linear/` alongside all other bundled extensions. Follow the exact same pattern used for existing extensions.

5. End-to-end verification: build (`npx tsc --noEmit`), start a fresh Kata session with `LINEAR_API_KEY` set, confirm `linear_*` tools appear in the tool list. Call `linear_list_teams` from the agent prompt — verify it returns real team data. Confirm that starting a session WITHOUT `LINEAR_API_KEY` succeeds without errors (tools just don't appear).

## Must-Haves

- [ ] `linear-tools.ts` defines tool registration for all 21 CRUD operations
- [ ] Each tool has: name, JSON schema, description, input validation, structured JSON output
- [ ] `index.ts` conditionally registers tools only when `LINEAR_API_KEY` is present
- [ ] Extension loads silently (no error) when `LINEAR_API_KEY` is not set
- [ ] `loader.ts` includes linear extension in `KATA_BUNDLED_EXTENSION_PATHS`
- [ ] `resource-loader.ts` syncs linear extension to `~/.kata-cli/agent/extensions/linear/`
- [ ] `npx tsc --noEmit` passes with all new files
- [ ] Agent session with `LINEAR_API_KEY` shows all `linear_*` tools
- [ ] `linear_list_teams` called from agent returns real team data

## Verification

- `npx tsc --noEmit` — compiles cleanly
- Start Kata session with `LINEAR_API_KEY` → tools visible in session
- Call `linear_list_teams` from agent → returns real team names and IDs
- Start Kata session without `LINEAR_API_KEY` → session starts normally, no linear tools listed, no errors

## Observability Impact

- Signals added/changed: Each tool call returns structured JSON with operation result or classified error. Missing API key produces a clear info-level message at extension load time.
- How a future agent inspects this: Check tool list for `linear_*` entries. Call any tool — success returns entity data, failure returns classified error with remediation hint.
- Failure state exposed: Tool calls surface LinearClient's error classification (auth_error with secure_env_collect hint, rate_limited with retry-after, etc.). Extension load failure surfaces in pi's extension loading logs.

## Inputs

- `src/resources/extensions/linear/linear-client.ts` — T01-T03's complete LinearClient
- `src/resources/extensions/linear/index.ts` — T01's extension entry point stub
- `src/loader.ts` — Current KATA_BUNDLED_EXTENSION_PATHS array
- `src/resource-loader.ts` — Current resource sync logic
- `src/resources/extensions/kata/index.ts` — Pattern reference for tool registration via `pi.addTool()`

## Expected Output

- `src/resources/extensions/linear/linear-tools.ts` — All 21 tool definitions with schemas and handlers
- `src/resources/extensions/linear/index.ts` — Updated with conditional tool registration
- `src/loader.ts` — Updated with linear extension path
- `src/resource-loader.ts` — Updated with linear extension sync
- Slice demo achieved: agent can call `linear_*` tools in a live Kata session
