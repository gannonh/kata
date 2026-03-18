# S06: Orchestrator Core — Research

**Date:** 2026-03-18

## Summary

S06 is the orchestration inflection point: this slice directly owns **R006 (orchestrator state machine)**, **R008 (CLI entrypoint behavior)**, and **R014 (dispatch preflight validation)**, while also carrying integration responsibility for **R009 (structured issue/session logging)** and **R015 (aggregate token/rate-limit accounting)**. The upstream slices are solid and intentionally separated: config parsing/reload is done (`workflow_store` + `config::validate`), tracker reads are done (`LinearClient`/`TrackerAdapter`), workspace safety/prompt rendering are done (`workspace`, `path_safety`, `prompt_builder`), and Codex protocol handling is done (`codex::app_server`). S06 is primarily about wiring these pieces into a single-authority runtime loop that is resilient under failure.

The largest implementation gap is structural: there is currently **no `src/orchestrator.rs`**, `lib.rs` still comments it out, and `main.rs` only parses CLI args then prints `"Symphony starting..."`. There are also model seams to resolve before coding: `RetryEntry.timer_handle` is still the S01 placeholder (`Option<String>`), and `OrchestratorState.running` currently stores `RunAttempt` (which lacks Codex last-activity/session fields needed for stall detection). These are not blockers, but they require explicit design choices in S06 before tests are written.

Elixir reference behavior (orchestrator + core tests) aligns tightly with Spec §7/§8/§16 pseudocode: reconcile first, validate preflight each tick, sort priority→created_at→identifier, enforce Todo-blocker rule, run continuation retries after normal exit (1s), run exponential backoff on failures, ignore stale retry timers via token matching, and treat tracker refresh failures as non-fatal for currently running workers. Porting this behavior exactly in Rust should be feasible with Tokio task orchestration and mpsc channels.

## Recommendation

Implement S06 as a **single async orchestrator authority** with explicit event ingress and deterministic state transitions:

1. **Add `src/orchestrator.rs` + export in `src/lib.rs`**
   - Public API target: `Orchestrator::new(...)`, `run()`, and snapshot/read helpers for S07.
   - Keep all mutable scheduling state owned by one task (D002 parity).

2. **Use a channel-driven event loop with `tokio::select!`**
   - Tick events (poll/reconcile loop)
   - Worker completion events
   - Codex update events (AgentEvent stream)
   - Retry fire events
   - Optional manual refresh trigger (preps S07 `/api/v1/refresh`)

3. **Keep retry timer cancellation out of domain structs**
   - Do not store `JoinHandle` in `RetryEntry` (would break cloneability and domain portability).
   - Keep timer handles/tokens in orchestrator-internal maps; keep domain `RetryEntry` serializable/snapshot-safe.

4. **Enforce per-tick preflight contract (R014)**
   - Every tick: `reconcile_running_issues` first, then `config::validate(&effective_config.1)`.
   - On validation failure: skip dispatch only, keep reconciliation active, log operator-visible error.

5. **Implement worker attempt flow in orchestrator-owned spawned task(s)**
   - `ensure_workspace` → `run_before_run_hook` → `start_session` → turn loop with `render_prompt` + continuation guidance + issue refresh checks → `stop_session` → `run_after_run_hook` best-effort.
   - Reuse S05 `run_turn` callback to forward `AgentEvent` into orchestrator state updates.

6. **Wire CLI behavior in `main.rs` (R008)**
   - Optional positional path defaults to `WORKFLOW.md`.
   - Validate explicit/default file existence before startup.
   - Return non-zero on startup failure; zero on normal shutdown.

