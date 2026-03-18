# Project

## What This Is

Symphony-Rust is a Rust port of the Symphony orchestrator service. Symphony is a long-running daemon that polls Linear for issues, creates isolated per-issue workspaces, and runs Codex app-server coding agent sessions against them. It handles concurrency control, exponential-backoff retries, stall detection, reconciliation, dynamic WORKFLOW.md reload, workspace lifecycle hooks, and an optional HTTP observability dashboard with JSON API.

The Rust port targets full spec conformance (SPEC.md) including all extensions (HTTP server, SSH remote workers, `linear_graphql` client-side tool). The reference implementation is in Elixir (~8200 LOC lib, ~8600 LOC tests).

Reference implementation:
/Volumes/EVO/kata/openai-symphony/SPEC.md
/Volumes/EVO/kata/openai-symphony/elixir/

## Core Value

A single `symphony` binary that reliably polls Linear, dispatches bounded-concurrency Codex agent sessions in isolated workspaces, retries failures, and exposes operator-visible observability — without requiring Erlang/OTP runtime.

## Current State

Five of nine slices complete (S01–S05). The execution layer is now fully implemented: the Codex app-server client handles subprocess launch via `bash -lc`, the 4-message JSON-RPC handshake, line-delimited turn streaming, approval auto-approve/reject (4 methods), `item/tool/call` dispatch to the `linear_graphql` dynamic tool, `item/tool/requestUserInput` with MCP approval and freeform handling, and per-turn token delta accounting. 143 tests pass across 6 test suites (32 in the new codex integration suite). R001, R002, R004, R005, R007, R012 validated. Next: S06 Orchestrator Core — wires the poll→reconcile→dispatch→retry loop.

## Architecture / Key Patterns

- **Language:** Rust 2021 edition
- **Async runtime:** tokio (full features)
- **Concurrency model:** Single orchestrator task owns all mutable state via a `select!` loop. Worker tasks communicate via `mpsc` channels. No shared mutable state.
- **HTTP framework:** axum (to be added)
- **Template engine:** liquid crate (Liquid-compatible strict rendering)
- **Serialization:** serde + serde_json + serde_yaml
- **HTTP client:** reqwest
- **File watching:** notify crate
- **CLI:** clap derive
- **Logging:** tracing + tracing-subscriber
- **Error handling:** thiserror for typed errors, anyhow for ad-hoc

## Capability Contract

See `.kata/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [ ] M001: Full Spec Conformance — Complete Rust port of Symphony with all core + extension features, spec-driven test suite
