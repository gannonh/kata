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

M001 milestone complete — all 9 slices done. 211 tests passing, `cargo clippy -- -D warnings` clean. The full Symphony orchestrator is implemented: poll→reconcile→dispatch→retry loop, dynamic WORKFLOW.md reload, workspace lifecycle hooks, Codex app-server client (JSON-RPC over stdio), linear_graphql dynamic tool, HTTP dashboard + JSON API (axum), SSH remote worker extension with per-host concurrency pool, and spec §17 conformance suite. All 13 active requirements validated (R001, R002, R004–R008, R010–R015). R003 and R009 remain active pending live-integration proof and human-readable log format toggle respectively.

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

- [x] M001: Full Spec Conformance — Complete Rust port of Symphony with all core + extension features, spec-driven test suite
