# Kata State

**Active Milestone:** M001 — Full Spec Conformance
**Active Slice:** S05 — Codex App-Server Client
**Active Task:** T01 — Integration test suite and dynamic_tool module
**Phase:** Executing

## Progress

- [x] S01: Domain Types and Error Foundation — 13 contract tests, all §4.1 types, AgentEvent enum, error categories
- [x] S02: Workflow Loader and Config Layer — 19 tests; parse_workflow, from_workflow, validate, WorkflowStore hot-reload all proven
- [x] S03: Linear Tracker Client — TrackerAdapter trait + LinearAdapter + 33 integration tests; all slice verification items pass; 80 total tests
- [x] S04: Workspace Manager and Prompt Builder — 28 tests; path_safety, prompt_builder, workspace modules; 111 total tests; R004+R007 validated
- [ ] S05: Codex App-Server Client — planned (3 tasks: T01 dynamic_tool, T02 subprocess lifecycle, T03 approval/tool/token)
- [ ] S06: Orchestrator Core
- [ ] S07: HTTP Dashboard and JSON API
- [ ] S08: SSH Remote Worker Extension
- [ ] S09: Conformance Sweep and Integration Polish

## Recent Decisions

- D024: Fake shell scripts for Codex app-server testing (matches Elixir approach)
- D025: LinearClient::graphql_raw public method for dynamic tool
- D026: Closure-based executor injection for dynamic_tool testability

## Blockers

- None

## Next Action

Execute T01: Create codex/ module, implement dynamic_tool with linear_graphql, expose LinearClient::graphql_raw, write ≥12 dynamic tool tests.

## Validated Requirements

- R001 (WORKFLOW.md Parsing and Dynamic Reload) — S02
- R002 (Typed Config Layer) — S02
- R004 (Workspace Manager with Safety Invariants) — S04
- R007 (Prompt Builder with Strict Liquid Rendering) — S04