Primary recommendation: build S06 test-first using Rust integration tests that mirror the proven Elixir core behaviors (especially retry/stale-token/stall/reconciliation cases) before introducing S07 HTTP surfaces.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Dispatch preflight validation | `config::validate(&ServiceConfig) -> Result<ValidatedServiceConfig>` | Already encodes required startup/tick checks and error taxonomy; avoids duplicate validation logic drift. |
| Live workflow/config reload | `WorkflowStore::effective_config()` + `WorkflowStore::force_reload()` | Already provides last-known-good semantics and debounced watcher behavior from S02. |
| Tracker polling/state refresh | `TrackerAdapter` + `LinearAdapter` + `LinearClient` fetch methods | Already tested (33 tests) for pagination, normalization, dedupe, and ID-order preservation. |
| Workspace safety + lifecycle hooks | `workspace::{ensure_workspace, run_before_run_hook, run_after_run_hook, remove_workspace}` | Already enforces root containment/symlink safety and timeout semantics from S04. |
| Prompt rendering strictness | `prompt_builder::render_prompt` | Already strict-fails unknown variables and serializes `Issue` consistently. |
| Codex protocol + approvals + tool calls | `codex::app_server::{start_session, run_turn, stop_session}` | Already proven by 32 tests, including timeout/approval/user-input/tool call variants. |
| Token delta extraction | `codex::token_accounting::{extract_token_delta, extract_rate_limits}` | Already handles absolute-total payload variants and zero-on-decrease guards; avoid bespoke parsers. |
| CLI argument parsing | `clap` derive (`Parser`) + `try_parse_from` for tests | Standard, robust CLI parsing with deterministic testability and built-in error formatting. |

## Existing Code and Patterns

- `src/workflow_store.rs` — Runtime config store with watch + debounce + `force_reload`; **does not validate** by design (D017), so S06 must validate at dispatch boundaries.
- `src/config.rs` — `ValidatedServiceConfig` newtype + `validate` function; intended to make unvalidated dispatch impossible if used at function boundaries.
- `src/linear/adapter.rs` — Tracker boundary trait for S06; read methods complete, write methods intentionally unimplemented (don’t depend on writes in S06).
- `src/linear/client.rs` — Candidate fetch and state refresh APIs used by poll/reconcile/retry paths.
- `src/workspace.rs` + `src/path_safety.rs` — Deterministic workspace creation/reuse + path safety + hook timeout behavior.
- `src/prompt_builder.rs` — Strict Liquid rendering (`issue`, `attempt`) for first-turn and retry prompt building.
- `src/codex/app_server.rs` — Session lifecycle and turn streaming; `run_turn` requires injectable `graphql_executor` and event callback.
- `src/domain.rs` — Orchestrator-facing types (`RunAttempt`, `RetryEntry`, `OrchestratorState`, `OrchestratorSnapshot`, `AgentEvent`, `CodexTotals`, `RateLimitInfo`).
- `src/main.rs` — CLI skeleton exists but currently no real startup lifecycle.
- `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/orchestrator.ex` — Reference implementation for tick ordering, reconciliation semantics, retry scheduling, stale-token handling, and slot checks.
- `/Volumes/EVO/kata/openai-symphony/elixir/test/symphony_elixir/core_test.exs` — High-value conformance examples for reconcile outcomes, continuation/failure retry timing, stale retry token behavior, and refresh coalescing.

## Constraints

- **Single-authority mutable state is mandatory** (D002, Spec §7.4): no multi-writer mutation of running/claimed/retry maps.
- **Tick order is fixed** (Spec §8.1): reconcile first, then preflight validation, then candidate fetch/dispatch.
- **Per-tick validation failures must not stop reconciliation** (Spec §8.1 + R014).
- **Todo blocker gating is required**: Todo issues with any non-terminal blocker are ineligible.
- **Retry backoff formula is fixed** (Spec §8.4): continuation=1000ms for attempt 1; failure backoff = `min(10000 * 2^(attempt-1), max_retry_backoff_ms)`.
- **Stall detection uses last Codex activity timestamp** (Spec §8.5), not just run start time.
- **Structured logs must include issue/session context fields** (`issue_id`, `issue_identifier`, `session_id`) per Spec §13.1 / R009.
- **Current domain shape mismatch risk**: `RunAttempt` lacks live-session fields needed for stall+telemetry; either extend domain model or maintain internal runtime map and project to snapshot.
- **`RetryEntry.timer_handle` placeholder remains unresolved** (D008): choose an internal timer-handle strategy that preserves cloneable snapshot/domain state.
- **CLI must provide host lifecycle semantics** (Spec §17.7), not just argument parsing.

## Common Pitfalls

