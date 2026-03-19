# Kata State

**Active Milestone:** M001 — Full Spec Conformance
**Active Slice:** S08 — SSH Remote Worker Extension
**Active Task:** T01 — Author failing SSH extension conformance tests
**Phase:** Ready for Implementation

## Progress

- [x] S01: Domain Types and Error Foundation — 13 contract tests, all §4.1 types, AgentEvent enum, error categories
- [x] S02: Workflow Loader and Config Layer — 19 tests; parse_workflow, from_workflow, validate, WorkflowStore hot-reload all proven
- [x] S03: Linear Tracker Client — TrackerAdapter trait + LinearAdapter + 33 integration tests; all slice verification items pass; 80 total tests
- [x] S04: Workspace Manager and Prompt Builder — 28 tests; path_safety, prompt_builder, workspace modules; 111 total tests; R004+R007 validated
- [x] S05: Codex App-Server Client — 32 integration tests pass; approval, tool dispatch, user-input, token accounting all done; zero warnings
- [x] S06: Orchestrator Core — runtime authority loop + CLI bootstrap verified; orchestrator+cli conformance suites green
- [x] S07: HTTP Dashboard and JSON API
- [ ] S08: SSH Remote Worker Extension
- [ ] S09: Conformance Sweep and Integration Polish

## Recent Decisions

- D042: Emit explicit HTTP startup decision events (`http_server_enabled` / `http_server_disabled`) for runtime wiring observability
- D043: Use a dedicated S08 proof gate: `tests/ssh_tests.rs` plus SSH-focused extensions to workspace/codex/orchestrator suites
- D044: Preserve one shared Codex JSON-RPC loop and swap only the launch transport/workspace path for SSH workers

## Blockers

- None

## Next Action

Execute T01: add the failing SSH extension conformance harness (`tests/ssh_tests.rs` plus workspace/codex/orchestrator coverage) so S08 implementation is driven by Appendix A contracts.

## Validated Requirements

- R001 (WORKFLOW.md Parsing and Dynamic Reload) — S02
- R002 (Typed Config Layer) — S02
- R004 (Workspace Manager with Safety Invariants) — S04
- R005 (Codex App-Server Client) — S05: 32 tests; subprocess, handshake, turn streaming, approval, tool dispatch, user-input, token accounting
- R006 (Orchestrator State Machine) — S06: 14 orchestrator conformance tests passing
- R007 (Prompt Builder with Strict Liquid Rendering) — S04
- R008 (CLI Entry Point) — S06: CLI bootstrap/exit tests passing for default path, overrides, startup failures, and successful runtime start call-order
- R010 (HTTP Observability Server) — S07: dashboard/API contract tests and CLI HTTP binding precedence tests passing
- R012 (linear_graphql dynamic tool) — S05: 14 tests; argument normalisation, GraphQL execution, error formatting
- R014 (Dispatch Preflight Validation) — S06: reconciliation continues while invalid-preflight deterministically skips dispatch
- R015 (Token Accounting and Rate Limit Tracking) — S05+S06+S07: per-turn deltas plus aggregate snapshot exposure via HTTP state/dashboard proven
