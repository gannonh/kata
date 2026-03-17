# M001: Full Spec Conformance — Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

## Project Description

Rust port of the Symphony orchestrator. Symphony is a long-running daemon that polls Linear for issues, creates per-issue workspaces, runs Codex app-server agent sessions, manages retries/reconciliation/stall-detection, and exposes observability via structured logs and an optional HTTP dashboard.

## Why This Milestone

The Elixir reference implementation works but requires the Erlang/OTP runtime. A Rust port produces a single static binary with lower resource overhead and easier deployment. This is the only milestone — it delivers the complete conforming implementation.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Run `symphony WORKFLOW.md --port 8080` and have it poll Linear, dispatch agent sessions, and serve a live dashboard
- Edit WORKFLOW.md while the service is running and see config/prompt changes take effect without restart
- See running sessions, retry queue, token totals, and rate limits on the HTTP dashboard and JSON API
- Run agent sessions on remote hosts via SSH with per-host concurrency caps

### Entry point / environment

- Entry point: `symphony` CLI binary
- Environment: local dev or server, long-running daemon
- Live dependencies involved: Linear API, Codex app-server subprocess, filesystem, optional SSH

## Completion Class

- Contract complete means: all Spec §17.1-17.7 Core Conformance tests pass
- Integration complete means: agent sessions can be launched against real Linear issues in real workspaces
- Operational complete means: service starts, polls, dispatches, retries, reconciles, reloads config, and serves dashboard under real conditions

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- The full poll→dispatch→agent-session→retry→reconciliation loop works end-to-end with a real Linear project
- WORKFLOW.md dynamic reload changes polling interval, concurrency, and prompt for future runs
- The HTTP dashboard reflects real-time state of running/retrying sessions
- Workspace safety invariants hold (no agent runs outside its workspace root)

## Risks and Unknowns

- **Codex app-server protocol compatibility** — The JSON-RPC-like protocol is documented but field names may drift. The Elixir impl handles payload shape variants leniently.
- **liquid crate strict mode** — Need to verify the liquid crate supports strict unknown-variable/filter rejection as spec requires.
- **SSH stdio forwarding** — Launching app-server over SSH and streaming JSON-RPC events over stdio across the SSH tunnel needs careful buffering.
- **notify crate cross-platform** — File watching behavior differs across macOS/Linux. Need to handle debouncing and fallback.

## Existing Codebase / Prior Art

- `src/domain.rs` — All domain types already defined (Issue, BlockerRef, ServiceConfig, all config sub-structs with defaults)
- `src/error.rs` — Typed error enum covering all spec error categories
- `src/main.rs` — CLI skeleton with clap (workflow_path, --port, --logs-root, guardrails flag)
- `src/lib.rs` — Module stubs for all planned modules
- `Cargo.toml` — Dependencies already selected (tokio, reqwest, liquid, serde, clap, tracing, notify, thiserror, anyhow)
- **Elixir reference** at `/Volumes/EVO/kata/openai-symphony/elixir/` — complete working implementation to consult for behavior details
- **Spec** at `/Volumes/EVO/kata/openai-symphony/SPEC.md` — authoritative behavioral contract

> See `.kata/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R001-R015 — All active requirements are owned by this milestone

## Scope

### In Scope

- Complete Spec §17.1-17.7 Core Conformance implementation
- HTTP server extension (Spec §13.7) with dashboard + JSON API
- SSH remote worker extension (Spec Appendix A)
- `linear_graphql` client-side tool extension (Spec §10.5)
- Spec-driven test suite covering §17.1-17.7

### Out of Scope / Non-Goals

- Phoenix LiveView-style real-time dashboard (server-rendered HTML with auto-refresh is sufficient)
- Terminal TUI dashboard (HTTP dashboard covers observability)
- Persistent retry queue across restarts (spec TODO)
- Non-Linear tracker adapters (spec TODO)

## Technical Constraints

- Rust 2021 edition, tokio async runtime
- Single orchestrator task owns all mutable state (no shared mutable state)
- mpsc channels for worker→orchestrator events
- axum for HTTP server
- liquid for template rendering
- All subprocess I/O via tokio::process with line-delimited JSON framing

## Integration Points

- **Linear GraphQL API** — candidate fetch, state refresh, terminal cleanup queries
- **Codex app-server** — JSON-RPC over stdio subprocess protocol
- **Filesystem** — workspace creation/cleanup, WORKFLOW.md watching, log files
- **SSH** — optional remote host execution via ssh command stdio

## Open Questions

- **liquid strict mode** — Need to verify `liquid` crate can reject unknown variables. If not, may need a custom `ParserBuilder` config or wrapper. Will investigate in S02.
- **axum SSE vs polling for dashboard** — The Elixir impl uses LiveView websockets. For Rust, server-rendered HTML with meta-refresh or JS polling is simpler. Will decide in S07.
