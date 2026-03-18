# Kata State

**Active Milestone:** M001 — Full Spec Conformance
**Active Slice:** S06 — Orchestrator Core (next)
**Active Task:** —
**Phase:** Planning

## Progress

- [x] S01: Domain Types and Error Foundation — 13 contract tests, all §4.1 types, AgentEvent enum, error categories
- [x] S02: Workflow Loader and Config Layer — 19 tests; parse_workflow, from_workflow, validate, WorkflowStore hot-reload all proven
- [x] S03: Linear Tracker Client — TrackerAdapter trait + LinearAdapter + 33 integration tests; all slice verification items pass; 80 total tests
- [x] S04: Workspace Manager and Prompt Builder — 28 tests; path_safety, prompt_builder, workspace modules; 111 total tests; R004+R007 validated
- [x] S05: Codex App-Server Client — 32 integration tests pass; approval, tool dispatch, user-input, token accounting all done; zero warnings
- [ ] S06: Orchestrator Core
- [ ] S07: HTTP Dashboard and JSON API
- [ ] S08: SSH Remote Worker Extension
- [ ] S09: Conformance Sweep and Integration Polish

## Recent Decisions

- D030: auto_approve_requests derived from approval_policy=="never", stored in SessionHandle
- D031: graphql_executor: Fn+Clone for multi-call turns (FnOnce per dynamic_tool::execute call)
- D032: TurnResult expanded with input_tokens/output_tokens/total_tokens/rate_limits

## Blockers

- None

## Next Action

Begin S06: Orchestrator Core. S05 complete — all 32 tests pass, R005 + R012 validated. S06 depends on S02 (WorkflowStore), S03 (LinearAdapter), S04 (WorkspaceManager + PromptBuilder), S05 (AppServerClient + AgentEvent).

## Validated Requirements

- R001 (WORKFLOW.md Parsing and Dynamic Reload) — S02
- R002 (Typed Config Layer) — S02
- R004 (Workspace Manager with Safety Invariants) — S04
- R005 (Codex App-Server Client) — S05: 32 tests; subprocess, handshake, turn streaming, approval, tool dispatch, user-input, token accounting
- R007 (Prompt Builder with Strict Liquid Rendering) — S04
- R012 (linear_graphql dynamic tool) — S05: 14 tests; argument normalisation, GraphQL execution, error formatting
