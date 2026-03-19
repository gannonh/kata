---
id: T03
parent: S07
milestone: M001
provides:
  - Real axum HTTP routes for `/`, `/api/v1/state`, `/api/v1/:issue_identifier`, and `POST /api/v1/refresh`
  - Snapshot-backed JSON state projection with flattened `codex_rate_limits` payloads
  - Issue projection endpoint over running/retry snapshot views with deterministic `issue_not_found` handling
  - API-wide structured 404/405 envelopes with stable `error.code`, `error.message`, and `error.status`
  - Server-rendered dashboard HTML shell with live polling against `/api/v1/state`
key_files:
  - src/http_server.rs
  - .kata/milestones/M001/slices/S07/S07-PLAN.md
key_decisions:
  - "Kept issue lookup route broad (`/api/v1/:issue_identifier`) but enforced identifier-shape validation in-handler so malformed API paths resolve to generic `not_found` instead of `issue_not_found`."
patterns_established:
  - "Snapshot projection pattern: HTTP responses are derived from `OrchestratorSnapshot` and never mutate orchestrator-owned runtime state."
  - "Structured envelope pattern for API failures: single reusable JSON shape across route-fallback and method-mismatch paths."
observability_surfaces:
  - "`GET /api/v1/state` machine-readable runtime snapshot"
  - "`GET /api/v1/:issue_identifier` focused issue diagnostics"
  - "`POST /api/v1/refresh` queued/coalesced control-path status"
  - "Structured tracing events: `http_server_started`, `http_refresh_requested`, `http_refresh_coalesced`, `http_issue_not_found`"
duration: 45min
verification_result: passed
completed_at: 2026-03-19T13:18:15Z
blocker_discovered: false
---

# T03: Implement axum HTTP server routes and dashboard renderer

**Delivered the full S07 HTTP surface in axum with live snapshot-backed APIs, structured API error semantics, and a non-placeholder dashboard that auto-refreshes from runtime state.**

## What Happened

Implemented `src/http_server.rs` end-to-end, replacing T01 stub handlers with real route behavior. `GET /api/v1/state` now returns a direct projection of the orchestrator snapshot (including running/retry/totals/polling) and flattens `codex_rate_limits` to the expected API shape.

`GET /api/v1/:issue_identifier` now resolves known issues from live snapshot `running` and `retry_queue` views, returns issue projections under `issue`, and emits `404 issue_not_found` envelopes when identifiers are valid-but-unknown. To satisfy the route/fallback contract, malformed identifiers are treated as path misses and return generic `not_found` envelopes.

`POST /api/v1/refresh` is wired to the real refresh control seam and returns `202` with actual queued/coalesced metadata from the orchestrator refresh channel outcome. Added structured tracing events for server startup, refresh queued/coalesced outcomes, and issue-not-found diagnostics.

Replaced the placeholder root HTML with a real server-rendered dashboard shell (`Symphony Dashboard`) that renders running/retry/token sections and includes a lightweight polling script to refresh view state from `/api/v1/state` every two seconds.

## Verification

- `cargo test --test http_server_tests -- --nocapture` ✅ (7/7 passing)
- `cargo test --test http_server_tests api_error -- --nocapture` ✅ command succeeds (no matching tests in current naming set)
- Slice-level verification subset for this task:
  - `cargo test --test http_server_tests --test cli_tests` ✅
  - `cargo build` ✅

## Diagnostics

- API inspection surface: `GET /api/v1/state`
- Focused issue inspection: `GET /api/v1/:issue_identifier`
- Control-path status inspection: `POST /api/v1/refresh` response fields `queued`, `coalesced`, `pending_requests`
- Runtime event hooks for future debugging:
  - `http_server_started`
  - `http_refresh_requested`
  - `http_refresh_coalesced`
  - `http_issue_not_found`

## Deviations

- The plan’s expected output listed `Cargo.toml` and possibly `src/domain.rs`; no dependency or domain-model additions were required because `axum` and supporting snapshot types were already in place from T01/T02.

## Known Issues

- None.

## Files Created/Modified

- `src/http_server.rs` — implemented full axum router/handlers, dashboard renderer, API projections, refresh control response, and JSON error envelope semantics.
- `.kata/milestones/M001/slices/S07/S07-PLAN.md` — marked T03 complete.
