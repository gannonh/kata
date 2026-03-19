---
id: T01
parent: S07
milestone: M001
provides:
  - Red-first HTTP conformance suite that locks S07 contracts for dashboard HTML, state/issue APIs, refresh coalescing, and API 404/405 envelope semantics
key_files:
  - tests/http_server_tests.rs
  - src/http_server.rs
  - src/lib.rs
  - Cargo.toml
  - .kata/milestones/M001/slices/S07/S07-PLAN.md
key_decisions:
  - "Kept HTTP module intentionally stubbed while exposing stable router/state/control surfaces so failures stay assertion-level and implementation work shifts to T02/T03"
patterns_established:
  - "Contract-first HTTP testing pattern: deterministic snapshot fixture + fake refresh sink + route-level assertions before runtime handler implementation"
observability_surfaces:
  - "cargo test --test http_server_tests -- --nocapture (endpoint-specific mismatch assertions)"
  - "JSON error-envelope assertions (`error.code`, `error.message`, `error.status`) for API 404/405"
  - "Refresh queue/coalesce assertion pair proving duplicate refresh intent handling contract"
duration: 52m
verification_result: passed
completed_at: 2026-03-19T18:16:00Z
blocker_discovered: false
---

# T01: Author failing HTTP dashboard/API conformance tests

**Added a deterministic red-suite for all S07 HTTP endpoints and introduced minimal HTTP module compile seams so failures are behavioral contract mismatches, not missing-symbol errors.**

## What Happened

Implemented the S07 contract test harness in `tests/http_server_tests.rs` with deterministic fixtures for `OrchestratorSnapshot` and a fake refresh-control sink. The suite now asserts:

- `GET /` HTML dashboard shell expectations (title + state sections)
- `GET /api/v1/state` snapshot projection expectations (running, retry queue, totals, rate-limits, polling)
- `GET /api/v1/:issue_identifier` known-issue projection and unknown-issue `404 issue_not_found` envelope
- `POST /api/v1/refresh` duplicate request semantics (`queued` then `coalesced`)
- API fallback contracts for unknown path `404` and wrong-method `405`, both with stable JSON envelope fields

Added minimal compile surfaces in `src/http_server.rs` and exported the module via `src/lib.rs` so tests compile cleanly while handlers remain intentionally stubbed. Added `axum` + `tower` dependencies required for router and integration-style request assertions.

Marked T01 done in `S07-PLAN.md` after confirming red-state behavior is assertion-driven.

## Verification

Executed required task and slice verification commands:

- `cargo test --test http_server_tests` ✅ expected red baseline (7/7 failing assertions tied to endpoint contract gaps)
  - Representative failures:
    - dashboard shell missing expected heading/sections
    - `/api/v1/state` payload missing expected snapshot shape
    - unknown issue path returning wrong status/envelope
    - refresh semantics returning wrong queued/coalesced values
    - 404/405 envelope `error.code` mismatch
- `cargo test --test http_server_tests --test cli_tests` ✅ partial-slice verification outcome
  - `cli_tests`: 6/6 passed
  - `http_server_tests`: expected assertion-level failures (red)
- `cargo build` ✅ passes with new HTTP module surfaces linked

All failures are behavioral assertions from the new contract suite (no unresolved imports, syntax errors, or missing module symbols).

## Diagnostics

Use these to inspect contract drift during T02/T03 implementation:

- `cargo test --test http_server_tests -- --nocapture`
- `cargo test --test http_server_tests test_unknown_api_path_returns_json_404_error_envelope -- --nocapture`
- `cargo test --test http_server_tests test_post_refresh_reports_queued_then_coalesced_state -- --nocapture`

The failing assertions identify exact contract gaps by endpoint and field (`error.code`, `error.status`, snapshot keys, refresh queue flags).

## Deviations

None.

## Known Issues

- `src/http_server.rs` currently contains intentional stub responses (`TODO` payloads / placeholder error codes). This is expected for T01 and will be replaced in T02/T03.

## Files Created/Modified

- `tests/http_server_tests.rs` — new deterministic red-suite covering all S07 endpoint/error/refresh contracts.
- `src/http_server.rs` — minimal HTTP module surface (router/state/control traits + stub handlers) for compile linkage.
- `src/lib.rs` — exports `http_server` module for integration tests.
- `Cargo.toml` — adds `axum` (runtime) and `tower` util (test request driving).
- `.kata/milestones/M001/slices/S07/S07-PLAN.md` — marks T01 as complete.
