---
id: T04
parent: S07
milestone: M001
provides:
  - CLI runtime now composes orchestrator + optional HTTP server from effective startup config, with deterministic Ctrl+C shutdown behavior across both.
  - Deterministic HTTP binding resolution that preserves `--port` override precedence over workflow `server.port` while retaining configured host.
  - Startup observability events for HTTP enable/disable decisions to make runtime wiring regressions inspectable.
key_files:
  - src/main.rs
  - tests/cli_tests.rs
  - .kata/DECISIONS.md
key_decisions:
  - "D042: emit explicit `http_server_enabled` / `http_server_disabled` startup events with safe host/port metadata."
patterns_established:
  - "Runtime composition pattern: single `tokio::select!` supervises orchestrator loop, optional HTTP server future, and Ctrl+C signal path."
observability_surfaces:
  - "Structured startup/runtime logs: `http_server_enabled`, `http_server_disabled`, `http_server_started`, and `phase=runtime http_enabled=<bool>`."
duration: 58m
verification_result: passed
completed_at: 2026-03-19T13:23:08Z
blocker_discovered: false
---

# T04: Wire CLI runtime composition and finalize slice verification

**Wired optional HTTP runtime startup into CLI bootstrap so `symphony WORKFLOW.md --port 8080` now runs orchestrator + HTTP together with deterministic shutdown and tested override semantics.**

## What Happened

Implemented runtime composition in `src/main.rs` so bootstrap now computes an effective HTTP binding from workflow config + CLI override, constructs the shared snapshot/refresh seams, and conditionally starts the HTTP server only when a port is effective.

The runtime supervisor was upgraded from orchestrator-only to a shared `tokio::select!` that manages orchestrator loop, optional HTTP server future, and Ctrl+C. This preserves deterministic shutdown semantics while making HTTP startup failures surface immediately as bootstrap errors.

Added explicit startup observability for binding decisions (`http_server_enabled` / `http_server_disabled`) and included `http_enabled` in runtime start logging so operators can differentiate expected no-listener mode from miswiring.

Extended `tests/cli_tests.rs` with deterministic assertions for effective binding behavior:
- workflow `server.port` enables HTTP when CLI has no `--port`
- CLI `--port` overrides workflow `server.port`
- no configured port yields orchestrator-only mode

## Verification

Executed slice verification commands:

- `cargo test --test cli_tests --test http_server_tests` ✅ PASS
  - `cli_tests`: 9 passed (including new HTTP binding precedence/disable assertions)
  - `http_server_tests`: 7 passed
- `cargo build` ✅ PASS

Must-have checks:
- `symphony WORKFLOW.md --port 8080` path wired for orchestrator + HTTP startup ✅
- No effective port => no HTTP listener startup path ✅
- CLI `--port` overrides workflow `server.port` ✅
- Startup/shutdown semantics remain deterministic and test-covered ✅
- Full S07 test suite passes ✅

## Diagnostics

Use these surfaces for future inspection:

- Startup decision logs:
  - `event="http_server_enabled"` with `host` + `port`
  - `event="http_server_disabled"` with `reason="no_port_configured"`
- Runtime lifecycle log includes `http_enabled` flag on startup.
- HTTP server bind/runtime failures bubble as startup errors: `http server failed: ...`
- Contract checks:
  - `cargo test --test cli_tests -- --nocapture`
  - `cargo test --test http_server_tests -- --nocapture`

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/main.rs` — integrated effective HTTP binding resolution, optional HTTP startup composition, and shared runtime shutdown supervision.
- `tests/cli_tests.rs` — added HTTP startup/binding precedence tests for workflow port, CLI override, and disabled-listener mode.
- `.kata/DECISIONS.md` — appended D042 documenting HTTP startup decision observability convention.
