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

Six of nine slices are complete (S01–S06). The orchestrator runtime authority and CLI bootstrap are now implemented and proven: startup terminal cleanup, reconcile→validate→dispatch tick ordering, candidate sorting/gating, global+per-state concurrency control, continuation/failure retry scheduling with stale-token suppression, stall recovery, and aggregate codex token/rate-limit snapshot accounting. CLI startup now performs workflow existence checks, startup validation, staged runtime bootstrap, and deterministic non-zero startup failures. `cargo test --test orchestrator_tests --test cli_tests` (19 tests) and `cargo build` pass. R006, R008, R014, and R015 are now validated in addition to previously validated requirements. Next: S07 HTTP Dashboard and JSON API integration on top of `OrchestratorSnapshot`.

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