- **Skipping per-tick preflight validation** — This violates R014 and can dispatch with broken config; call `config::validate` every dispatch cycle.
- **Treating tracker refresh failures as fatal** — Spec requires keeping active workers alive and retrying refresh next tick.
- **Double-counting tokens** — Codex payloads often report absolute totals; aggregate by delta from last reported values only.
- **Ignoring stale retry timers** — Without token/nonce checks, superseded timer messages can consume newer retry entries.
- **Blocking the orchestrator authority loop** — Workspace hooks and subprocess waits are blocking surfaces; run worker attempts in spawned tasks and communicate via channels.
- **Case-sensitive state comparisons** — Active/terminal/per-state-cap keys are normalized; use lowercase+trim consistently.
- **Not revalidating issue before dispatch** — Elixir re-fetches issue state pre-dispatch to avoid stale candidate decisions.

## Open Risks

- `OrchestratorState.running: HashMap<String, RunAttempt>` may be too thin for stall detection and rich observability without additional runtime metadata.
- Retry timer cancellation semantics in Rust need explicit design to replace `RetryEntry.timer_handle` placeholder cleanly.
- `main.rs` currently does not own a shutdown lifecycle; R008 requires deterministic startup/shutdown exit code behavior.
- There is currently no S06 test harness file; the slice should establish one early (e.g., `tests/orchestrator_tests.rs`) using fake tracker/app-server surfaces.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Tokio runtime (task orchestration, cancellation, channels) | `geoffjay/claude-plugins@tokio-patterns` (43 installs) — install via `npx skills add geoffjay/claude-plugins@tokio-patterns` | available (not installed) |
| Tokio concurrency patterns | `geoffjay/claude-plugins@tokio-concurrency` (34 installs) — install via `npx skills add geoffjay/claude-plugins@tokio-concurrency` | available (not installed) |
| Axum ecosystem (future S07 dependency adjacent to S06 snapshots) | `bobmatnyc/claude-mpm-skills@axum` (136 installs) — install via `npx skills add bobmatnyc/claude-mpm-skills@axum` | available (not installed) |
| Clap CLI ergonomics | `bobmatnyc/claude-mpm-skills@clap` (70 installs) — install via `npx skills add bobmatnyc/claude-mpm-skills@clap` | available (not installed) |
| Linear workflow operations | `kata-linear` (bundled local skill) | installed (already available) |

## Sources

- Poll/reconcile/dispatch/backoff/stall/startup cleanup contract (source: `SPEC.md` §7.1–§8.6, §16.2–§16.6, §17.4, §17.6, §17.7) — `/Volumes/EVO/kata/openai-symphony/SPEC.md`
- Reference orchestrator behavior (source: `orchestrator.ex`) — `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/orchestrator.ex`
- Reference worker-turn lifecycle + continuation prompt behavior (source: `agent_runner.ex`) — `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/agent_runner.ex`
- Reference CLI lifecycle semantics (source: `cli.ex`, `cli_test.exs`) — `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/cli.ex`, `/Volumes/EVO/kata/openai-symphony/elixir/test/symphony_elixir/cli_test.exs`
- Reconciliation/retry edge-case tests (source: `core_test.exs`) — `/Volumes/EVO/kata/openai-symphony/elixir/test/symphony_elixir/core_test.exs`
- Existing Rust orchestration dependencies and seams (source: `src/config.rs`, `src/workflow_store.rs`, `src/linear/client.rs`, `src/linear/adapter.rs`, `src/workspace.rs`, `src/prompt_builder.rs`, `src/codex/app_server.rs`, `src/codex/token_accounting.rs`, `src/domain.rs`, `src/main.rs`, `src/lib.rs`)
- Tokio cancellation/channel semantics (source: Context7 `Tokio` docs ID `/websites/rs_tokio_tokio`, query: "JoinHandle abort cancellation semantics timeout select mpsc unbounded_channel spawn_blocking")
- Clap parsing/testing semantics (source: Context7 `Clap` docs ID `/websites/rs_clap`, query: "derive Parser optional positional argument with default_value and long options, parse errors and exit behavior, try_parse_from")
- tracing-subscriber JSON structured logging configuration (source: Context7 docs ID `/websites/rs_tracing-subscriber`, query: "fmt json output include target and fields")
- Skill discovery results (source: `npx skills find "tokio"`, `npx skills find "axum"`, `npx skills find "linear api"`, `npx skills find "clap rust cli"`)
