# Kata State

**Active Milestone:** M001 — Full Spec Conformance
**Active Slice:** S07 — HTTP Dashboard and JSON API
**Active Task:** None
**Phase:** Planning

## Progress

- [x] S01: Domain Types and Error Foundation — 13 contract tests, all §4.1 types, AgentEvent enum, error categories
- [x] S02: Workflow Loader and Config Layer — 19 tests; parse_workflow, from_workflow, validate, WorkflowStore hot-reload all proven
- [x] S03: Linear Tracker Client — TrackerAdapter trait + LinearAdapter + 33 integration tests; all slice verification items pass; 80 total tests
- [x] S04: Workspace Manager and Prompt Builder — 28 tests; path_safety, prompt_builder, workspace modules; 111 total tests; R004+R007 validated
- [x] S05: Codex App-Server Client — 32 integration tests pass; approval, tool dispatch, user-input, token accounting all done; zero warnings
- [x] S06: Orchestrator Core — runtime authority loop + CLI bootstrap verified; orchestrator+cli conformance suites green
- [ ] S07: HTTP Dashboard and JSON API
- [ ] S08: SSH Remote Worker Extension
- [ ] S09: Conformance Sweep and Integration Polish

## Recent Decisions

- D036: Track normalized running issue states inside orchestrator state for deterministic per-state slot accounting
- D037: Preserve worker session IDs in orchestrator runtime state for retry/stall/completion diagnostics without widening domain structs yet
- D038: Emit JSON-structured CLI bootstrap lifecycle logs keyed by phase/stage/workflow_path for deterministic startup diagnostics

## Blockers

- None

## Next Action

Start S07 planning: define HTTP dashboard/API test contract and implement `http_server.rs` routes (`/`, `/api/v1/state`, `/api/v1/:issue`, `POST /api/v1/refresh`) using `OrchestratorSnapshot` as the source of truth.

## Validated Requirements

- R001 (WORKFLOW.md Parsing and Dynamic Reload) — S02
- R002 (Typed Config Layer) — S02
- R004 (Workspace Manager with Safety Invariants) — S04
- R005 (Codex App-Server Client) — S05: 32 tests; subprocess, handshake, turn streaming, approval, tool dispatch, user-input, token accounting
- R006 (Orchestrator State Machine) — S06: 14 orchestrator conformance tests passing
- R007 (Prompt Builder with Strict Liquid Rendering) — S04
- R008 (CLI Entry Point) — S06: CLI bootstrap/exit tests passing for default path, overrides, startup failures, and successful runtime start call-order
- R012 (linear_graphql dynamic tool) — S05: 14 tests; argument normalisation, GraphQL execution, error formatting
- R014 (Dispatch Preflight Validation) — S06: reconciliation continues while invalid-preflight deterministically skips dispatch
- R015 (Token Accounting and Rate Limit Tracking) — S05+S06: per-turn deltas plus aggregate codex totals/rate-limit snapshot accumulation proven
