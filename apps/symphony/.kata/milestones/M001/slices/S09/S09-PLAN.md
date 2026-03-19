# S09: Conformance Sweep and Integration Polish

**Goal:** Close the two identified spec §17 test gaps, author an operator-grade README, and run a final verification pass to confirm all active requirements are met and `cargo test` + `cargo clippy` both pass clean.
**Demo:** `cargo test` emits 161+ passing tests (all green, zero warnings from clippy). `README.md` explains build, run, configuration, HTTP dashboard, SSH pool, and WORKFLOW.md schema in operator terms. R013 is validated.

## Must-Haves

- `max_concurrent_agents_by_state` key normalization + invalid-value filtering is asserted by a dedicated test in `tests/workflow_config_tests.rs`
- Non-active state reconcile stop-without-cleanup path has an isolated test in `tests/orchestrator_tests.rs`
- `README.md` documents build, run, configuration, WORKFLOW.md schema, HTTP dashboard endpoints, SSH pool, and test invocation
- `cargo test` passes all tests (all prior 159 + 2 new = 161+)
- `cargo clippy -- -D warnings` exits zero
- `REQUIREMENTS.md` marks R013 validated with proof

## Proof Level

- This slice proves: final-assembly
- Real runtime required: no (all proofs are unit/integration tests + static analysis)
- Human/UAT required: no

## Verification

- `cargo test` — all tests pass (≥161, zero failures)
- `cargo clippy -- -D warnings` — exits zero, no warnings
- `grep -q "R013" .kata/REQUIREMENTS.md` and status shows `validated`
- `README.md` contains sections: "Build", "Run", "WORKFLOW.md Format", "Configuration Reference", "HTTP Dashboard and API", "SSH Pool", "Testing"

## Observability / Diagnostics

- Runtime signals: none (test-only slice; no new runtime code paths)
- Inspection surfaces: `cargo test --test workflow_config_tests -- --nocapture`, `cargo test --test orchestrator_tests -- --nocapture`
- Failure visibility: new tests emit descriptive failure messages inline with `assert_eq!` / `assert!`; clippy warnings printed to stderr
- Redaction constraints: none (tests use synthetic/fixture data only)

## Integration Closure

- Upstream surfaces consumed: `src/config.rs:395-425` (by_state normalization already implemented), `src/orchestrator.rs` reconcile loop (`Inactive` branch), all prior test harnesses
- New wiring introduced in this slice: none (tests extend existing harnesses; README is documentation)
- What remains before the milestone is truly usable end-to-end: nothing — this is the final assembly slice

## Tasks

- [x] **T01: Add conformance test gap closure** `est:45m`
  - Why: Two spec §17 behaviors are implemented but have no isolated test — by_state normalization (§17.1) and non-active state stop-without-cleanup (§17.4). These are the only gaps between the current 159-test baseline and full conformance coverage.
  - Files: `tests/workflow_config_tests.rs`, `tests/orchestrator_tests.rs`
  - Do: (1) In `workflow_config_tests.rs`, add `test_by_state_concurrency_normalization` — construct a raw WORKFLOW.md with `max_concurrent_agents_by_state` containing uppercase keys (e.g. `InProgress`), zero-value entries, and a valid entry; parse through `ServiceConfig::from_workflow`; assert keys are lowercased, zero/invalid values are filtered, valid entries survive. (2) In `orchestrator_tests.rs`, add `test_reconcile_non_active_state_stops_run_without_cleanup` — set up orchestrator with a running issue, have the fake tracker return a non-active (but non-terminal) state, run one reconcile tick, assert the running entry is removed but workspace cleanup was NOT called (workspace_cleanup_calls == 0).
  - Verify: `cargo test --test workflow_config_tests test_by_state_concurrency_normalization` passes; `cargo test --test orchestrator_tests test_reconcile_non_active_state_stops_run_without_cleanup` passes
  - Done when: both new tests appear in `cargo test` output with "ok", total test count is 161+

- [ ] **T02: Write operator-grade README** `est:60m`
  - Why: The current README is a development reference (AGENTS.md clone). Operators need build/run/configure instructions. R013 owns README as the human-usable documentation surface.
  - Files: `README.md`
  - Do: Replace (or fully overwrite) the existing README with an operator guide containing: (1) one-paragraph summary of what Symphony does; (2) Prerequisites (Rust toolchain, `cargo build --release`); (3) Run section — `symphony WORKFLOW.md [--port N] [--logs-root PATH]` with exit code semantics; (4) WORKFLOW.md Format — YAML front-matter schema table with all fields, types, defaults, and notes (tracker, polling_interval_ms, workspace, hooks, agent, codex, server, ssh_hosts, max_concurrent_agents_per_host); (5) Configuration Reference — environment variable override table ($VAR resolution, LINEAR_API_KEY, SYMPHONY_SSH_CONFIG); (6) HTTP Dashboard and API — endpoints list (GET /, GET /api/v1/state, GET /api/v1/:issue, POST /api/v1/refresh) with sample JSON shapes; (7) SSH Pool — ssh_hosts format, max_concurrent_agents_per_host, SYMPHONY_SSH_CONFIG; (8) Testing — `cargo test`, `cargo clippy -- -D warnings`; (9) brief Development Reference pointer to AGENTS.md.
  - Verify: `grep -c "## " README.md` returns ≥7 (sections present); manual scan confirms WORKFLOW.md schema table, HTTP endpoint list, and SSH section are present
  - Done when: README contains all required sections with accurate content derived from the actual implementation

- [ ] **T03: Final verification, REQUIREMENTS.md update, and summary prep** `est:20m`
  - Why: Closes the milestone loop — validates R013, marks requirements, and confirms the full suite is green before writing S09-SUMMARY.md.
  - Files: `.kata/REQUIREMENTS.md`, `.kata/STATE.md`
  - Do: (1) Run `cargo test` — record final test count and confirm zero failures. (2) Run `cargo clippy -- -D warnings` — confirm zero warnings. (3) In `REQUIREMENTS.md`, update R013 status from `active` to `validated` with proof note referencing new test names and total test count. (4) Update the R013 traceability row in the coverage table. (5) Update `Coverage Summary` counts. (6) Update `.kata/STATE.md` to reflect S09 complete.
  - Verify: `cargo test` exits 0; `cargo clippy -- -D warnings` exits 0; `grep "validated" .kata/REQUIREMENTS.md | grep R013` returns a match
  - Done when: All tests pass, clippy clean, R013 marked validated, STATE.md updated

## Files Likely Touched

- `tests/workflow_config_tests.rs`
- `tests/orchestrator_tests.rs`
- `README.md`
- `.kata/REQUIREMENTS.md`
- `.kata/STATE.md`
