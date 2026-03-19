# S07: HTTP Dashboard and JSON API — UAT

**Milestone:** M001
**Written:** 2026-03-19

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S07 behavior is fully specified as deterministic HTTP contracts already covered by integration tests against real axum routes and runtime wiring.

## Preconditions

- Build succeeds (`cargo build`)
- Tests pass (`cargo test --test http_server_tests --test cli_tests`)
- A valid `WORKFLOW.md` exists if running manual smoke (`symphony WORKFLOW.md --port 8080`)

## Smoke Test

Run `symphony WORKFLOW.md --port 8080`, then open `http://127.0.0.1:8080/` and verify the Symphony dashboard loads and sections for running/retry/tokens are present.

## Test Cases

### 1. Snapshot API surface

1. Start Symphony with HTTP enabled (`--port 8080`).
2. Request `GET /api/v1/state`.
3. **Expected:** HTTP 200 JSON payload includes runtime snapshot fields: `running`, `retry_queue`, `codex_totals`, and `codex_rate_limits`.

### 2. Issue projection + missing issue envelope

1. Request `GET /api/v1/<known-issue-identifier>` for an issue currently visible in running/retry snapshot.
2. Request `GET /api/v1/UNKNOWN-ISSUE`.
3. **Expected:** Known issue returns HTTP 200 with `issue` object; unknown returns HTTP 404 with envelope `error.code = issue_not_found` and `error.status = 404`.

### 3. Refresh coalescing behavior

1. Call `POST /api/v1/refresh` twice in quick succession.
2. **Expected:** First response reports queued refresh (`queued=true`, `coalesced=false`), second reports coalesced duplicate (`coalesced=true`).

## Edge Cases

### API fallback + method mismatch envelopes

1. Request unknown path under API prefix (`GET /api/v1/not-a-real-route`).
2. Call wrong method on valid route (`PUT /api/v1/state`).
3. **Expected:** Unknown route returns JSON 404 envelope (`error.code = not_found`); wrong method returns JSON 405 envelope (`error.code = method_not_allowed`).

## Failure Signals

- Dashboard root returns placeholder HTML or missing runtime sections.
- `/api/v1/state` omits codex totals/rate-limits or returns stub payload.
- Refresh endpoint always reports queued and never coalesced under duplicate calls.
- 404/405 API paths return HTML/plaintext instead of structured JSON envelopes.
- Startup logs omit `http_server_enabled`/`http_server_disabled` when binding decisions are made.

## Requirements Proved By This UAT

- R010 — Route behavior and runtime wiring for dashboard + JSON API are proven by the slice test gate and smoke flow.

## Not Proven By This UAT

- End-to-end Linear-backed production run with real issue churn under operator load.
- SSH remote worker integration behavior (owned by S08).
- Full Spec §17 conformance sweep coverage (owned by S09).

## Notes for Tester

Treat `tests/http_server_tests.rs` and `tests/cli_tests.rs` as the authoritative contract. If manual behavior differs from tests, assume a runtime/config mismatch first, then inspect startup logs for HTTP binding decisions.
