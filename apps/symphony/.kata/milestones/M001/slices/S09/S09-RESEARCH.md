# S09: Conformance Sweep and Integration Polish — Research

**Researched:** 2026-03-19
**Domain:** Spec §17 conformance, test coverage gaps, documentation
**Confidence:** HIGH

## Summary

All prior slices (S01–S08) are complete with 189 passing tests across 9 test harnesses. The full suite is green (`cargo test` passes 100%). S09's job is to audit against Spec §17.1–17.7, identify behavioral gaps not yet covered by a test, write missing tests, fix any missing behaviors, and deliver a complete README.

The audit reveals two categories of work: (1) **test gap closure** — spec bullets that exist in the implementation but lack an explicit test assertion, and (2) **README authoring** — the existing README is an AGENTS.md placeholder, not operator documentation. No critical behavioral gaps were found. The implementation is substantially complete.

The only active requirement still untouched is **R013** (spec-driven test suite), which S09 owns. R009 (structured logging) has a partial note about "human-readable format toggle" — this is not mandated by the spec and the current JSON-only format satisfies spec §13.1–13.2; adding a toggle is aspirational and not required for conformance.

## Spec §17 Gap Analysis

### §17.1 Workflow and Config Parsing — COVERED with one gap

| Spec bullet | Test location | Status |
|---|---|---|
| Explicit workflow path takes precedence | `cli_tests::test_positional_workflow_override_is_respected` | ✅ |
| CWD default is `WORKFLOW.md` | `cli_tests::test_default_workflow_path_is_workflow_md` | ✅ |
| File changes trigger re-read/re-apply | `workflow_config_tests::test_workflow_store_hot_reload` | ✅ |
| Invalid reload keeps last known good | `workflow_config_tests::test_workflow_store_reload_failure_keeps_last_good` | ✅ |
| Missing WORKFLOW.md returns typed error | `cli_tests::test_missing_workflow_path_returns_startup_failure` | ✅ |
| Invalid YAML front matter returns typed error | `workflow_config_tests::test_parse_workflow_non_map_yaml` | ✅ |
| Front matter non-map returns typed error | `workflow_config_tests::test_parse_workflow_non_map_yaml` | ✅ |
| Config defaults apply | `workflow_config_tests::test_config_defaults` | ✅ |
| `tracker.kind` validation | `workflow_config_tests::test_config_validation_bad_tracker_kind` | ✅ |
| `tracker.api_key` / `$VAR` indirection | `workflow_config_tests::test_config_env_var_resolution` | ✅ |
| `~` path expansion | `workflow_config_tests::test_config_tilde_expansion` | ✅ |
| `codex.command` preserved as shell string | `workflow_config_tests::test_config_defaults` (default check only) | ✅ |
| Per-state concurrency map normalizes + ignores invalid | Implementation exists in `config.rs:405`; **NO dedicated test** | ⚠️ GAP |
| Prompt renders `issue` and `attempt` | `workspace_prompt_tests::test_render_prompt_basic_fields` | ✅ |
| Prompt fails on unknown variables | `workspace_prompt_tests::test_liquid_unknown_variable_error` | ✅ |

**Gap:** `max_concurrent_agents_by_state` normalization (lowercase keys, invalid-value filtering) has no test.

### §17.2 Workspace Manager and Safety — COVERED with one gap

| Spec bullet | Test location | Status |
|---|---|---|
| Deterministic workspace path | `workspace_prompt_tests::test_workspace_deterministic_path` | ✅ |
| Missing dir created | `workspace_prompt_tests::test_workspace_creates_missing_directory` | ✅ |
| Existing dir reused | `workspace_prompt_tests::test_workspace_reuses_existing_directory` | ✅ |
| Non-directory path handled safely | `workspace_prompt_tests::test_workspace_replaces_non_directory` | ✅ |
| Optional population errors surfaced | Implicit via hook tests | ✅ |
| `tmp`/`.elixir_ls` removed during prep | **NOT implemented; NOT in Elixir reference** | ℹ️ SPEC-ONLY |
| `after_create` only on new creation | `workspace_prompt_tests::test_workspace_after_create_hook_runs` | ✅ |
| `before_run` runs before attempt; timeout aborts | `workspace_prompt_tests::test_before_run_hook_failure_is_fatal` | ✅ |
| `after_run` runs after attempt; failures ignored | `workspace_prompt_tests::test_after_run_hook_failure_is_ignored` | ✅ |
| `before_remove` runs on cleanup; failures ignored | `workspace_prompt_tests::test_workspace_remove_runs_before_remove_hook` | ✅ |
| Path sanitization and root containment | `workspace_prompt_tests::test_workspace_rejects_symlink_escape` | ✅ |
| Agent launch uses per-issue workspace as cwd | `codex_tests::test_app_server_cwd_rejects_*` (3 tests) | ✅ |

