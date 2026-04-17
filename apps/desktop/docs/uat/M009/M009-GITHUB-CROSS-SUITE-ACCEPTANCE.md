# M009/S06 Final Cross-Suite GitHub Acceptance Report

**Date:** 2026-04-17  
**Issue:** [KAT-2708](https://linear.app/kata-sh/issue/KAT-2708/s06-final-cross-suite-end-to-end-github-acceptance)  
**Method:** Deterministic cross-suite contract lane + runtime smoke + desktop evidence capture  
**Runbook:** [M009-GITHUB-CROSS-SUITE-RUNBOOK.md](./M009-GITHUB-CROSS-SUITE-RUNBOOK.md)

---

## Summary

| # | Checkpoint | Status | Evidence |
|---|---|---|---|
| 1 | CI GitHub backend validation lane passes end-to-end | PASS | `evidence/01-ci-github-backend-validation.log` |
| 2 | CLI runtime smoke derives state against live GitHub API (token-enabled) | PASS | `evidence/04-cli-runtime-smoke.log` |
| 3 | Desktop GitHub workflow backend contract tests pass | PASS | `evidence/01-ci-github-backend-validation.log` (Desktop Vitest group) |
| 4 | Symphony GitHub execution contract suite passes | PASS | `evidence/01-ci-github-backend-validation.log` (Symphony cargo group) |
| 5 | Failure-path diagnostic: missing token returns actionable guidance | PASS | `evidence/02-cli-missing-token-diagnostic.log` |
| 6 | Failure-path diagnostic: unknown Projects v2 status errors explicitly | PASS | `evidence/03-symphony-unknown-status-diagnostic.log` |
| 7 | Desktop workflow board screenshot artifact is captured for reviewer inspection | PASS | `evidence/screenshots/01-workflow-board-after-refresh.png`, `evidence/05-desktop-github-e2e.log` |

**Overall:** PASS

---

## Requirement ownership re-check

- **Primary assembled acceptance contract (S06):** satisfied by checkpoints 1–7.
- **R026 support (truthful workflow board/PR context surface):** validated by Desktop GitHub workflow contract tests in CI lane and captured Desktop board screenshot artifact.
- **R029 support (deterministic validation behavior):** validated by deterministic scripted lane and stable replayable log artifacts under `docs/uat/M009/evidence/`.

---

## Milestone success criteria re-check (M009-ROADMAP)

1. **CLI can derive active GitHub-backed workflow state** — **PASS** (`04-cli-runtime-smoke.log`).
2. **/kata plan-style GitHub artifact contracts remain healthy** — **PASS** (CLI Vitest/Bun suites in `01-ci-github-backend-validation.log`).
3. **Symphony GitHub execution semantics coherent with CLI contract** — **PASS** (Symphony contract suites in `01-ci-github-backend-validation.log`).
4. **Desktop monitors workflow state with GitHub backend contracts** — **PASS** (Desktop contract suites + screenshot evidence).
5. **CI contains deterministic GitHub backend lane** — **PASS** (`01-ci-github-backend-validation.log`).
6. **One assembled run proves planning/execution/monitoring/CI loop** — **PASS** (single scripted run + all artifacts in this folder).

---

## Failure-path diagnostics captured

### A) Missing GitHub token (CLI preflight)

- Command: `bun test ... --test-name-pattern "token is missing"`
- Result: pass; emits `[kata][backend-bootstrap] {"status":"invalid_config","diagnostics":["missing_github_token"]}`
- Evidence: `evidence/02-cli-missing-token-diagnostic.log`

### B) Unknown Projects v2 status (Symphony execution)

- Command: `cargo test ... test_projects_v2_unknown_status_reports_actionable_error -- --exact`
- Result: pass; actionable error contract asserted
- Evidence: `evidence/03-symphony-unknown-status-diagnostic.log`

---

## Gap discovered during assembled proof

A meaningful out-of-scope test-harness gap was discovered while attempting to reuse the legacy GitHub board e2e parity suite directly:

- New backlog issue: [KAT-2773](https://linear.app/kata-sh/issue/KAT-2773/stabilize-desktop-github-workflow-board-e2e-fixture-backend-selection)
- Relation: linked from KAT-2708 as `relates_to`
- Owner: Kata Desktop project backlog
- Reason for separate tracking: this is fixture/backend-selection stabilization work, not a blocker for S06 assembled acceptance artifacts delivered here.

---

## Repro command

```bash
bash scripts/uat/m009-cross-suite-github-acceptance.sh
```

If `GH_TOKEN`/`GITHUB_TOKEN` is set, runtime smoke executes and records live GitHub API evidence; otherwise the smoke step is explicitly marked skipped in `04-cli-runtime-smoke.log`.
