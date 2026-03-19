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

Seven of nine slices are complete (S01–S07). HTTP observability is now implemented and proven: axum server-backed dashboard at `/`, snapshot/issue APIs at `/api/v1/state` and `/api/v1/:issue_identifier`, refresh control via `POST /api/v1/refresh`, and stable JSON API 404/405 envelopes. CLI runtime composition now starts orchestrator + optional HTTP server with explicit startup decision logs and preserves `--port` precedence over workflow config. Verification is green via `cargo test --test http_server_tests --test cli_tests` (16 tests) and `cargo build`. R010 is now validated. Next: S08 SSH Remote Worker Extension.

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
