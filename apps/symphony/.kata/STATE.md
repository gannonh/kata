# Kata State

**Active Milestone:** M001 — Full Spec Conformance
**Active Slice:** S06 — Orchestrator Core (next)
**Active Task:** T02 — Implement orchestrator authority loop, reconciliation, and dispatch gating
**Phase:** Executing

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

- D033: Add explicit orchestrator runtime seam and deterministic test doubles for S06 operational proof
- D034: Protect retry queue from stale timer firings via token/nonce matching
- D035: Establish dedicated S06 proof harness in `tests/orchestrator_tests.rs` and `tests/cli_tests.rs`

## Blockers

- None

## Next Action

Execute S06/T02: implement reconcile → validate → dispatch ordering, preflight validation skip behavior, candidate ordering/gating, startup terminal cleanup state updates, and pre-dispatch refresh so `tests/orchestrator_tests.rs` and `tests/cli_tests.rs` begin turning green from the current red baseline.

## Validated Requirements

- R001 (WORKFLOW.md Parsing and Dynamic Reload) — S02
- R002 (Typed Config Layer) — S02
- R004 (Workspace Manager with Safety Invariants) — S04
- R005 (Codex App-Server Client) — S05: 32 tests; subprocess, handshake, turn streaming, approval, tool dispatch, user-input, token accounting
- R007 (Prompt Builder with Strict Liquid Rendering) — S04
- R012 (linear_graphql dynamic tool) — S05: 14 tests; argument normalisation, GraphQL execution, error formatting
