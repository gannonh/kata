---
id: T04
parent: S02
milestone: M001
provides:
  - src/workflow_store.rs with WorkflowStore fully implemented (file-watch, debounce, hot-reload, force_reload)
key_files:
  - src/workflow_store.rs
key_decisions:
  - WorkflowStore uses std::sync::RwLock + std::thread (not tokio) so new() works in plain #[test] context without an active tokio runtime
  - config::validate() is NOT called in new() or force_reload_inner() — validation is the orchestrator's dispatch-preflight responsibility, not the store's
  - Watcher watches parent directory (RecursiveMode::NonRecursive) to handle atomic-rename writes from editors
patterns_established:
  - std::thread debounce loop: recv() → sleep(400ms) → drain try_recv() → reload; avoids tokio runtime dependency
  - try_load() pure helper separates I/O+parse from mutation of Arc<RwLock<>>
  - force_reload_inner() is a sync fn callable from both background thread and async force_reload() wrapper
observability_surfaces:
  - tracing::info!(path, "workflow reloaded successfully") on every successful hot-reload
  - tracing::error!(path, reason, "workflow reload failed — keeping last known good") on any parse/extraction failure
  - WorkflowStore::effective_config() returns current (WorkflowDefinition, ServiceConfig) clone — callers can inspect state at any time
duration: ~30 min
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T04: Implement `workflow_store.rs` — live-watched singleton with hot-reload

**Implemented `WorkflowStore` with notify-based file watching, 400ms debounce, last-known-good hot-reload, and a sync-compatible design that works in both plain `#[test]` and `#[tokio::test]` contexts.**

## What Happened

Replaced the stub `src/workflow_store.rs` with a full implementation. Key design choices made during execution:

**`std::sync::RwLock` + `std::thread` instead of `tokio::sync::RwLock` + `tokio::spawn`:**  
The test `test_workflow_store_initial_load` is a plain `#[test]` (no tokio runtime), so `tokio::spawn` inside `new()` would panic with "no reactor running". Switched to `std::thread::spawn` for the debounce background thread and `std::sync::RwLock` for the inner state. This is simpler and works in all contexts — `effective_config()` is a sync call, `force_reload()` is async but calls a sync helper.

**`config::validate()` removed from `new()` and `force_reload_inner()`:**  
The plan said to call `validate()` in `new()`, but the hot-reload tests (`test_workflow_store_hot_reload`, `test_workflow_store_reload_failure_keeps_last_good`) pass YAML without `project_slug` and expect initialization to succeed. The tests are the binding contract. The architectural rationale is sound: a hot-reload store should accept any parseable config so operators can iteratively fix WORKFLOW.md; the orchestrator calls `validate()` as a dispatch-preflight before each agent session.

**Watcher watches parent directory:**  
`path.parent()` watched with `RecursiveMode::NonRecursive` covers editors that use atomic rename-writes (write temp file → rename to target). Watching the file directly can miss these events on some OS/notify backends.

**Debounce pattern:**  
Background thread: `rx.recv()` (blocking) → `std::thread::sleep(400ms)` → drain `rx.try_recv()` loop → call `force_reload_inner()`. This matches the Elixir reference behavior without tokio complexity.

## Verification

```shell
cargo test --test workflow_config_tests -- --nocapture
# 16 passed; 0 failed; finished in 0.84s

cargo test
# 35 passed total (6 config unit tests + 13 domain tests + 16 workflow_config_tests)
# 0 failed; 0 warnings

cargo build
# Finished dev profile — zero warnings
```

All 3 store tests pass:
- `test_workflow_store_initial_load` — store initializes from valid file, effective_config() returns correct values ✓
- `test_workflow_store_hot_reload` — after overwriting file, config updates within 800ms ✓  
- `test_workflow_store_reload_failure_keeps_last_good` — invalid YAML reload leaves last-good config intact ✓

## Diagnostics

- `WorkflowStore::effective_config()` — call at any time to snapshot current `(WorkflowDefinition, ServiceConfig)`
- Reload history visible in tracing output: `INFO workflow reloaded successfully path=...` or `ERROR workflow reload failed — keeping last known good path=... reason=...`
- Failure reason is the typed `SymphonyError` message (e.g. `WorkflowParseError(...)`) — never includes api_key values
- Background watcher thread exits cleanly when the store is dropped (mpsc sender closes → recv() returns Err → thread breaks)

## Deviations

**Removed `config::validate()` from `WorkflowStore::new()` and `force_reload_inner()`:**  
The task plan said to call it; the tests contradict that. The tests are the binding contract. Decision recorded in DECISIONS.md (D017).

**`std::sync::RwLock` + `std::thread` instead of `tokio::sync::RwLock` + `tokio::spawn`:**  
The plan assumed tokio was available in `new()`. It isn't in plain `#[test]` context. This is a pragmatic swap that preserves all behavioral guarantees while adding compatibility.

## Known Issues

None.

## Files Created/Modified

- `src/workflow_store.rs` — full implementation replacing the stub; WorkflowStore struct with notify watcher, debounce thread, hot-reload, force_reload
