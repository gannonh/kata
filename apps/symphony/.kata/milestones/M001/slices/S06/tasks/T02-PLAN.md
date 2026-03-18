---
estimated_steps: 5
estimated_files: 4
---

# T02: Implement orchestrator authority loop, reconciliation, and dispatch gating

**Slice:** S06 — Orchestrator Core
**Milestone:** M001

## Description

Implement the scheduling spine in `orchestrator.rs`: startup cleanup, reconcile-first tick ordering, per-tick dispatch preflight validation, candidate eligibility/sorting, and slot-based dispatch gating. This task closes the deterministic control plane for R006/R014 before worker lifecycle complexity is added.

## Steps

1. Implement `Orchestrator::new` and internal state ownership model (single mutable authority) plus startup terminal cleanup using tracker terminal-state fetch.
2. Implement tick loop ordering: reconcile running issues first, then validate effective config (`config::validate`), then fetch/filter/sort candidates and evaluate dispatch slots.
3. Implement candidate eligibility and ordering functions: claimed/running/completed exclusion, Todo blocker gating, active-state requirement, priority→created_at→identifier ordering, and pre-dispatch issue-state refresh.
4. Implement dispatch gating for both global max concurrency and per-state caps, with deterministic state updates when an issue is claimed and launched.
5. Make existing red tests from T01 pass for reconcile/validation/dispatch behavior and update snapshot construction to reflect running/claimed/retry state accurately.

## Must-Haves

- [ ] Reconcile is always executed before dispatch attempts in each tick
- [ ] Preflight validation is performed every dispatch cycle and dispatch is skipped (not fatal) when invalid
- [ ] Startup terminal cleanup removes or marks terminal issues before first dispatch cycle
- [ ] Candidate ordering and gating logic match spec intent and test expectations
- [ ] Global and per-state concurrency caps are both enforced
- [ ] Pre-dispatch refresh rejects stale/non-active issue states

## Verification

- `cargo test --test orchestrator_tests test_reconcile`
- `cargo test --test orchestrator_tests test_preflight`
- `cargo test --test orchestrator_tests test_dispatch`

## Observability Impact

- Signals added/changed: Structured tick-phase logs (`phase=reconcile|validate|dispatch`), dispatch-skip reason logs (`reason=preflight_invalid|slot_full|blocked`).
- How a future agent inspects this: Use `OrchestratorSnapshot` plus orchestrator test fake call history to confirm ordering and gating decisions.
- Failure state exposed: Validation failures and dispatch rejections become explicit, typed reasons instead of silent no-ops.

## Inputs

- `tests/orchestrator_tests.rs` — failing contract tests to satisfy
- `src/config.rs` — `validate` preflight function and error taxonomy
- `src/linear/adapter.rs` — `TrackerAdapter` read contract used by orchestrator
- `src/workflow_store.rs` — effective config source for each tick

## Expected Output

- `src/orchestrator.rs` — working reconcile/validate/dispatch scheduler core
- `src/domain.rs` — any required state-shape refinements for scheduler correctness
- `tests/orchestrator_tests.rs` — passing reconcile/preflight/dispatch sections
- `src/lib.rs` — orchestrator module export wired for consumers
