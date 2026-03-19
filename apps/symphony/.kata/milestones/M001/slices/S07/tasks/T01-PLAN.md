---
estimated_steps: 5
estimated_files: 4
---

# T01: Author failing HTTP dashboard/API conformance tests

**Slice:** S07 — HTTP Dashboard and JSON API
**Milestone:** M001

## Description

Create the S07 red-suite first so route contracts, error semantics, and refresh behavior are locked before implementation. Tests should compile against minimal stubs and fail on meaningful assertions, proving the contract is executable.

## Steps

1. Add `tests/http_server_tests.rs` with deterministic fixtures for `OrchestratorSnapshot` and a fake refresh-control sink.
2. Write failing tests for `GET /`, `GET /api/v1/state`, `GET /api/v1/:issue_identifier` success + not-found behavior, and `POST /api/v1/refresh` queued/coalesced semantics.
3. Add failing tests for API fallback semantics: unknown API path returns JSON `404`, wrong method on known API route returns JSON `405`.
4. Add minimal `src/http_server.rs`/`src/lib.rs` compile surfaces required by the tests, without implementing route behavior yet.
5. Run targeted tests and confirm red-state failures are assertion-level contract gaps.

## Must-Haves

- [ ] `tests/http_server_tests.rs` exists with concrete assertions for all four S07 endpoints
- [ ] Tests explicitly assert JSON envelope shape for API `404` and `405`
- [ ] Tests include refresh duplicate-request case asserting coalesced/queued semantics
- [ ] Minimal HTTP module symbols compile so test failures are behavioral
- [ ] Red baseline is captured by failing assertions tied to unimplemented handlers

## Verification

- `cargo test --test http_server_tests`
- Confirm failures reference endpoint behavior assertions (not unresolved imports/syntax failures)

## Observability Impact

- Signals added/changed: Contract tests require explicit HTTP error code fields and refresh queue metadata that become durable diagnostics.
- How a future agent inspects this: `cargo test --test http_server_tests -- --nocapture` shows exact contract mismatch location.
- Failure state exposed: Route mismatch, envelope drift, and refresh-control regressions fail with endpoint-specific assertion messages.

## Inputs

- `.kata/milestones/M001/slices/S07/S07-RESEARCH.md` — endpoint/error contract + refresh coalescing expectations
- `.kata/milestones/M001/slices/S06/S06-SUMMARY.md` — snapshot and orchestrator boundary outputs available for projection
- `src/domain.rs` — `OrchestratorSnapshot` and related payload structs
- `tests/orchestrator_tests.rs` — existing deterministic async test patterns to reuse

## Expected Output

- `tests/http_server_tests.rs` — failing endpoint contract suite for S07
- `tests/cli_tests.rs` — optional placeholder assertions for upcoming runtime wiring seam
- `src/http_server.rs` — minimal stubbed module surface for compiler linkage
- `src/lib.rs` — exports `http_server` module
