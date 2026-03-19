---
estimated_steps: 5
estimated_files: 4
---

# T04: Wire CLI runtime composition and finalize slice verification

**Slice:** S07 — HTTP Dashboard and JSON API
**Milestone:** M001

## Description

Compose orchestrator runtime and optional HTTP server startup in `main.rs` so the binary actually serves the dashboard/API when a port is configured, while preserving existing startup validation and override precedence semantics.

## Steps

1. Update bootstrap/runtime wiring to construct orchestrator + HTTP control state and conditionally start HTTP server when effective `server.port` is set.
2. Preserve existing CLI precedence (`--port` overrides workflow config) and loopback-default host behavior.
3. Ensure orchestrator and HTTP server share lifecycle/shutdown handling so Ctrl+C stops both cleanly.
4. Extend `tests/cli_tests.rs` with assertions for HTTP startup path and port override semantics.
5. Run full S07 verification suite and update any failing contracts introduced by runtime integration.

## Must-Haves

- [ ] `symphony WORKFLOW.md --port 8080` path is wired to launch orchestrator + HTTP server together
- [ ] If no effective port is configured, orchestrator runs without binding HTTP listener
- [ ] CLI `--port` continues overriding workflow `server.port`
- [ ] Startup/shutdown semantics remain deterministic and test-covered
- [ ] Full S07 test suite passes

## Verification

- `cargo test --test cli_tests --test http_server_tests`
- `cargo build`

## Observability Impact

- Signals added/changed: Startup log fields include HTTP binding decisions (host/port enabled/disabled) without leaking secrets.
- How a future agent inspects this: Run CLI tests for startup wiring and inspect runtime logs for `http_server_started` vs `http_server_disabled` phases.
- Failure state exposed: Miswiring of HTTP startup or override precedence fails deterministic CLI assertions instead of appearing only at runtime.

## Inputs

- `src/main.rs` — S06 bootstrap and orchestrator run loop
- `src/http_server.rs` — HTTP start function and route composition from T03
- `tests/cli_tests.rs` — existing CLI startup contract tests
- `tests/http_server_tests.rs` — endpoint contract suite validating runtime composition assumptions

## Expected Output

- `src/main.rs` — integrated orchestrator + optional HTTP server startup composition
- `tests/cli_tests.rs` — passing coverage for HTTP startup and `--port` override behavior
- `tests/http_server_tests.rs` — passing under full runtime wiring
- `src/http_server.rs` — any lifecycle adjustments needed for startup/shutdown composition
