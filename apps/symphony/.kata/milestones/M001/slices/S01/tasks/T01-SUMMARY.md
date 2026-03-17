---
id: T01
parent: S01
milestone: M001
provides:
  - Workspace struct (§4.1.4)
  - RunAttempt struct with serde (§4.1.5)
  - LiveSession struct with 16 fields and serde defaults (§4.1.6)
  - RetryEntry struct with Option<String> timer_handle (§4.1.7)
  - OrchestratorState struct with HashMap/HashSet collections (§4.1.8)
  - OrchestratorSnapshot, RetrySnapshotEntry, PollingSnapshot for HTTP API (BTreeMap-based)
  - CodexTotals with Default impl, RateLimitInfo (opaque Value)
  - AgentEvent enum with all 12 variants from §10.4
  - ServerConfig::Default fix (host = "127.0.0.1")
key_files:
  - src/domain.rs
  - tests/domain_tests.rs
key_decisions:
  - "RetryEntry.timer_handle is Option<String> placeholder — concrete async type wired in S06"
  - "OrchestratorSnapshot uses BTreeMap for deterministic JSON serialization"
  - "AgentEvent variants carry variant-specific payload fields (not a single data bag)"
patterns_established:
  - "Runtime entities that cross async boundaries derive Debug, Clone only (no Serialize) unless needed for API/persistence"
  - "Snapshot types (serializable API views) are separate from mutable state types"
  - "BTreeMap in snapshot types for deterministic JSON key ordering"
observability_surfaces:
  - none (pure type definitions)
duration: 15min
verification_result: passed
completed_at: 2026-03-15T22:41:00Z
blocker_discovered: false
---

# T01: Add runtime entity types and agent event enum

**Added all spec §4.1.4–4.1.8 runtime entity structs, AgentEvent enum (12 variants), snapshot types with BTreeMap, and fixed ServerConfig::Default divergence**

## What Happened

Extended `src/domain.rs` with the remaining spec entities: Workspace, RunAttempt, LiveSession (16 fields with serde defaults for token counters), RetryEntry (Option<String> timer_handle placeholder), OrchestratorState (HashMap/HashSet-based mutable state), plus the serializable snapshot layer (OrchestratorSnapshot with BTreeMap, RetrySnapshotEntry, PollingSnapshot), aggregate types (CodexTotals with Default, RateLimitInfo as opaque Value), and the AgentEvent enum with all 12 variants carrying variant-specific payloads.

Fixed the ServerConfig::Default divergence — replaced the derived Default (empty host) with an explicit impl that sets host to "127.0.0.1", and removed the redundant `new()` method.

Created `tests/domain_tests.rs` as the integration test file for the slice, with 7 tests covering: ServerConfig default fix, RunAttempt round-trip serialization, LiveSession token default deserialization, RetryEntry construction, OrchestratorSnapshot deterministic serialization, AgentEvent variant construction (all 12), and CodexTotals default values.

## Verification

- `cargo build` — zero errors, zero warnings
- `cargo test --test domain_tests` — 7/7 tests pass
- `cargo test` — all tests pass across the project
- ServerConfig::default().host == "127.0.0.1" verified by dedicated test

### Slice-level verification status (intermediate — T01 of 2):
- ✓ `cargo build` zero errors/warnings
- ✓ `cargo test -- --nocapture` all tests pass
- ✓ ServerConfig::default().host == "127.0.0.1"
- ✓ RunAttempt, LiveSession, RetryEntry construction tests
- ✓ OrchestratorSnapshot serialization produces valid JSON
- ✓ AgentEvent variant construction and debug formatting
- ✗ Issue JSON round-trip (T02 scope)
- ✗ Issue deserialization with missing optionals (T02 scope)
- ✗ ServiceConfig defaults match spec §5.3 (T02 scope)
- ✗ SymphonyError display messages non-empty (T02 scope)

## Diagnostics

None — pure type definitions. Future agents inspect by reading `src/domain.rs`.

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/domain.rs` — Added Workspace, RunAttempt, LiveSession, RetryEntry, CodexTotals, RateLimitInfo, OrchestratorState, OrchestratorSnapshot, RetrySnapshotEntry, PollingSnapshot, AgentEvent enum; fixed ServerConfig Default impl
- `tests/domain_tests.rs` — New integration test file with 7 tests covering T01 must-haves
