---
estimated_steps: 5
estimated_files: 5
---

# T03: Implement axum HTTP server routes and dashboard renderer

**Slice:** S07 — HTTP Dashboard and JSON API
**Milestone:** M001

## Description

Build the real HTTP extension surface: axum server, dashboard HTML, JSON endpoints, and API error handling semantics. This task ships the visible S07 capability and must be backed by real orchestrator snapshot data.

## Steps

1. Add axum dependency and create `src/http_server.rs` route composition with shared app state (snapshot handle + refresh sender).
2. Implement `GET /api/v1/state` returning current snapshot JSON and `GET /api/v1/:issue_identifier` projection over running/retry views.
3. Implement `POST /api/v1/refresh` that submits refresh requests via the control channel and returns `202` with queue/coalesce metadata.
4. Implement `GET /` dashboard renderer (server-generated HTML + static CSS + lightweight auto-refresh script reading `/api/v1/state`).
5. Implement API fallback + method-not-allowed handlers returning structured JSON envelopes and make `tests/http_server_tests.rs` green.

## Must-Haves

- [ ] `start_http_server(...)` exists and starts axum listener on provided host/port
- [ ] `/api/v1/state` and `/api/v1/:issue_identifier` are backed by live snapshot data (no hardcoded payloads)
- [ ] `/api/v1/:issue_identifier` returns `404 issue_not_found` JSON envelope for unknown issue identifiers
- [ ] `POST /api/v1/refresh` returns `202` with explicit queued/coalesced status from real control-path outcome
- [ ] API 404/405 responses are JSON envelopes with stable code/message/status fields
- [ ] `/` returns non-placeholder HTML dashboard that displays running/retry/token sections

## Verification

- `cargo test --test http_server_tests`
- Targeted assertion run for error paths: `cargo test --test http_server_tests api_error -- --nocapture`

## Observability Impact

- Signals added/changed: HTTP lifecycle + refresh endpoint request/coalesced diagnostics and issue-not-found diagnostic events.
- How a future agent inspects this: Use `/api/v1/state` and `/api/v1/:issue_identifier` directly; run HTTP integration tests for deterministic contract checks.
- Failure state exposed: Structured error envelopes make route/method/resource failures machine-readable and debuggable without log scraping.

## Inputs

- `src/orchestrator.rs` — snapshot/control handles introduced in T02
- `src/domain.rs` — serializable snapshot and issue/run/retry types
- `tests/http_server_tests.rs` — red contract suite from T01
- `.kata/milestones/M001/slices/S07/S07-RESEARCH.md` — spec parity for endpoint and envelope semantics

## Expected Output

- `src/http_server.rs` — full HTTP module implementation (routes + handlers + dashboard render)
- `Cargo.toml` — axum dependency entries required by HTTP server
- `src/lib.rs` — module export for HTTP server
- `tests/http_server_tests.rs` — all S07 endpoint contract assertions passing
- `src/domain.rs` — any minimal projection/support structs needed for issue endpoint response
