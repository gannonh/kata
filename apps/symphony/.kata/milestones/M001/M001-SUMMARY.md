# M001: Full Spec Conformance — Milestone Summary

## Completed Slices

### S01: Domain Types and Error Foundation
All §4.1 domain types (Issue, BlockerRef, WorkflowDefinition, ServiceConfig, OrchestratorState, AgentEvent, etc.), SymphonyError enum with core error categories, and redacted API-key debug behavior. 13 contract tests.

### S02: Workflow Loader and Config Layer
WORKFLOW.md parsing, typed config extraction/defaulting/env resolution, strict validation helpers, and WorkflowStore hot-reload with last-known-good semantics. 19 tests.

### S03: Linear Tracker Client
Linear GraphQL client + TrackerAdapter implementation: candidate fetch pagination, fetch-by-states/ids, normalization, assignee filtering, and terminal-state fetch support. 33 integration tests.

### S04: Workspace Manager and Prompt Builder
Workspace isolation/safety invariants, lifecycle hooks with timeout enforcement, and strict Liquid prompt rendering from issue/attempt context. 28 tests.

### S05: Codex App-Server Client
Codex subprocess protocol integration: handshake, turn streaming, tool/approval/user-input handling, and per-turn token/rate-limit extraction. 32 tests.

### S06: Orchestrator Core
Runtime control-loop + CLI bootstrap: reconcile→validate→dispatch sequencing, startup terminal cleanup, candidate gating/order, global+per-state concurrency caps, retry/stall recovery, stale retry suppression, aggregate codex totals/rate-limit snapshot accounting, and deterministic startup failure semantics. 14 orchestrator + 5 CLI conformance tests.

## Cumulative Stats

- 162 slice-level tests across S01–S06 proof suites (minimum tracked total)
- Validated requirements: R001, R002, R004, R005, R006, R007, R008, R012, R014, R015
- Active requirements remaining: R003, R009, R010, R011, R013

## Next

S07: HTTP Dashboard and JSON API — expose `OrchestratorSnapshot` via axum routes (`/`, `/api/v1/state`, `/api/v1/:issue`, `POST /api/v1/refresh`) with operator-focused diagnostics preserved from S06.