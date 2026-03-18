---
estimated_steps: 6
estimated_files: 3
---

# T04: Implement `workflow_store.rs` — live-watched singleton with hot-reload

**Slice:** S02 — Workflow Loader and Config Layer
**Milestone:** M001

## Description

Implement `WorkflowStore` in `src/workflow_store.rs`. This struct holds the current effective `(WorkflowDefinition, ServiceConfig)` under a tokio `RwLock`, runs a background task that watches the workflow file via `notify::recommended_watcher`, debounces events (400ms), and atomically reloads on change. Invalid reloads keep the last-known-good config and log the error. A `force_reload()` async method provides the dispatch-preflight reload trigger. Wire the module into `src/lib.rs`.

## Steps

1. Add `use` imports: `std::path::PathBuf`, `std::sync::{Arc, Mutex}`, `std::sync::mpsc`, `notify::{self, RecommendedWatcher, RecursiveMode, Watcher}`, `tokio::sync::RwLock`, `tokio::time::{sleep, Duration}`, `tracing`, and local `crate::{workflow, config, domain::*, error::{SymphonyError, Result}}`.
2. Define types: `type EffectiveConfig = (WorkflowDefinition, ServiceConfig);` and `WorkflowStore` struct with fields: `path: PathBuf`, `inner: Arc<RwLock<EffectiveConfig>>`, `_watcher: RecommendedWatcher` (underscore prefix prevents unused-field warning while keeping it alive).
3. Implement `WorkflowStore::new(path: PathBuf) -> Result<Self>`: load initial config via `workflow::parse_workflow(&path)` + `config::from_workflow(&def)` + `config::validate(&cfg)` — return error on failure. Set up `std::sync::mpsc::channel::<notify::Event>()`. Create `notify::recommended_watcher` with sender closure: `move |res: notify::Result<notify::Event>| { if let Ok(e) = res { let _ = tx.send(e); } }`. Watch `path.parent()` with `RecursiveMode::NonRecursive` (watching parent dir covers atomic-rename writes). Store watcher in struct field. Spawn debounce task (see step 4). Return `Ok(WorkflowStore { path, inner, _watcher })`.
4. Debounce task (spawned with `tokio::spawn`): loop receiving from `std::sync::mpsc::Receiver` — use `tokio::task::spawn_blocking` to move the blocking recv into async context. After receiving any event, drain remaining events by sleeping 400ms then calling `try_recv` in a loop until empty. Then call `force_reload_inner(path_clone, inner_clone)`.
5. Implement `async fn force_reload_inner(path: &Path, inner: &Arc<RwLock<EffectiveConfig>>)`: attempt `workflow::parse_workflow(path)` → `config::from_workflow` → `config::validate`; if all succeed, take write lock and replace; if any fails, log `tracing::error!(path = %path.display(), reason = %e, "workflow reload failed — keeping last known good")` and return without updating.
6. Implement public API: `pub fn effective_config(&self) -> EffectiveConfig` — `self.inner.blocking_read().clone()` (or provide both blocking and async variants); `pub async fn force_reload(&self) -> Result<()>` — calls `force_reload_inner` directly. Uncomment `pub mod workflow_store;` in `src/lib.rs`.

## Must-Haves

- [ ] `WorkflowStore::new(path)` fails fast if initial parse/validate fails
- [ ] `_watcher` kept alive inside struct (not dropped after `new` returns)
- [ ] Debounce of 400ms prevents thrash on multi-write saves
- [ ] `force_reload_inner` keeps last-known-good on any error
- [ ] `tracing::error!` on reload failure with `path` and `reason` fields (no api_key in log)
- [ ] `pub mod workflow_store;` uncommented in `lib.rs`
- [ ] All 3 `test_workflow_store_*` tests pass
- [ ] `cargo test` overall green, zero warnings

## Verification

- `cargo test --test workflow_config_tests test_workflow_store` — 3 store tests pass
- `cargo test` — all prior tests still pass (no regressions)
- `cargo build` — zero warnings

## Observability Impact

- Signals added/changed: `tracing::error!(path, reason)` on reload failure; `tracing::info!(path)` on successful reload
- How a future agent inspects this: `WorkflowStore::effective_config()` returns current state snapshot; log output shows reload history
- Failure state exposed: Reload failure message contains exact `SymphonyError` reason without leaking api_key

## Inputs

- `src/workflow.rs` — `parse_workflow` (from T02)
- `src/config.rs` — `from_workflow`, `validate` (from T03)
- `src/domain.rs` — `WorkflowDefinition`, `ServiceConfig`
- `src/error.rs` — `SymphonyError`, `Result<T>`
- `Cargo.toml` — `notify = "7"`, `tokio`, `tracing` (already present)
- `tests/workflow_config_tests.rs` — store test assertions (from T01)

## Expected Output

- `src/workflow_store.rs` — `WorkflowStore` fully implemented with file watch, debounce, hot-reload, force_reload
- `src/lib.rs` — `pub mod workflow_store;` uncommented
- `tests/workflow_config_tests.rs` — all 16 tests pass (3 new store tests + 13 from T02/T03)
