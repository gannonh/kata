# S01: Domain Types and Error Foundation — Research

**Date:** 2026-03-15
**Domain:** Rust domain modeling, serde, error handling
**Confidence:** HIGH

## Summary

S01 is a foundation slice that validates and completes the existing domain type scaffold in `src/domain.rs` and `src/error.rs`. The existing code already covers ~70% of the spec's §4.1 entities — `Issue`, `BlockerRef`, `WorkflowDefinition`, `ServiceConfig`, and all config sub-structs with correct defaults. The remaining ~30% are runtime entities: `Workspace`, `RunAttempt`, `LiveSession`, `RetryEntry`, and `OrchestratorState`/`OrchestratorSnapshot`.

The error enum in `src/error.rs` covers all five spec failure classes (§14.1) with specific variants. The `lib.rs` module structure is stubbed but only `domain`, `error`, `config`, and `workflow` are declared as active modules. S01 needs to ensure all types compile, have the right derives, and that `cargo build` + `cargo test` pass cleanly.

This is low-risk work — all types are already well-defined in the spec, the crate dependencies are in place, and there are no external API calls or runtime behavior to worry about.

## Recommendation

Validate existing types against spec §4.1 field-by-field, add the missing runtime entity structs (`Workspace`, `RunAttempt`, `LiveSession`, `RetryEntry`, `OrchestratorState`, `OrchestratorSnapshot`, `AgentEvent`), ensure all types have appropriate derives (`Debug, Clone, Serialize, Deserialize` where needed), and verify `cargo build` + `cargo test` pass. Keep runtime types in `domain.rs` alongside the existing entities — they're all part of the core domain model.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Error enum boilerplate | `thiserror` v2 (already in deps) | Derive `Error` + `Display`, `#[from]` for conversions |
| Serialization | `serde` + `serde_json` + `serde_yaml` (already in deps) | Standard Rust serde ecosystem |
| Timestamp handling | `chrono` v0.4 with serde feature (already in deps) | `DateTime<Utc>` with JSON/YAML serialization |
| HashMap with string keys | `std::collections::HashMap` | Already used in `AgentConfig::max_concurrent_agents_by_state` |

## Existing Code and Patterns

- `src/domain.rs` — **Core domain types, ~70% complete.** Has `Issue`, `BlockerRef`, `WorkflowDefinition`, `ServiceConfig`, and all 8 config sub-structs (`TrackerConfig`, `PollingConfig`, `WorkspaceConfig`, `WorkerConfig`, `AgentConfig`, `CodexConfig`, `HooksConfig`, `ServerConfig`). All config structs have `Default` impls matching spec defaults. Missing: runtime entities (§4.1.4–4.1.8) and agent event types (§10.4).
- `src/error.rs` — **Error enum, complete coverage of spec failure classes.** Has variants for workflow/config, tracker/Linear, workspace, codex/agent, and generic IO errors. Includes `Result<T>` alias.
- `src/lib.rs` — Module declarations. Only `config`, `domain`, `error`, `workflow` are active. Others commented out as stubs for later slices.
- `src/main.rs` — CLI skeleton with clap. Has `workflow_path`, `--port`, `--logs-root`, guardrails flag. No wiring to domain types yet.
- `src/config.rs` — Placeholder comment only.
- `src/workflow.rs` — Placeholder comment only.

## Gap Analysis: Spec §4.1 vs Current domain.rs

### Present and correct
- **§4.1.1 Issue** — All fields match spec. Includes `assigned_to_worker` (Elixir-compat, used for assignee routing). `labels` is `Vec<String>`, `blocked_by` is `Vec<BlockerRef>`. Has serde derives.
- **§4.1.2 WorkflowDefinition** — `config: serde_yaml::Value` + `prompt_template: String`. Matches spec. Note: no serde derives (intentional — `serde_yaml::Value` parsing is handled by the workflow loader, not generic deserialization).
- **§4.1.3 ServiceConfig** — All sub-structs present with correct defaults matching spec §5.3. `AgentConfig` has `max_turns` (spec §6.4 cheat sheet). `CodexConfig.stall_timeout_ms` is `i64` (spec says `<= 0` disables stall detection, so signed is correct).

