# Kata State

**Active Milestone:** M001 — Full Spec Conformance
**Active Slice:** S06 — Orchestrator Core (next)
**Active Task:** T04 — Wire CLI bootstrap/shutdown semantics and finalize S06 verification
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

- D035: Establish dedicated S06 proof harness in `tests/orchestrator_tests.rs` and `tests/cli_tests.rs`
- D036: Track normalized running issue states inside orchestrator state for deterministic per-state slot accounting
- D037: Preserve worker session IDs in orchestrator runtime state for retry/stall/completion diagnostics without widening domain structs yet

## Blockers

- None

## Next Action

Execute S06/T04: wire CLI bootstrap validation + orchestrator startup flow so `tests/cli_tests.rs` passes, then re-run full slice gate (`cargo test --test orchestrator_tests --test cli_tests` and `cargo build`) to close S06.

## Validated Requirements

- R001 (WORKFLOW.md Parsing and Dynamic Reload) — S02
- R002 (Typed Config Layer) — S02
- R004 (Workspace Manager with Safety Invariants) — S04
- R005 (Codex App-Server Client) — S05: 32 tests; subprocess, handshake, turn streaming, approval, tool dispatch, user-input, token accounting
- R007 (Prompt Builder with Strict Liquid Rendering) — S04
- R012 (linear_graphql dynamic tool) — S05: 14 tests; argument normalisation, GraphQL execution, error formatting
