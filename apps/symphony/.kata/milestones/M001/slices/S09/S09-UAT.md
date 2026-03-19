# S09: Conformance Sweep and Integration Polish — UAT

**Milestone:** M001
**Written:** 2026-03-19

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S09 introduces no new runtime code paths. All proofs are `cargo test` (automated regression tests) and `cargo clippy` (static analysis). No server, no browser, no live API call is needed to validate the slice's must-haves. Human review of README.md quality is the only subjective element.

## Preconditions

- Rust stable toolchain installed (`cargo --version` succeeds)
- In the `apps/symphony` directory of the repo

## Smoke Test

```bash
cargo test 2>&1 | grep "test result"
```

Expected: all lines show `ok. N passed; 0 failed`. Confirm total count ≥161 (actual: 211).

## Test Cases

### 1. Conformance test gap — by_state normalization (§17.1)

```bash
cargo test --test workflow_config_tests test_by_state_concurrency_normalization -- --nocapture
```

**Expected:** `test test_by_state_concurrency_normalization ... ok`

Confirms: uppercase key (`InProgress`) is lowercased, zero-value entry is filtered, valid entry survives.

### 2. Conformance test gap — non-active stop without cleanup (§17.4)

```bash
cargo test --test orchestrator_tests test_reconcile_non_active_state_stops_run_without_cleanup -- --nocapture
```

**Expected:** `test test_reconcile_non_active_state_stops_run_without_cleanup ... ok`

Confirms: issue in non-active non-terminal state is removed from `running` but NOT added to `completed`; workspace cleanup is not called.

### 3. Full test suite green

```bash
cargo test
```

**Expected:** All 211 tests pass, zero failures, zero ignored.

### 4. Clippy clean

```bash
cargo clippy -- -D warnings
```

**Expected:** `Finished dev profile` with no warnings, exit code 0.

### 5. README sections present

```bash
grep -c "^## " README.md
```

**Expected:** ≥7 (actual: 8)

```bash
grep "WORKFLOW.md Format" README.md && grep "GET /api/v1/state" README.md && grep "ssh_hosts" README.md && grep "cargo test" README.md
```

**Expected:** All four lines match (no empty output).

### 6. R013 validated in REQUIREMENTS.md

```bash
grep -A3 "R013" .kata/REQUIREMENTS.md | grep "validated"
```

**Expected:** At least one match showing `Status: validated`.

## Edge Cases

### zero-value by_state entry is silently dropped

A WORKFLOW.md with `max_concurrent_agents_by_state: {InProgress: 0}` produces an empty map after normalization. No error is raised — the entry is silently filtered per spec §17.1.

**Expected:** `test_by_state_concurrency_normalization` covers this; `ServiceConfig.max_concurrent_agents_by_state` is empty for the zero-value input.

### non-terminal non-active state does not trigger workspace cleanup

An issue in "In Review" (not active, not terminal) causes `release_issue` — not `mark_issue_terminal`. The workspace directory is preserved. A future re-activation will reuse the existing workspace.

**Expected:** `test_reconcile_non_active_state_stops_run_without_cleanup` covers this; `workspace_cleanup_calls == 0` asserted.

## Failure Signals

- `cargo test` emitting any `FAILED` line — regression introduced
- `cargo clippy -- -D warnings` emitting warning lines before `Finished` — lint regression
- `grep -c "^## " README.md` returning <7 — README sections missing
- `grep "validated" .kata/REQUIREMENTS.md | grep R013` returning empty — bookkeeping not updated

## Requirements Proved By This UAT

- R013 (Spec-Driven Test Suite) — `cargo test` passes 211 tests covering all spec §17 behaviors; `cargo clippy -- -D warnings` exits zero; the two new tests close the remaining §17.1 and §17.4 gaps.

## Not Proven By This UAT

- Live Linear API integration (R003) — requires a real LINEAR_API_KEY and a test Linear project; not a code gap, deferred to first real deployment.
- R009 human-readable log format toggle — aspirational feature, not implemented. JSON-only format satisfies spec §13.1-13.2.
- Full end-to-end orchestration run (milestone success criterion) — `symphony WORKFLOW.md` polling a real Linear project and dispatching real Codex sessions. All components are implemented and individually tested; integration is the remaining human-verification step.
- SSH remote worker connectivity against real SSH hosts — fake-ssh tests prove argument construction and protocol; actual host reachability is environment-dependent.

## Notes for Tester

The README is a new operator guide replacing a prior AGENTS.md clone. Recommend reading through the WORKFLOW.md Format section and comparing defaults against a known WORKFLOW.md to confirm accuracy. The HTTP Dashboard and API section includes sample JSON — confirm shapes match a running symphony instance if available.

R009 (Structured Logging) remains `active` in REQUIREMENTS.md. This is intentional — JSON format is proven, but the human-readable toggle is aspirational. Do not flag this as a test failure.