### Missing — needs implementation in S01
- **§4.1.4 Workspace** — `path`, `workspace_key`, `created_now`. Small struct.
- **§4.1.5 RunAttempt** — `issue_id`, `issue_identifier`, `attempt`, `workspace_path`, `started_at`, `status`, `error`. Used in orchestrator running map entries.
- **§4.1.6 LiveSession** — Session metadata tracked while subprocess runs. 16 fields including token counters, PIDs, thread/turn IDs. This is the most complex missing type.
- **§4.1.7 RetryEntry** — `issue_id`, `identifier`, `attempt`, `due_at_ms`, `error`. Timer handle is runtime-specific (tokio `JoinHandle` or similar).
- **§4.1.8 OrchestratorState** — Runtime state map. Fields: `running`, `claimed`, `retry_attempts`, `completed`, `codex_totals`, `codex_rate_limits`, `poll_interval_ms`, `max_concurrent_agents`.
- **§10.4 AgentEvent** — Enum with ~12 variants for worker→orchestrator events. Not a §4.1 entity but needed by S05/S06 boundary.
- **OrchestratorSnapshot** — Read-only view of orchestrator state for HTTP dashboard/JSON API (boundary map S06→S07).

### Minor issues to address
- `serde_yaml` v0.9.34 is deprecated (upstream abandoned). The `WorkflowDefinition.config` field uses `serde_yaml::Value`. This is fine for now — the crate still works and there's no urgent migration path. Note for later: if we need to migrate, `serde_yml` is the community fork.
- `WorkflowDefinition` lacks `Debug` derive on `serde_yaml::Value` — actually `serde_yaml::Value` does impl `Debug`, so adding `#[derive(Debug, Clone)]` should work. Currently only has manual Debug/Clone from the derive on the struct.
- `ServerConfig::new()` and `Default` impl both exist — `new()` sets `host: "127.0.0.1"` but `Default` derives to empty string. Should consolidate so `Default` also sets `host: "127.0.0.1"`.

## Constraints

- **All types must be `Send + Sync`** — tokio async runtime requires this for anything crossing `.await` boundaries. All standard types (`String`, `Vec`, `HashMap`, `Option`, `DateTime<Utc>`) are already `Send + Sync`.
- **`serde_yaml::Value` is `Send + Sync`** — verified in serde_yaml source.
- **Runtime-specific fields** (timer handles, channel senders) should use opaque types or generics in domain types, or be kept in module-local state rather than domain structs. For S01, use `Option<String>` or similar placeholders for timer handles — the concrete type will be wired in S06.
- **No circular module dependencies** — all types in `domain.rs`, all errors in `error.rs`. Other modules import from these, not the reverse.
- **`stall_timeout_ms: i64`** is intentional — spec says `<= 0` disables stall detection, requiring signed comparison.

## Common Pitfalls

- **Forgetting `#[serde(default)]` on optional collections** — `Vec<String>` fields without `#[serde(default)]` will fail deserialization when the key is absent from JSON. The existing `Issue` struct handles this correctly; new structs should follow the same pattern.
- **`Default` vs `new()` divergence** — `ServerConfig` has both, and they disagree on `host`. Use `Default` as the canonical constructor and remove `new()`, or make `new()` delegate to `Default`.
- **Timer handle types in domain structs** — Don't put `tokio::task::JoinHandle` in domain types. It's not `Serialize`/`Deserialize` and couples domain to runtime. Use a lightweight handle or keep timer state in the orchestrator module.
- **`HashMap` key ordering in snapshots** — `HashMap` iteration order is random. For deterministic JSON API output, use `BTreeMap` for snapshot types that get serialized to API responses, or sort on serialization.

## Open Risks

- **`serde_yaml` deprecation** — The crate works but won't receive updates. Low risk for S01 (just a `Value` type), but may need migration in S02 when we parse YAML front matter more extensively. The community fork `serde_yml` is API-compatible.
- **`LiveSession` field set may evolve** — The spec's §4.1.6 lists 16 fields, but the actual Codex app-server protocol may produce additional or differently-named fields. S01 should define the struct per spec; S05 can extend it when integrating the real protocol.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Rust/serde | — | No domain-modeling skill needed; standard Rust patterns |
| thiserror | — | Already in deps, well-understood |

No professional agent skills are relevant for this foundation slice — it's pure Rust type definition work with no external service integrations.

## Sources

- Spec §4.1 (Entities) — authoritative field definitions for all domain types
- Spec §5.3 (Front Matter Schema) — authoritative defaults for all config sub-structs
- Spec §10.4 (Emitted Runtime Events) — event enum variants
- Spec §14.1 (Failure Classes) — error category coverage
- Elixir `orchestrator.ex` State defstruct — runtime state fields (`running`, `claimed`, `retry_attempts`, `codex_totals`, `codex_rate_limits`)
- Elixir `linear/issue.ex` — field parity check (matches Rust `Issue` struct)
- `cargo tree` — dependency versions verified, `serde_yaml` deprecation noted
