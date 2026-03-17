---
id: S01
parent: M001
milestone: M001
provides:
  - All spec §4.1.1–4.1.8 domain structs (Issue, WorkflowDefinition, ServiceConfig, Workspace, RunAttempt, LiveSession, RetryEntry, OrchestratorState)
  - OrchestratorSnapshot, RetrySnapshotEntry, PollingSnapshot (BTreeMap-based API views)
  - CodexTotals, RateLimitInfo aggregate types
  - AgentEvent enum with all 12 §10.4 variants
  - SymphonyError enum covering all §14.1 failure classes with Result<T> alias
  - ServerConfig::Default fix (host = "127.0.0.1")
  - 13 integration tests in tests/domain_tests.rs
requires: []
affects:
  - S02
  - S03
  - S04
  - S05
  - S06
key_files:
  - src/domain.rs
  - src/error.rs
  - tests/domain_tests.rs
key_decisions:
  - "D008: RetryEntry.timer_handle is Option<String> placeholder — concrete async type wired in S06"
  - "D009: BTreeMap for snapshot types (deterministic JSON key ordering)"
  - "D010: AgentEvent per-variant typed payloads (not a single data bag)"
  - "D011: Mutable state vs API view separation (OrchestratorState vs OrchestratorSnapshot)"
patterns_established:
  - "Runtime entities crossing async boundaries derive Debug, Clone only; Serialize added only for API/persistence types"
  - "Snapshot types (serializable API views) are separate from mutable state types"
  - "BTreeMap in snapshot types for deterministic JSON key ordering"
  - "Integration tests live in tests/domain_tests.rs; test names prefixed with test_; each test is self-contained"
observability_surfaces:
  - none (pure type definitions — no runtime behavior)
drill_down_paths:
  - .kata/milestones/M001/slices/S01/tasks/T01-SUMMARY.md
  - .kata/milestones/M001/slices/S01/tasks/T02-SUMMARY.md
duration: 23min
verification_result: passed
completed_at: 2026-03-15T23:47:00Z
---

# S01: Domain Types and Error Foundation

**All spec §4.1 domain types, §10.4 agent event enum, §14.1 error categories, and 13 contract tests — foundation for every downstream slice**

## What Happened

T01 extended `src/domain.rs` with the remaining spec entities not covered by the initial scaffold: Workspace (§4.1.4), RunAttempt (§4.1.5), LiveSession with 16 fields and serde defaults (§4.1.6), RetryEntry with Option<String> timer_handle placeholder (§4.1.7), OrchestratorState with HashMap/HashSet collections (§4.1.8). Added the serializable API layer — OrchestratorSnapshot, RetrySnapshotEntry, PollingSnapshot — using BTreeMap for deterministic JSON ordering. Added CodexTotals with Default impl and RateLimitInfo as opaque serde_json::Value. Defined AgentEvent enum with all 12 variants carrying typed per-variant payloads. Fixed the ServerConfig::Default divergence (was empty string, now "127.0.0.1"). Created initial 7 tests.

T02 rewrote `tests/domain_tests.rs` to a complete 13-test suite covering every slice verification item: Issue JSON round-trip, Issue serde defaults for missing optionals, assigned_to_worker default_true behavior, all ServiceConfig spec §5.3 defaults, ServerConfig host fix, RunAttempt serialization round-trip, LiveSession token defaults, RetryEntry construction, OrchestratorSnapshot deterministic serialization, AgentEvent all 12 variants, CodexTotals defaults, Workspace construction, and SymphonyError display across all 5 failure classes.

## Verification

- `cargo build` — zero errors, zero warnings
- `cargo test` — 13/13 tests pass
- Issue JSON round-trip with all fields ✓
- Issue deserialization with missing optionals (serde defaults) ✓
- ServiceConfig defaults match spec §5.3 ✓
- ServerConfig::default().host == "127.0.0.1" ✓
- RunAttempt, LiveSession, RetryEntry construction ✓
- OrchestratorSnapshot serialization produces valid JSON ✓
- AgentEvent variant construction and debug formatting ✓
- SymphonyError display messages non-empty for each variant ✓

## Requirements Advanced

- R013 (Spec-Driven Test Suite) — 13 contract tests established; tests/domain_tests.rs is the foundation file for downstream slices to extend

## Requirements Validated

- none — this slice defines types only; runtime validation happens in consuming slices

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

T02 added 5 extra tests beyond the minimum 8 (total 13): `test_issue_assigned_to_worker_defaults_true`, `test_workspace_construction`, and expanded coverage of existing test areas. Net positive — better coverage at negligible cost.

## Known Limitations

- `RetryEntry.timer_handle` is `Option<String>` — a placeholder until S06 wires the real async timer type
- `RateLimitInfo` is an opaque `serde_json::Value` — structured extraction deferred to S05 when the Codex protocol shape is known
- No runtime behavior exists yet — all types are data definitions only

## Follow-ups

- none

## Files Created/Modified

- `src/domain.rs` — Added Workspace, RunAttempt, LiveSession, RetryEntry, CodexTotals, RateLimitInfo, OrchestratorState, OrchestratorSnapshot, RetrySnapshotEntry, PollingSnapshot, AgentEvent enum; fixed ServerConfig Default impl
- `tests/domain_tests.rs` — 13 integration tests covering full slice verification checklist

## Forward Intelligence

### What the next slice should know
- All domain types are in `src/domain.rs` and re-exported via `lib.rs`. Import with `use symphony::domain::*`.
- `ServiceConfig` default values are spec §5.3 compliant — downstream code can rely on `Default::default()` producing valid configs.
- `WorkflowDefinition` has `prompt: String` and `config: ServiceConfig` — S02 needs to parse YAML front matter into this structure.

### What's fragile
- `LiveSession` has 16 fields with serde defaults for token counters — if the Codex protocol changes field names, deserialization tests will catch it but the struct may need updating in S05.
- `RetryEntry.timer_handle` is a placeholder `Option<String>` — S06 must replace this when wiring the async orchestrator loop.

### Authoritative diagnostics
- `cargo test --test domain_tests` — runs all 13 contract tests; any type change that breaks serialization or defaults shows up here immediately.

### What assumptions changed
- Initial scaffold had ~70% of spec types — actual gap was larger than expected due to runtime entities and snapshot types, but all were straightforward additions.