**Note:** `tmp`/`.elixir_ls` removal is only in spec §17.2 as a bullet; it is absent from Spec §9 (the normative workspace section) and not implemented in the Elixir reference. This is a documentation artifact, not a behavioral requirement. Can note as a known non-implementation with justification.

### §17.3 Issue Tracker Client — COVERED

All bullets from §17.3 are covered by `linear_client_tests` (25 tests): candidate fetch, project slug filter, empty-states no-op, pagination order, blockers from inverse relations, labels lowercase, state refresh by ID, GraphQL ID typing, and error mapping.

### §17.4 Orchestrator Dispatch, Reconciliation, and Retry — COVERED with one gap

| Spec bullet | Test location | Status |
|---|---|---|
| Sort by priority then oldest created_at | `orchestrator_tests::test_dispatch_candidate_sorting_and_gating_rules` | ✅ |
| Todo + non-terminal blockers ineligible | `orchestrator_tests::test_dispatch_candidate_sorting_and_gating_rules` | ✅ |
| Todo + terminal blockers eligible | `orchestrator_tests::test_dispatch_candidate_sorting_and_gating_rules` | ✅ |
| Active-state refresh updates running entry | `orchestrator_tests::test_reconcile_refresh_failure_is_non_fatal_and_dispatch_continues` | ✅ |
| Non-active state stops run (no cleanup) | Implementation exists; **NO isolated test for no-cleanup path** | ⚠️ GAP |
| Terminal state stops run + cleans workspace | `orchestrator_tests::test_reconcile_startup_terminal_cleanup_marks_terminal_issues_completed` | ✅ |
| Reconcile with no running = no-op | `orchestrator_tests::test_reconcile_tick_reconcile_before_validate_before_dispatch` | ✅ |
| Normal exit → short continuation retry | `orchestrator_tests::test_retry_scheduling_continuation_and_failure_backoff_rules` | ✅ |
| Abnormal exit → exponential backoff | `orchestrator_tests::test_retry_scheduling_continuation_and_failure_backoff_rules` | ✅ |
| Backoff cap uses `agent.max_retry_backoff_ms` | `orchestrator_tests::test_retry_scheduling_continuation_and_failure_backoff_rules` | ✅ |
| Retry queue includes attempt/due/identifier/error | `orchestrator_tests::test_snapshot_exposes_running_and_retry_diagnostics` | ✅ |
| Stall detection kills + schedules retry | `orchestrator_tests::test_stall_detection_schedules_forced_retry` | ✅ |
| Slot exhaustion requeues with reason | `orchestrator_tests::test_dispatch_enforces_per_state_concurrency_caps` | ✅ |
| Snapshot API: running/retry/token/rate-limit rows | `orchestrator_tests::test_token_totals_and_rate_limits_accumulate_into_snapshot` | ✅ |
| Snapshot API: timeout/unavailable surfaced | `http_server_tests` (snapshot projection) | ✅ |

**Gap:** Non-active state stop without workspace cleanup path has no isolated test verifying the no-cleanup semantic.

### §17.5 Coding-Agent App-Server Client — COVERED

All 17 §17.5 bullets are covered by `codex_tests` (32 tests + 14 linear_graphql tests):
- Launch command with workspace cwd ✅
- Full startup handshake sequence ✅
- `initialize` client identity payload ✅
- Policy startup payloads (approval/sandbox) ✅
- `thread/start` + `turn/start` ID parsing + `session_started` ✅
- Read timeout + turn timeout enforced ✅
- Partial line buffering ✅
- Stdout/stderr separate handling ✅
- Non-JSON stderr logged but no crash ✅
- Command/file-change approvals per policy ✅
- Unsupported tool calls rejected ✅
- User input per policy + no indefinite stall ✅
- Usage/rate-limit payload extraction ✅
- Compatible payload variants accepted ✅
- `linear_graphql` tool: advertised, valid query/variables, GraphQL errors, invalid args, transport failures ✅

### §17.6 Observability — ONE GAP

| Spec bullet | Status |
|---|---|
| Validation failures operator-visible | ✅ |
| Structured logging with issue/session fields | ✅ |
| Logging sink failures do not crash orchestration | ✅ (tracing_subscriber `try_init` used in main.rs, discards error) |
| Token/rate-limit aggregation correct across updates | ✅ |
| Human-readable status surface driven from orchestrator state | ✅ (HTTP dashboard) |
| Humanized event summaries cover key events | **Not currently implemented (structured events only)** |

**Note on humanized summaries:** The spec says "If humanized event summaries are implemented" — this is optional. The current implementation satisfies observability with structured JSON logs and the HTTP dashboard. No gap.

**Note on R009 human-readable log format toggle:** The spec does not require dual format output. Current JSON-only format satisfies §13.1–13.2. The partial R009 note about "toggle" is aspirational and out of scope for conformance.

