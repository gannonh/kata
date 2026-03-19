# Kata State

**Active Milestone:** M001 — Full Spec Conformance
**Active Slice:** S08 — SSH Remote Worker Extension (COMPLETE)
**Active Task:** T04 — DONE
**Phase:** Slice Complete — ready for S09

## Progress

- [x] S01: Domain Types and Error Foundation — 13 contract tests, all §4.1 types, AgentEvent enum, error categories
- [x] S02: Workflow Loader and Config Layer — 19 tests; parse_workflow, from_workflow, validate, WorkflowStore hot-reload all proven
- [x] S03: Linear Tracker Client — TrackerAdapter trait + LinearAdapter + 33 integration tests; all slice verification items pass; 80 total tests
- [x] S04: Workspace Manager and Prompt Builder — 28 tests; path_safety, prompt_builder, workspace modules; 111 total tests; R004+R007 validated
- [x] S05: Codex App-Server Client — 32 integration tests pass; approval, tool dispatch, user-input, token accounting all done; zero warnings
- [x] S06: Orchestrator Core — runtime authority loop + CLI bootstrap verified; orchestrator+cli conformance suites green
- [x] S07: HTTP Dashboard and JSON API
- [x] S08: SSH Remote Worker Extension
- [ ] S09: Conformance Sweep and Integration Polish

## Recent Decisions

- D040: Standardize API error envelopes with stable `error.code`, `error.message`, and `error.status` fields
- D041: Establish dedicated `tests/http_server_tests.rs` red→green harness as the slice-level HTTP contract gate
- D042: Emit explicit HTTP startup decision events (`http_server_enabled` / `http_server_disabled`) for runtime wiring observability
- D043: SSH host selection uses WorkerHostSelection enum (Local/Remote/NoneAvailable) in ssh.rs; NoneAvailable blocks dispatch without local fallback
- D044: Remote workspace validation skips local FS canonicalization; validates only non-empty + absolute path string

## Blockers

- None

## Next Action

Execute S08/T01: create `tests/ssh_tests.rs` (15 red tests) and `src/ssh.rs` stubs with `WorkerHostSelection` enum and `SymphonyError::SshLaunchFailed`.

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
