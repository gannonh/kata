---
id: S07
parent: M001
milestone: M001
provides:
  - Live axum HTTP observability surface with dashboard and JSON API wired to real orchestrator snapshots
  - Refresh control endpoint with deterministic queued/coalesced semantics and no direct scheduler mutation
  - Stable API error-envelope behavior for 404/405 and unknown issue lookups
requires:
  - slice: S06
    provides: Orchestrator snapshot publication and refresh control seam consumed by HTTP handlers
affects:
  - S09
key_files:
  - src/http_server.rs
  - src/main.rs
  - src/orchestrator.rs
  - tests/http_server_tests.rs
  - tests/cli_tests.rs
  - .kata/REQUIREMENTS.md
key_decisions:
  - "D039: Preserve single-authority orchestration by limiting HTTP to snapshot reads + refresh signaling"
  - "D040: Standardize API error envelopes with stable code/message/status fields"
  - "D042: Emit explicit HTTP enabled/disabled startup events for runtime wiring diagnostics"
patterns_established:
  - "Contract-first HTTP delivery: red route tests first, then green implementation against fixed endpoint contracts"
  - "Snapshot projection pattern: API and dashboard responses derive from OrchestratorSnapshot only"
observability_surfaces:
  - "GET /api/v1/state"
  - "GET /api/v1/:issue_identifier"
  - "POST /api/v1/refresh"
  - "Structured events: http_server_started, http_refresh_requested, http_refresh_coalesced, http_issue_not_found, http_server_enabled/http_server_disabled"
drill_down_paths:
  - .kata/milestones/M001/slices/S07/tasks/T01-SUMMARY.md
  - .kata/milestones/M001/slices/S07/tasks/T02-SUMMARY.md
  - .kata/milestones/M001/slices/S07/tasks/T03-SUMMARY.md
  - .kata/milestones/M001/slices/S07/tasks/T04-SUMMARY.md
duration: 3h
verification_result: passed
completed_at: 2026-03-19T19:00:00Z
---

# S07: HTTP Dashboard and JSON API

**Shipped a production-real HTTP observability layer that exposes live dashboard + JSON state/control endpoints from orchestrator-owned runtime state.**

## What Happened

S07 was completed as a contract-first slice. T01 established a failing integration suite for all required routes, API envelopes, and refresh semantics. T02 added the orchestrator boundary seam (snapshot handle + coalescing refresh channel) so HTTP reads and control requests remain outside mutable scheduler ownership. T03 implemented the real axum handlers and dashboard rendering over live snapshot data. T04 finished CLI runtime composition so orchestrator + optional HTTP server launch together with deterministic shutdown and explicit startup diagnostics.

The resulting server now satisfies the slice contract:
- `GET /` serves a real dashboard shell with state sections and polling behavior
- `GET /api/v1/state` returns live orchestrator snapshot projections (running, retry queue, token totals, rate limits)
- `GET /api/v1/:issue_identifier` resolves issue details or returns `404 issue_not_found`
- `POST /api/v1/refresh` signals orchestrator refresh and reports queued/coalesced outcomes
- API fallback and method mismatch return stable JSON error envelopes

## Verification

- `cargo test --test http_server_tests --test cli_tests` ✅
  - `http_server_tests`: 7 passed
  - `cli_tests`: 9 passed
- `cargo build` ✅

These checks verify endpoint behavior, envelope shape, refresh coalescing semantics, and CLI `--port` precedence over workflow server config.

## Requirements Advanced

- R015 — S07 consumed the existing token/rate-limit snapshot accounting by projecting it through dashboard and `/api/v1/state` operator surfaces.

## Requirements Validated

- R010 — HTTP observability server is now proven by passing route-contract and CLI wiring tests (`http_server_tests` + `cli_tests`).

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

- None.

## Deviations

- None.

## Known Limitations

- Dashboard is polling-based (2s cadence), not push/SSE/live websocket updates.

## Follow-ups

- S09 should add a full runtime integration assertion that exercises live process startup and endpoint probing (beyond integration tests) during conformance sweep.

## Files Created/Modified

- `src/http_server.rs` — full router, handlers, dashboard renderer, and API error envelope behavior.
- `src/main.rs` — orchestrator + optional HTTP server runtime composition and startup decision logging.
- `src/orchestrator.rs` — snapshot handle and refresh channel seams used by HTTP.
- `tests/http_server_tests.rs` — route and envelope conformance suite.
- `tests/cli_tests.rs` — HTTP binding precedence and startup wiring assertions.
- `.kata/REQUIREMENTS.md` — marked R010 validated with S07 proof.

## Forward Intelligence

### What the next slice should know
- HTTP surfaces are now stable and can be reused as S09 conformance probes for runtime state verification.

### What's fragile
- Identifier-route behavior relies on in-handler validation to distinguish malformed path from unknown issue; changes to route matching can break envelope semantics.

### Authoritative diagnostics
- `cargo test --test http_server_tests -- --nocapture` — fastest truth source for API contract regressions.

### What assumptions changed
- "HTTP can be stubbed until final integration" — endpoint contracts needed early red-suite lock to avoid API drift across T02-T04.
