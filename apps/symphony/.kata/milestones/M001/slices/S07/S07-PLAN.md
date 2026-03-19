# S07: HTTP Dashboard and JSON API

**Goal:** Add a production-real HTTP observability surface that serves a live HTML dashboard at `/` and JSON API endpoints at `/api/v1/state`, `/api/v1/:issue_identifier`, and `POST /api/v1/refresh`, wired to real orchestrator runtime state/control.
**Demo:** Running `symphony WORKFLOW.md --port 8080` exposes the dashboard + API, and `cargo test --test http_server_tests --test cli_tests` proves endpoint contracts, 404/405 JSON error envelopes, and refresh-trigger behavior.

## Must-Haves

- `src/http_server.rs` exists and exports `start_http_server(state_handle, port, host)` using axum
- `GET /` returns server-rendered HTML dashboard that renders real orchestrator snapshot fields (running, retry queue, codex totals/rate-limits)
- `GET /api/v1/state` returns current `OrchestratorSnapshot` JSON (not stubbed payloads)
- `GET /api/v1/:issue_identifier` resolves issue details from current snapshot (running/retry) and returns `404 issue_not_found` envelope when absent
- `POST /api/v1/refresh` triggers best-effort refresh signaling into orchestrator and returns `202` with queue/coalesce metadata
- API routes return JSON error envelopes for `404` and `405` (spec §13.7.2 parity)
- CLI `--port` override still takes precedence over workflow `server.port`; host default remains `127.0.0.1`
- HTTP layer preserves D002 single-authority model: handlers read snapshots + send refresh signal only (no direct orchestrator mutation)

## Requirement Coverage (Active requirements this slice owns/supports)

- **Owned:**
  - **R010 HTTP Observability Server** → T01, T03, T04 (verified by `tests/http_server_tests.rs` + CLI wiring assertions)
- **Supporting:**
  - **R015 Token Accounting and Rate Limit Tracking** → T02, T03 (verified by `/api/v1/state` and dashboard projections of `codex_totals` + `codex_rate_limits` from real snapshots)

## Proof Level

- This slice proves: operational (real runtime composition of orchestrator control/state with HTTP routes and dashboard rendering)
- Real runtime required: yes
- Human/UAT required: no

## Verification

- `tests/http_server_tests.rs` (created in T01) with real assertions for:
  - `GET /` returns HTML dashboard shell and includes rendered state sections
  - `GET /api/v1/state` returns snapshot JSON with running/retry/totals/rate-limits
  - `GET /api/v1/:issue_identifier` returns issue projection for known issue and `404 issue_not_found` envelope for unknown issue
  - `POST /api/v1/refresh` returns `202` and reports `queued/coalesced` behavior under repeated calls
  - API `404` fallback and `405` method mismatch return JSON envelopes with stable error code/message shape
- `tests/cli_tests.rs` updates asserting:
  - HTTP server boot wiring when effective port is configured
  - CLI `--port` precedence over workflow config is preserved
- `cargo test --test http_server_tests --test cli_tests`
- `cargo build`

## Observability / Diagnostics

- Runtime signals: structured events for HTTP lifecycle (`http_server_started`, `http_refresh_requested`, `http_refresh_coalesced`, `http_issue_not_found`) with safe identifiers only
- Inspection surfaces: `/api/v1/state` for machine inspection, `/api/v1/:issue_identifier` for focused issue diagnostics, `/` dashboard for operator visual scan
- Failure visibility: API error envelopes include stable code/message/status; refresh endpoint returns queue/coalesce status so operators can detect dropped duplicate refresh intent
- Redaction constraints: never log or expose tracker API keys, prompt content, or raw auth headers; only expose snapshot-safe identifiers and aggregate metrics

## Integration Closure

- Upstream surfaces consumed:
  - `src/orchestrator.rs` snapshot/control seam from S06
  - `src/domain.rs` (`OrchestratorSnapshot`, `RunAttempt`, retry snapshot/totals/rate-limit types)
  - `src/main.rs` CLI effective config + runtime startup path
