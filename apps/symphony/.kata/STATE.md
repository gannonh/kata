# Kata State

**Active Milestone:** M001 — Full Spec Conformance
**Active Slice:** S05 — Codex App-Server Client
**Active Task:** T03 — Approval handling, tool call dispatch, user-input policy, and token accounting
**Phase:** Executing

## Progress

- [x] S01: Domain Types and Error Foundation — 13 contract tests, all §4.1 types, AgentEvent enum, error categories
- [x] S02: Workflow Loader and Config Layer — 19 tests; parse_workflow, from_workflow, validate, WorkflowStore hot-reload all proven
- [x] S03: Linear Tracker Client — TrackerAdapter trait + LinearAdapter + 33 integration tests; all slice verification items pass; 80 total tests
- [x] S04: Workspace Manager and Prompt Builder — 28 tests; path_safety, prompt_builder, workspace modules; 111 total tests; R004+R007 validated
- [ ] S05: Codex App-Server Client — T01+T02 complete (22 tests: dynamic_tool + app_server lifecycle); T03 pending
- [ ] S06: Orchestrator Core
- [ ] S07: HTTP Dashboard and JSON API
- [ ] S08: SSH Remote Worker Extension
- [ ] S09: Conformance Sweep and Integration Polish

## Recent Decisions

- D027: start_session takes explicit workspace_root parameter (not from CodexConfig)
- D028: Issue metadata stored in SessionHandle (run_turn has no issue param)
- D029: stderr drained by fire-and-forget tokio::spawn task (not merged with stdout)

## Blockers

- None

## Next Action

Execute T03: Extend turn stream handler with approval auto-approve/reject, item/tool/call dispatch, item/tool/requestUserInput handling, token delta extraction. Write ~8 more integration tests.

## Validated Requirements

- R001 (WORKFLOW.md Parsing and Dynamic Reload) — S02
- R002 (Typed Config Layer) — S02
- R004 (Workspace Manager with Safety Invariants) — S04
- R007 (Prompt Builder with Strict Liquid Rendering) — S04
