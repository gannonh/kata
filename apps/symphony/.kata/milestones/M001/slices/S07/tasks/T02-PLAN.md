---
estimated_steps: 5
estimated_files: 4
---

# T02: Add orchestrator snapshot handle + refresh control seam

**Slice:** S07 — HTTP Dashboard and JSON API
**Milestone:** M001

## Description

Introduce a control/read seam between orchestrator and HTTP layer that preserves D002 single-authority ownership. HTTP must read snapshots and request refreshes without directly mutating orchestrator internals.

## Steps

1. Add orchestrator-owned shared snapshot publication (read handle) that updates whenever runtime state changes materially.
2. Add a best-effort refresh request channel into orchestrator and process it in the runtime loop alongside polling ticks.
3. Implement duplicate refresh coalescing semantics so repeated near-term requests do not queue unbounded immediate ticks.
4. Extend orchestrator tests to assert refresh request handling/coalescing and snapshot publication stability.
5. Wire the new handle/control types so `http_server` can consume them without depending on mutable orchestrator internals.

## Must-Haves

- [ ] Orchestrator exposes a read-only snapshot handle suitable for concurrent HTTP reads
- [ ] Orchestrator exposes a refresh request sender that does not permit direct state mutation
- [ ] Duplicate refresh requests are coalesced deterministically
- [ ] Existing orchestrator scheduling semantics (reconcile/dispatch/retry) remain intact
- [ ] Tests prove refresh control works and snapshot data remains authoritative for API use

## Verification

- `cargo test --test orchestrator_tests refresh -- --nocapture`
- `cargo test --test orchestrator_tests snapshot -- --nocapture`

## Observability Impact

- Signals added/changed: Refresh control path emits explicit requested/coalesced diagnostics and preserves correlation fields.
- How a future agent inspects this: Inspect orchestrator runtime events and published snapshot handle state through tests and `/api/v1/state` in later tasks.
- Failure state exposed: Coalescing failures and missing refresh handling become visible as deterministic test failures and structured runtime events.

## Inputs

- `src/orchestrator.rs` — current S06 authority loop and retry/tick flow
- `src/domain.rs` — snapshot payload contract to preserve
- `tests/orchestrator_tests.rs` — existing scheduler regression suite
- `.kata/DECISIONS.md` — D002 single-authority constraint

## Expected Output

- `src/orchestrator.rs` — snapshot/read + refresh/control seam implementation
- `src/domain.rs` — any control-surface support types needed for HTTP integration
- `tests/orchestrator_tests.rs` — passing tests for refresh/coalescing/snapshot publication behavior
- `tests/http_server_tests.rs` — updated to consume real control/read handles