- New wiring introduced in this slice:
  - axum HTTP server module + route handlers + dashboard renderer
  - orchestrator refresh-control channel exposed to HTTP handlers
  - main runtime composition that runs orchestrator loop and optional HTTP server concurrently
- What remains before the milestone is truly usable end-to-end:
  - S08 SSH remote worker extension
  - S09 full §17 conformance sweep + README polish

## Tasks

- [ ] **T01: Author failing HTTP dashboard/API conformance tests** `est:45m`
  - Why: Lock S07 route/error/refresh contracts first so implementation is driven by executable behavior, not ad hoc manual checks.
  - Files: `tests/http_server_tests.rs`, `tests/cli_tests.rs`, `src/http_server.rs`, `src/lib.rs`
  - Do: Add a red-suite covering `/`, `/api/v1/state`, `/api/v1/:issue_identifier`, `POST /api/v1/refresh`, plus API 404/405 envelopes and refresh coalescing assertions; add minimal module stubs so tests compile and fail behaviorally.
  - Verify: `cargo test --test http_server_tests --test cli_tests` (expected failing assertions for unimplemented HTTP behavior)
  - Done when: Contract tests exist with concrete assertions for all S07 must-haves and failures are behavioral (not missing-symbol compile failures).

- [ ] **T02: Add orchestrator snapshot handle + refresh control seam** `est:60m`
  - Why: HTTP handlers need read/control access without violating D002 single-authority ownership; this seam is the core S06→S07 boundary closure.
  - Files: `src/orchestrator.rs`, `src/domain.rs`, `tests/orchestrator_tests.rs`, `tests/http_server_tests.rs`
  - Do: Introduce orchestrator-owned snapshot publication and best-effort refresh request ingestion (with duplicate coalescing semantics), keeping all mutable scheduler state inside orchestrator; expose read-only/control handles for HTTP use.
  - Verify: `cargo test --test orchestrator_tests refresh -- --nocapture` and targeted `http_server_tests` control-seam cases
  - Done when: Refresh requests can be signaled externally, duplicate refresh bursts coalesce deterministically, and published snapshots stay the single source for HTTP responses.

- [ ] **T03: Implement axum HTTP server routes and dashboard renderer** `est:75m`
  - Why: This delivers the user-visible product increment for R010 (real API + real dashboard), consuming orchestrator state directly.
  - Files: `src/http_server.rs`, `src/lib.rs`, `Cargo.toml`, `tests/http_server_tests.rs`, `src/domain.rs`
  - Do: Implement route handlers for `/`, `/api/v1/state`, `/api/v1/:issue_identifier`, and `POST /api/v1/refresh`; add API fallback/405 JSON envelopes; render server-side HTML dashboard with lightweight polling and real totals/retry/running fields.
  - Verify: `cargo test --test http_server_tests`
  - Done when: All HTTP contract tests pass, dashboard HTML is non-placeholder and backed by live snapshot data, and API errors are structured/typed.

- [ ] **T04: Wire CLI runtime composition and finalize slice verification** `est:45m`
  - Why: S07 is incomplete until the binary actually composes orchestrator + optional HTTP server using effective config and CLI overrides.
  - Files: `src/main.rs`, `src/http_server.rs`, `tests/cli_tests.rs`, `tests/http_server_tests.rs`
  - Do: Update runtime startup to launch orchestrator loop and HTTP server concurrently when effective port is set, preserve `--port` override precedence, and ensure graceful shutdown semantics cover both tasks.
  - Verify: `cargo test --test cli_tests --test http_server_tests` and `cargo build`
  - Done when: CLI tests prove startup/wiring/override semantics and full S07 verification suite is green.

## Files Likely Touched

- `src/http_server.rs`
- `src/main.rs`
- `src/orchestrator.rs`
- `src/domain.rs`
- `src/lib.rs`
- `tests/http_server_tests.rs`
- `tests/cli_tests.rs`
- `tests/orchestrator_tests.rs`
- `Cargo.toml`