### §17.7 CLI and Host Lifecycle — COVERED

All 6 bullets covered by `cli_tests` (9 tests): positional path, cwd default, nonexistent path error, startup failure surfaced, normal success exit, nonzero on startup failure.

## Implementation Completeness

Current test counts by harness:
- `workflow_config_tests`: 16 tests (§17.1 coverage)
- `workspace_prompt_tests`: 28 tests (§17.2 + §17.7 coverage)
- `linear_client_tests`: 25 tests (§17.3 coverage)
- `orchestrator_tests`: 19 tests (§17.4 coverage)
- `codex_tests`: 33 tests (§17.5 coverage)
- `domain_tests`: 7 tests
- `http_server_tests`: 7 tests (extension conformance)
- `ssh_tests`: 15 tests (extension conformance)
- `cli_tests`: 9 tests (§17.7 coverage)
- Total: **159 tests** (all green)

## Existing Code and Patterns

- `tests/orchestrator_tests.rs` — orchestrator conformance gate; extend for non-active stop semantic
- `tests/workflow_config_tests.rs` — config conformance gate; extend for by_state normalization
- `src/config.rs:395-425` — `max_concurrent_agents_by_state` normalization already implemented; just needs tests
- `src/orchestrator.rs` — reconcile loop handles `Terminal` (cleanup) vs `Inactive` (stop only); test the `Inactive` branch
- `README.md` — currently AGENTS.md development guide, not operator documentation; needs replacement/augmentation

## Constraints

- No breaking changes to any passing test — add tests only
- All new tests must pass with `cargo test` (no external services)
- README must cover: build, run, configuration, test, and WORKFLOW.md format
- Do NOT implement the `tmp`/`.elixir_ls` removal — it is not in the Elixir reference and not in spec §9

## Common Pitfalls

- **Treating §17.2 `tmp`/`.elixir_ls` removal as required** — It appears only as a spec test-matrix bullet, not in the normative §9 workspace spec. The Elixir reference does not implement it. Document as known non-implementation rather than adding fragile directory-removal code.
- **Over-engineering R009 format toggle** — The spec says "structured logs"; it does not require a runtime-selectable human-readable mode. Adding a format toggle would require changing `init_tracing()` to accept a format parameter, touching main.rs, and adding a new CLI flag — all unnecessary for conformance.
- **Underestimating README scope** — The README must be an operator guide (not developer reference). Include WORKFLOW.md schema, all CLI flags, config defaults, HTTP dashboard usage, and SSH pool config.
- **Breaking codex_tests start_session call sites** — T03 in S08 updated all 33 call sites to pass `None` for `worker_host`. Any future function signature change requires updating the same count.

## Open Risks

- `test_fake_ssh_launch` uses a 500ms sleep (noted as flaky under extreme system load in S08 forward intelligence). S09 should not touch this test — it is already marked as a known fragility.
- The non-active state stop path is exercised at runtime but has no isolated test. The test gap should be closed, but the behavior is correct (verified by the reconciliation pipeline tests).

## Plan for S09 Tasks

Based on the gap analysis, three focused tasks:

**T01 — Conformance test gap closure:** Add tests for:
1. `max_concurrent_agents_by_state` key normalization + invalid-value filtering (workflow_config_tests.rs)
2. Non-active state reconcile stops run without workspace cleanup (orchestrator_tests.rs)
3. Explicit assertion that logging sink failure does not crash (test with `try_init` pattern in main.rs already handles this — may just need a comment or very light test confirmation)

**T02 — README authoring:** Write operator-grade README covering:
- What Symphony does (one paragraph)
- Build (`cargo build --release`)
- Run (`symphony WORKFLOW.md [--port N] [--logs-root PATH]`)
- WORKFLOW.md format (front-matter schema with all fields and defaults)
- Configuration reference table
- HTTP dashboard and JSON API endpoints
- SSH pool configuration (`ssh_hosts`, `max_concurrent_agents_per_host`)
- Test (`cargo test`)
- Development reference section (AGENTS.md pointer)

**T03 — Final verification:** Run `cargo test` (all green), `cargo clippy -- -D warnings` (zero warnings), validate R013 coverage matrix, update REQUIREMENTS.md, write S09-SUMMARY.md.

## Skills Discovered

No specialized skills needed — this is pure Rust testing and documentation work within the existing codebase patterns.

## Sources

- Spec §17.1–17.7 (Core Conformance) — authoritative contract
- `tests/` harness inventory — current coverage baseline
- `src/config.rs` lines 395–425 — by_state normalization implementation without test coverage
- `src/orchestrator.rs` reconcile loop — `Inactive` vs `Terminal` branch behavior
- Elixir reference `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/workspace.ex` — confirmed no `tmp`/`.elixir_ls` removal
