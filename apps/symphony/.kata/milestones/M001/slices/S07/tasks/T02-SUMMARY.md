---
id: T02
parent: S07
milestone: M001
provides:
  - Orchestrator-owned SnapshotHandle for concurrent HTTP reads (Arc<RwLock>-backed)
  - RefreshSender/RefreshReceiver channel with deterministic duplicate coalescing
  - RuntimeEvent::RefreshRequested and RefreshCoalesced variants for diagnostics
  - http_server trait impls bridging orchestrator types to HTTP layer without mutual dependency
key_files:
  - src/orchestrator.rs
  - src/http_server.rs
  - tests/orchestrator_tests.rs
  - tests/http_server_tests.rs
key_decisions:
  - D039 preserved — HTTP reads snapshots + sends refresh signals; orchestrator remains sole mutable authority
patterns_established:
  - "SnapshotHandle publish/read pattern: orchestrator publishes via Arc<RwLock>, HTTP handlers read clones without holding locks"
  - "AtomicBool + tokio::sync::Notify refresh channel: coalescing via swap semantics, wake-up via Notify for select! integration"
  - "Trait bridge pattern: http_server defines SnapshotSource/RefreshControl traits; orchestrator types implement them without circular dependency"
observability_surfaces:
  - RuntimeEvent::RefreshRequested emitted when HTTP refresh wakes orchestrator loop
  - RuntimeEvent::RefreshCoalesced available for duplicate detection diagnostics
  - Structured tracing at event=refresh_requested with phase correlation
duration: 25m
verification_result: passed
completed_at: 2026-03-19
blocker_discovered: false
---

# T02: Add orchestrator snapshot handle + refresh control seam

**Introduced SnapshotHandle (Arc<RwLock>-backed read seam) and RefreshSender/Receiver channel with deterministic coalescing for HTTP→orchestrator control, preserving D002 single-authority ownership.**

## What Happened

Added three new type families to `orchestrator.rs`:

1. **SnapshotHandle** — `Arc<RwLock<OrchestratorSnapshot>>` wrapper. The orchestrator creates it via `create_snapshot_handle()`, retains an internal reference, and calls `publish_snapshot()` after every material state change in the `run()` loop. HTTP handlers clone the handle and call `read()` for a consistent point-in-time view.

2. **RefreshSender/RefreshReceiver** — paired channel using `Arc<AtomicBool>` for coalescing and `tokio::sync::Notify` for wake-up. `RefreshSender::request_refresh()` atomically sets a pending flag and notifies; if already pending, returns `coalesced: true`. The orchestrator's `run()` loop uses `tokio::select!` to wake early on notification, clears the flag via `take_pending()`, and emits `RuntimeEvent::RefreshRequested`.

3. **RuntimeEvent variants** — `RefreshRequested` and `RefreshCoalesced` added for diagnostics.

Updated `http_server.rs` to:
- Import and use `domain::RefreshRequestOutcome` (removed duplicate local type)
- Implement `SnapshotSource` for `SnapshotHandle` and `RefreshControl` for `RefreshSender`
- Import types from `orchestrator` module without orchestrator depending on http_server

Updated `http_server_tests.rs` to import `RefreshRequestOutcome` from `domain` instead of `http_server`.

## Verification

- `cargo test --test orchestrator_tests refresh -- --nocapture` → 10 passed (all refresh channel + integration tests)
- `cargo test --test orchestrator_tests snapshot -- --nocapture` → 8 passed (all snapshot handle tests)
- `cargo test --test orchestrator_tests` → 28 passed (15 existing + 13 new, no regressions)
- `cargo test --test http_server_tests` → 7 failed (expected: T01 red suite, handlers are stubs; T03 scope)
- `cargo build` → clean, zero warnings

### Slice-level verification status (intermediate task):
- `tests/http_server_tests.rs` — 0/7 passing (expected: stub handlers; T03 implements)
- `tests/orchestrator_tests.rs` — 28/28 passing (all refresh/snapshot contracts proven)
- `cargo build` — passes

## Diagnostics

- Inspect refresh behavior: filter orchestrator events for `RuntimeEvent::RefreshRequested` / `RefreshCoalesced`
- Inspect snapshot freshness: `SnapshotHandle::read()` returns the last published snapshot; the `run()` loop publishes after every tick + retry cycle
- Test the channel primitives directly: `refresh_channel()` returns standalone sender/receiver pair suitable for unit tests

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/orchestrator.rs` — Added SnapshotHandle, RefreshSender/Receiver types, refresh_channel() factory, RuntimeEvent::RefreshRequested/Coalesced variants, orchestrator create_snapshot_handle/create_refresh_channel/publish_snapshot methods, updated run() with select!-based refresh wake-up
- `src/http_server.rs` — Removed duplicate RefreshRequestOutcome, added trait impls for SnapshotHandle→SnapshotSource and RefreshSender→RefreshControl
- `tests/orchestrator_tests.rs` — Added 13 tests: snapshot handle read/publish/clone/totals, refresh channel queue/coalesce/take/reset/clone/notify, orchestrator integration
- `tests/http_server_tests.rs` — Updated import to use domain::RefreshRequestOutcome
