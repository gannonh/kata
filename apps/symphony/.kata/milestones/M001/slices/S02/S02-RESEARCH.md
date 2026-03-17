# S02: Workflow Loader and Config Layer — Research

**Date:** 2026-03-16

## Summary

S02 owns R001 (WORKFLOW.md parsing and dynamic reload) and R002 (typed config layer with defaults and env resolution). Three modules are produced: `workflow.rs` (file parsing), `config.rs` (YAML→ServiceConfig extraction with env/$VAR resolution), and `workflow_store.rs` (live-watched singleton with last-known-good semantics). The scope is well-bounded; the Elixir reference is clear and directly portable.

**Liquid strict mode risk is already retired.** The `liquid` crate (v0.26) errors on unknown variables by default — `template.render()` returns `Err(Error { msg: "Unknown variable" })` when the globals object doesn't contain a referenced key. No special mode flag or custom `ParserBuilder` config is needed. This resolves D004.

The only non-trivial design decision is the `WorkflowStore` watcher strategy. The Elixir implementation uses 1-second **polling** (mtime + size + content hash) rather than FS events. The `notify` v7 crate (already in Cargo.toml) uses native FS events (`FSEvents` on macOS, `inotify` on Linux) without debouncing. Both approaches work; the recommendation is to use `notify` events bridged to a tokio channel, plus debouncing via a short timeout (`Duration::from_millis(500)`), because that's more responsive and simpler to test with `tempfile`.

## Recommendation

Implement the three modules in task order: `workflow.rs` → `config.rs` → `workflow_store.rs`. Tests live in `tests/workflow_config_tests.rs` (new file, following `tests/domain_tests.rs` convention).

**Key implementation choices:**
- `parse_workflow(path)` reads file, splits on `---` delimiters, parses YAML via `serde_yaml::from_str`, returns `WorkflowDefinition` or typed `SymphonyError`.
- `ServiceConfig::from_workflow(def)` extracts each sub-struct from `serde_yaml::Value` using typed deserialization, applies defaults via `Default::default()` for missing sections, resolves `$VAR` patterns and `~` expansion for path/secret fields.
- `WorkflowStore` holds `Arc<RwLock<(WorkflowDefinition, ServiceConfig)>>` as the effective config. A background tokio task uses `notify::recommended_watcher` with a debounce loop. On change event: reload → validate → atomically replace effective config. On failure: keep old config, log error.
- Liquid strict mode: no extra config needed — `liquid::ParserBuilder::with_stdlib().build()` already errors on unknown variables. Test proves this behavior explicitly.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| YAML front matter parsing | `serde_yaml::from_str` | Already in Cargo.toml; handles the YAML subset used in WORKFLOW.md |
| Template rendering with strict variable checking | `liquid` crate (already in Cargo.toml) | Errors on unknown vars by default; no custom mode needed |
| File watching | `notify::recommended_watcher` (already in Cargo.toml) | Cross-platform native FS events; tokio channel bridge via `std::sync::mpsc` → `tokio::sync::watch` |
| Home expansion (`~`) | `std::path::Path::expand` or manual `dirs` crate pattern | Use `std::env::home_dir()` or inline replacement; no new dep needed |

## Existing Code and Patterns

- `src/domain.rs` — `WorkflowDefinition { config: serde_yaml::Value, prompt_template: String }` and `ServiceConfig` with all typed sub-structs — these are the input/output types for `workflow.rs` and `config.rs`. Import with `use symphony::domain::*`.
- `src/lib.rs` — `pub mod workflow;` and `pub mod config;` already declared (uncommented). `workflow_store` is commented out — needs to be added.
- `src/error.rs` — `SymphonyError` has `WorkflowError(String)`, `ConfigError(String)`, `TemplateError(String)` variants that map to spec §5.5 error classes. Use these, don't create new variants.
- `tests/domain_tests.rs` — Establishes test pattern: `#[test]`, self-contained, no mocking. Follow the same structure in `tests/workflow_config_tests.rs`.

## Elixir Reference Behavior to Match

### Parsing (`workflow.ex`)
- Split on `---` delimiter lines (first `---` opens front matter, second closes it)
- If no `---` delimiter: treat entire content as prompt, config is empty `{}`
- YAML that decodes to non-map → `workflow_front_matter_not_a_map` error
- Empty/whitespace-only YAML → treat as `{}` (no error)
- Prompt body is everything after the closing `---`, trimmed

### Config extraction (`config/schema.ex`)
- Key normalization: all YAML keys are string-coerced (atom keys become strings). Recursive.
- Nil-value dropping: YAML null values are dropped before struct assignment (missing key → default)
- `$VAR` resolution for `tracker.api_key` and `tracker.assignee`: if value starts with `$`, resolve from env; if env var missing/empty → fallback to env `LINEAR_API_KEY`/`LINEAR_ASSIGNEE`
- `~` path expansion for `workspace.root`
- `tracker.api_key` canonical env fallback: when field is absent, falls back to `LINEAR_API_KEY` env var
- `agent.max_concurrent_agents_by_state`: keys are normalized to lowercase state names; invalid entries are silently dropped

