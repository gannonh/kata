# S01: Domain Types and Error Foundation

**Goal:** All spec §4.1 domain types, §10.4 agent event enum, and §14.1 error categories are defined in `src/domain.rs` and `src/error.rs`. `cargo build` and `cargo test` pass cleanly. Downstream slices (S02–S09) can import every type they need from the `domain` and `error` modules.

**Demo:** `cargo build` succeeds. `cargo test` runs domain round-trip and default-value tests with all assertions passing.

## Must-Haves

- All spec §4.1.1–4.1.8 entities implemented as Rust structs in `src/domain.rs`
- `AgentEvent` enum (§10.4) with all 12 variants defined in `src/domain.rs`
- `OrchestratorSnapshot` read-only view struct for HTTP/JSON API consumption
- `CodexTotals` and `RateLimitInfo` aggregate types for token accounting
- All config structs have `Default` impls matching spec §5.3 defaults
- `ServerConfig::Default` sets `host: "127.0.0.1"` (fix existing divergence)
- `SymphonyError` covers all spec §14.1 failure classes with specific variants
- `Result<T>` alias exported from `error.rs`
- All types needed across `.await` boundaries are `Send + Sync` (verified by compile)
- `cargo build` passes with zero warnings
- `cargo test` passes with all assertions green

## Proof Level

- This slice proves: contract (type definitions compile, serialize/deserialize correctly, defaults match spec)
- Real runtime required: no
- Human/UAT required: no

## Verification

- `cargo build 2>&1 | grep -E "error|warning"` — zero errors, zero warnings
- `cargo test -- --nocapture` — all tests pass
- `tests/domain_tests.rs` — integration test file exercising:
  - `Issue` round-trip JSON serialization with all fields
  - `Issue` deserialization with missing optional fields (serde defaults)
  - `ServiceConfig` default values match spec §5.3
  - `ServerConfig::default().host == "127.0.0.1"`
  - `RunAttempt`, `LiveSession`, `RetryEntry` construction
  - `OrchestratorSnapshot` serialization produces valid JSON
  - `AgentEvent` variant construction and debug formatting
  - `SymphonyError` display messages are non-empty for each variant

## Observability / Diagnostics

- Runtime signals: None (this slice is pure type definitions, no runtime behavior)
- Inspection surfaces: `cargo test` output shows per-test pass/fail
- Failure visibility: Compiler errors and test assertion messages
- Redaction constraints: None

## Integration Closure

- Upstream surfaces consumed: none (foundation slice)
- New wiring introduced in this slice: `domain.rs` and `error.rs` modules exported via `lib.rs` — all downstream slices import from these
- What remains before the milestone is truly usable end-to-end: S02 (config parsing), S03 (Linear client), S04 (workspace), S05 (Codex client), S06 (orchestrator), S07 (HTTP), S08 (SSH), S09 (conformance)

## Tasks

- [x] **T01: Add runtime entity types and agent event enum** `est:30m`
  - Why: The existing `domain.rs` covers ~70% of spec §4.1 (Issue, WorkflowDefinition, ServiceConfig + sub-structs). The missing ~30% are runtime entities (§4.1.4–4.1.8) and agent events (§10.4) that S05/S06 need.
  - Files: `src/domain.rs`
  - Do: Add `Workspace` (§4.1.4), `RunAttempt` (§4.1.5), `LiveSession` (§4.1.6), `RetryEntry` (§4.1.7 — use `Option<String>` for timer_handle), `OrchestratorState` (§4.1.8), `OrchestratorSnapshot` (S06→S07 boundary), `CodexTotals`, `RateLimitInfo`, `AgentEvent` enum with all 12 variants from §10.4. Fix `ServerConfig::Default` to set `host: "127.0.0.1"`. Use `BTreeMap` for snapshot types that get serialized to API responses. All types derive `Debug, Clone`; serializable types also derive `Serialize, Deserialize`.
  - Verify: `cargo build` succeeds with zero errors and zero warnings
  - Done when: Every struct/enum from spec §4.1.1–4.1.8 plus `AgentEvent`, `OrchestratorSnapshot`, `CodexTotals`, and `RateLimitInfo` exists in `domain.rs` and compiles cleanly

- [x] **T02: Add domain contract tests** `est:25m`
  - Why: Types without tests are assumptions. Contract tests prove serialization round-trips, serde defaults, spec-mandated default values, and struct construction all work. Also creates the integration test file that downstream slices can extend.
  - Files: `tests/domain_tests.rs`, `src/domain.rs` (minor adjustments if tests reveal issues)
  - Do: Create `tests/domain_tests.rs` with tests: Issue JSON round-trip (all fields populated), Issue deserialization with missing optionals, ServiceConfig defaults match spec §5.3 values, ServerConfig::default().host == "127.0.0.1", RunAttempt/LiveSession/RetryEntry construction and field access, OrchestratorSnapshot serializes to valid JSON, AgentEvent variant construction, SymphonyError display strings are non-empty. Fix any issues the tests reveal.
  - Verify: `cargo test` — all tests pass
  - Done when: `tests/domain_tests.rs` exists with ≥8 test functions, all passing, covering every must-have in the slice verification section

## Files Likely Touched

- `src/domain.rs` — add runtime entity types, agent events, fix ServerConfig default
- `src/error.rs` — review/minor adjustments if needed
- `tests/domain_tests.rs` — new integration test file