### Config validation (§6.3)
- `tracker.kind` must be present and equal `"linear"` (only supported kind)
- `tracker.api_key` must be non-nil after resolution
- `tracker.project_slug` must be non-nil
- `codex.command` must be non-empty

### WorkflowStore (`workflow_store.ex`)
- Uses mtime + size + content hash as "stamp" to detect changes (not just mtime)
- On reload failure: keep last known good, log error with `path` and `reason`
- `force_reload` exposes an explicit reload trigger (used by dispatch preflight)
- Stamp check avoids re-parsing when file hasn't changed

## Constraints

- `serde_yaml` v0.9 is already in Cargo.toml — use it, don't add `yaml-rust` or `saphyr`
- `notify` v7 API: uses `recommended_watcher(handler)` returning `RecommendedWatcher`. The handler callback is called from a background thread (not async). Bridge to tokio via `std::sync::mpsc` channel + `tokio::task::spawn_blocking` or `Arc<Mutex<Sender>>`. 
- `notify` does NOT debounce — editors write files multiple times per save. Add a small debounce: after receiving an event, wait 300-500ms for the stream to quiet before reloading.
- `WorkflowStore` needs `Send + Sync` — use `Arc<RwLock<EffectiveConfig>>` with tokio's `RwLock` for async contexts.

## Common Pitfalls

- **`serde_yaml::Value` key types** — YAML deserializes map keys as `Value::String` but they could be `Value::Number` or other types if the WORKFLOW.md author uses unquoted numeric keys. The Elixir impl normalizes all keys to strings. Do the same: when extracting sub-maps, coerce `Value::Mapping` keys to strings.
- **`~` expansion edge cases** — `~/foo` must expand to `/Users/username/foo`. But `~/` alone or a value that is just `~` with no path component should also expand. Use `Path::new(val).expand()` or inline `val.replacen("~", &home_dir, 1)` only when the value starts with `~/` or equals `~`.
- **`$VAR` vs `$VAR/more/path`** — The spec treats `$VAR_NAME` as a full-value reference, not an interpolation within a longer string. If the value is `$LINEAR_API_KEY`, resolve the whole value from the env var. If the value is `$LINEAR_API_KEY/suffix`, that is NOT env indirection — treat as a literal string.
- **liquid unknown-var error is produced at render time, not parse time** — `parser.parse("{{unknown}}")` succeeds. Only `template.render(&globals)` errors. The distinction matters for error mapping: parse errors → `TemplateError`, render errors → `TemplateError` (same variant, different message).
- **notify sends multiple events per save** — vim, VS Code, and most editors write atomically via rename or write multiple times. Debounce by draining the channel until quiet.
- **`WorkflowStore` background task lifetime** — The watcher must be kept alive as long as the store is alive. Store the `RecommendedWatcher` handle inside `WorkflowStore` to prevent premature drop.

## Open Risks

- **`notify` v7 on macOS FSEvents may miss events for files not owned by the current user** — spec §6.2 notes: "Implementations should also re-validate/reload defensively during runtime operations." The `force_reload()` API on `WorkflowStore` provides this escape hatch; the orchestrator must call it before each dispatch tick.
- **YAML → `ServiceConfig` type coercion edge cases** — `serde_yaml` will fail to deserialize if WORKFLOW.md has, e.g., `polling.interval_ms: "30000"` (string instead of int). The Elixir Ecto changeset is lenient about type coercion. We should either: (a) catch serde errors and return `ConfigError` with a clear message, or (b) use a two-step approach: deserialize to `serde_yaml::Value`, then extract fields manually. Option (a) is simpler; option (b) matches Elixir more closely. Recommend option (a) with clear error messages.
- **Concurrent reload during dispatch** — `WorkflowStore` must serve reads under `RwLock` so dispatchers can read config while a reload is in progress. Tokio's `RwLock` is appropriate here.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Rust / notify / tokio | (none found) | No installed skill |
| serde_yaml | (none found) | No installed skill |

## Sources

- Liquid `unknown variable` is a hard error by default — verified by running `template.render(&empty_globals)` in the crate's test infra; returns `Err(Error { msg: "Unknown variable" })` (source: local cargo test + `liquid-core-0.26.11/src/runtime/stack.rs`)
- Elixir uses `Solid` (not the JS liquid) with `strict_variables: true, strict_filters: true` flags — (source: `elixir/lib/symphony_elixir/prompt_builder.ex:8`)
- Config extraction uses recursive key normalization, nil-dropping, and `finalize_settings` for `$VAR`/`~` resolution — (source: `elixir/lib/symphony_elixir/config/schema.ex`)
- WorkflowStore uses polling with `{mtime, size, content_hash}` stamp, not FS events — (source: `elixir/lib/symphony_elixir/workflow_store.ex`)
- Spec §5.4: Unknown variables/filters must fail rendering — (source: `SPEC.md:452,479`)
- Spec §6.2: Invalid reloads keep last known good config — (source: `SPEC.md:~520`)
- Spec §6.3: Dispatch preflight validation requirements — (source: `SPEC.md:~540`)
- `notify` v7 API: `recommended_watcher`, no built-in debounce — (source: `notify-7.0.0/src/lib.rs`)
