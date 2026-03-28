# Changelog

## 0.12.1

### Bug Fixes

- **Milestone descriptions missing in Linear** — The KATA-WORKFLOW prompt doc only told the agent to pass a title when creating milestones, slices, and tasks. The `description` parameter was supported but never mentioned. Updated the workflow doc to instruct the agent to always include a description. This caused all M008+ milestones to appear without blurbs in Linear's UI.

## 0.12.0

### Features

- **Operating Modes context block** — The agent system prompt now includes an explicit "Operating Modes" section explaining the three ways to use Kata CLI: Plan (`/kata plan`), Execute (`/kata auto`/`/kata step`), and Supervise (Symphony). This gives the agent a first-class understanding of how Kata CLI and Symphony work together through the shared Linear backbone.
- **`linear.projectSlug` preference** — New preference field that accepts the short slug ID from Linear project URLs (e.g. `459f9835e809`) instead of the full UUID. Shorter, human-readable, and matches Symphony's `tracker.project_slug`. `linear.projectId` (UUID) remains supported for backward compatibility. When both are set, `projectSlug` takes precedence.

### Bug Fixes

- **Symphony extension fails to load in production** — Fixed `Cannot find module 'js-yaml'` error when running via `npx @kata-sh/cli`. The Symphony config editor modules (`config-parser`, `config-writer`, `config-validator`, `config-editor`) depend on `js-yaml`, which is not in pi-coding-agent's extension loader alias list. These modules are now lazy-imported only when `/symphony config` is invoked, so the rest of the Symphony extension (status, watch, console, escalation) loads without error.

## 0.11.0

### Features

- **Symphony operator console** — `/symphony console` embeds a live dashboard panel inside the Kata CLI chat interface. Shows real-time worker status, tool activity, pending escalations, queue counts. Auto-refreshes from WebSocket stream. Configurable placement via `symphony.console_position` preference.
- **Symphony config editor** — `/symphony config` opens an interactive TUI for editing Symphony WORKFLOW.md configuration. 9 sections, 45 fields with type-aware inputs (dropdowns for enums, toggles for booleans, masked API keys). Validates before save, preserves prompt body below `---`.
- **Worker escalation handler** — when a Symphony worker escalates a question, it appears in the connected Kata CLI session. Operator answers inline, response routes back, worker resumes. No restart needed. `symphony_respond` tool for programmatic responses.
- **Console escalation routing** — with console active, pending escalations are highlighted (⚠️). Operator can respond directly from chat input.
- **`symphony.workflow_path` preference** — configure the path to WORKFLOW.md for the config editor. Resolves from preference, CLI argument, or cwd.
- **`symphony.console_position` preference** — `below-output` (default) or `above-status` panel placement.

### Bug Fixes

- **`pi-tui` version mismatch** — bumped `@mariozechner/pi-tui` from `^0.62.0` to `^0.63.1` to match `pi-coding-agent@0.63.1`. Fixes silent extension load failure.
- **`/symphony watch` autocomplete** — no longer overwrites user input with hardcoded `KAT-920` example.
- **Console "Waiting" message** — cleared after WebSocket connection established.
- **Escalation listener stack trace** — no longer dumps raw error stack to TUI when Symphony disconnects.

### Tests

- **89 Vitest tests** across 8 suites for the Symphony extension: config, client, command, tools, console (27 tests), escalation, panel, config-editor (22 tests).

## 0.10.0

### Features

- **Symphony extension** — New bundled extension providing `/symphony` command and `symphony_status`, `symphony_watch` tools for operator-facing interaction with the Symphony orchestration server. Includes config editor model, YAML parser, WebSocket streaming client, and connection management. 26 Vitest tests.
- **Coverage enforcement in CI** — Vitest coverage thresholds enforced at Lines ≥90%, Branches ≥80%, Functions ≥90%. The `test` script now runs `npx vitest run --coverage`, so Turborepo CI and the pre-push hook both gate on coverage. Any PR dropping below thresholds fails the build.

### Fixes

- **Literal `\n` in Linear markdown fields** — LLM tool calls sometimes emit escaped `\\n` instead of real newlines. Added `normalizeMarkdownContent()` to all markdown entry points (`kata_create_slice`, `kata_create_task`, `linear_update_issue`, `linear_add_comment`, `kata_write_document`) so descriptions and comments render correctly in Linear.
- **Integration tests no longer pollute real projects** — `entity-hierarchy`, `linear-state`, and `document-storage` integration tests now create ephemeral test projects in `beforeAll` and delete them in `afterAll` instead of using the first real project.

### Tests

- **pr-runner orchestration coverage** — 27 Vitest tests covering happy path, push-failed, parse-failed, explicit-ID bypass, body-integrity repair, Linear config integration, cross-linking, and error edge cases. pr-runner.ts moved from 60%/41%/38% to 89%/72%/88% (lines/branches/functions).
- **pr-body-composer edge cases** — Tests for plans with no title, no must-haves, and Linear references section inclusion. Coverage moved from 75%/50%/100% to 96%/79%/100%.

### Infrastructure

- **Node 22 pinned** — Added `.node-version` file and pre-push hook resolves Node 22 from nvm. Native addons (better-sqlite3, tree-sitter) don't compile on Node 23.
- **`@typescript-eslint` aligned to 8.57.1** — Parser and plugin were pinned to 8.52.0 while `typescript-eslint` was at 8.57.1, causing `scopeManager.addGlobals` crash in eslint 10.
- **`LINEAR_API_KEY` in Turborepo `globalEnv`** — Integration tests now receive the API key when run via `turbo run test`.
- **`react-resizable-panels` API updated** — Desktop app updated to v4.6+ API names (`PanelGroup` → `Group`, `PanelResizeHandle` → `Separator`).

## 0.9.0

### Breaking Changes

- **File mode removed** — `workflow.mode: "file"` is no longer supported. Setting it produces a clear error directing users to switch to `"linear"`. The `FileBackend`, file-based state derivation, auto-transitions, doctor, auto-recovery, observability-validator, and workspace-index modules have all been deleted (~15K lines removed).
- **`/kata doctor` removed** — the doctor command and all related diagnostics (`doctor-environment.ts`, `doctor-providers.ts`) have been removed along with file-mode.

### Features

- **Enriched `/kata plan` command** — The plan picker now presents state-dependent options across 5 states: (A) no milestones, (B) active milestone without roadmap, (C) active milestone with pending slices, (D) all slices complete, (E) all milestones complete. New planning operations: add a slice to an existing roadmap, resequence slices, revise the full roadmap, and freeform planning discussion.
- **4 new prompt templates** — `guided-add-slice.md`, `guided-resequence-slices.md`, `guided-revise-roadmap.md`, `guided-discuss-planning.md` with Linear-only enforcement and state promotion guards.
- **Plan mode does not promote issue state** — All guided plan prompts now include explicit "Do NOT call `kata_update_issue_state`" instructions. Auto-mode plan prompts retain state advancement.
- **Vitest test infrastructure** — Vitest added as the target test runner for new tests (`*.vitest.test.ts` pattern). Dual-runner coexistence with bun via `--path-ignore-patterns`. v8 coverage provider configured with `all: false` for accurate reporting.
- **Testing policy** — Established in `AGENTS.md`: new tests must use Vitest; existing bun tests migrate when their source files are touched.
- **Task plans in issue descriptions** — Slice and task plans now live in Linear issue descriptions instead of separate LinearDocuments. Task summaries are posted as issue comments via `linear_add_comment`.

### Fixes

- **Stale file-mode references cleaned** — Removed `.kata/DECISIONS.md`, `.kata/REQUIREMENTS.md`, `.kata/STATE.md`, and `.kata/milestones/` references from 8 prompt templates. Replaced with `kata_read_document`/`kata_write_document` Linear API calls.
- **Stale JSDoc comments** — Removed `FileBackend` references from `backend.ts`, `phase-recipes.ts`, and `git-utils.ts`.
- **`guided-discuss-milestone.md` ported to Linear** — Was still instructing the agent to "write in the milestone directory". Now uses `kata_write_document`.
- **Queue prompt deprecation noted** — `queue.md` is entirely file-mode-only and the entrypoint is blocked in Linear mode. Added deprecation comment for future Linear port.

### Tests

- **`auto-dispatch.vitest.test.ts`** — 39 tests for `deriveUnitType`, `deriveUnitId`, and `peekNext` decision logic extracted from `auto.ts`.
- **`prompt-templates.vitest.test.ts`** — 15 tests covering template loading, variable substitution, state promotion guards, and Linear-mode compliance for all guided plan prompts.
- **`show-plan.vitest.test.ts`** — 6 tests verifying `showPlan()` presents correct options for all 5 states plus the blocked state.

### Docs

- **KATA-WORKFLOW.md consolidated to Linear-only** — Reduced from ~895 to ~550 lines. All file-mode conditional blocks, `STATE.md` references, and continue-here protocol removed.

### Dependencies

- **pi-coding-agent** `0.62.0` → `0.63.1` — multi-edit support in edit tool, compaction fixes, auth resolution improvements, sessionDir settings support. No breaking changes for Kata extensions.

## 0.8.0

### Features

- **Issue relation support in built-in Linear tools (KAT-952)** — Added `linear_create_relation` and `linear_list_relations` for `blocks`, `blocked_by`, `relates_to`, and `duplicate` relationships. `linear_get_issue` responses now include normalized `relations` and a derived `blockedBy` array for dependency-aware consumers.

### Fixes

- **Linear error retry classification crash** — Fixed a runtime error in Linear HTTP retry handling where `isRetryable()` called a non-existent classifier (`classifyError`), which could surface as `classifyError is not defined` on auth/error paths.
- **Doctor provider HOME-path test isolation** — Stabilized the provider diagnostics test by explicitly clearing and restoring `KATA_CODING_AGENT_DIR` in the HOME-resolution test to avoid environment leakage between test contexts.

## 0.7.0

### Features

- **`/kata plan` command** — New interactive command for ad-hoc planning decoupled from execution. Plan milestone roadmaps, plan specific slices, or plan the next pending slice without being forced into the sequential execute-after-plan flow.
- **`/kata discuss` Linear mode support** — Fixed `/kata discuss` which was broken in Linear mode. Now uses the backend abstraction instead of file-based state derivation.

### Fixes

- **RPC mode theme initialization** — `initTheme()` is now called before mode routing in `cli.ts`, fixing "Theme not initialized" errors when MCP adapter connects in RPC mode (KAT-915).

## 0.6.0

### Features

- **Project-level MCP server configuration** — Projects can now define local MCP servers in `<project>/.kata-cli/mcp.json`. On startup, Kata merges global and project-local configs: `mcpServers` and `settings` are project-preferred, `imports` are concatenated. First use per project requires one-time consent, persisted at `~/.kata-cli/project-mcp-consent.json`. The resolved config is written to `~/.kata-cli/agent/mcp.effective.json`.
- **RPC mode and cwd override** — Kata CLI now supports `--mode rpc` and `--cwd` arguments, enabling embedding as a backend for Symphony's pi-agent runtime.

## 0.5.2

### Features

- **Doctor environment & provider diagnostics** — `/kata doctor` now reports environment health (Node version, disk space, git version, OS, shell) and provider validation (configured providers, API key presence, model availability).

### Fixes

- **Linear mode document scoping** — Slice-level documents (`S01-PLAN`, `S01-RESEARCH`, `S01-SUMMARY`, etc.) are now scoped to their slice issue instead of the project. Prevents document collisions when multiple milestones have slices with the same IDs (S01, S02, etc.).
- **Milestone-aware slice resolution** — `preparePrContext` now matches both slice ID and milestone ID when resolving slice issues, preventing cross-milestone document mixups. Falls back to omitting PR-context docs rather than reading from project scope.

## 0.5.1

### Features

- **Package commands** — `kata install`, `kata remove`, `kata update`, and `kata list` now work as CLI subcommands. Previously, running `kata update` (as shown in the package update notification) did nothing because Kata bypasses pi's `main()` which handled these commands.
- **`kata` bin alias** — added `kata` as a bin entry alongside `kata-cli`, so global installs register both commands. The update notification message ("Run `kata update`") now matches the actual CLI command.

## 0.5.0

### Features

- **Session lock for auto-mode** — OS-level exclusive locking prevents multiple kata processes from running auto-mode concurrently on the same project. Uses `proper-lockfile` for cross-platform file locking with stale lock detection and metadata tracking (PID, hostname, timestamp).
- **Repo identity** — stable SHA-256 fingerprint for any git repository, consistent across subdirectories and worktrees. Used for session lock isolation and state management.
- **Worktree resolver** — resolves git worktree paths, finds the main repo from a worktree, and maps paths between worktrees. Enables correct behavior in monorepo worktree setups.
- **Atomic file writes** — crash-safe file writes using rename-into-place pattern via `atomic-write.ts`. Prevents partial writes on crash or power loss.
- **Subagent worker registry** — global registry of active subagent sessions for dashboard visibility. Tracks agent name, task, status, start time, and batch ID.
- **Subagent elapsed timing** — parallel, chain, and single subagent calls now show elapsed time in output. Chain mode shows per-step and total timing. Error messages include elapsed time.
- **Search provider abstraction** — pluggable search provider layer with Tavily support. `tool-search.ts` and `tool-llm-context.ts` routed through the provider abstraction. Native search extracted to `native-search.ts`.

### Fixes

- **Test suite fixes** — resolved `describe`/`it` not defined errors in repo-identity and worktree-resolver tests (missing `node:test` imports). Fixed session-lock logic to not steal locks when metadata is missing.
- **Subagent cleanup** — try/finally for worker registry cleanup on abort, consistent stopReason failure detection, cancel dangling timers, fix 59999ms elapsed rounding.
- **Search provider review fixes** — budgetGrounding math, tool restore, maxUrls, cache, notification improvements.
- **Remove Opus 4.6 context window patch** — upstream pi-ai 0.60.0 now has the correct 1M context window for `claude-opus-4-6`. Removed the runtime patches from `cli.ts` and `kata/index.ts` (KAT-487).

## 0.4.1

### Features

- **Step badge in auto-mode** — statusline now shows a `step` badge while a dispatch unit is active, clearing on agent turn end. Makes it visible which phase auto-mode is executing.
- **Remove `kata-run` slash command** — deleted the unused `/kata-run` command and its registration.

### Fixes

- **Linear auto-close recovery in auto-mode** — when Linear's "Auto-close parent issues" setting moves a slice to Done before the complete-slice unit runs, auto-mode now detects the skip (missing slice summary), overrides state to `summarizing`, and forces the complete-slice dispatch. Also runs the PR gate on final completion when the early exit would otherwise skip it.
- **Stale milestone ID after recovery** — fixed `mid` staying null after recovery path A, which caused the normal stop block to fire and undo the recovery.
- **Finalize metrics before PR gate** — snapshot unit metrics and save activity log before the PR gate early return in recovery path B, preventing dropped metrics for the complete-slice unit.
- **Stop on legacy merge failure** — auto-mode now stops on squash merge failure instead of falling through to `skipped`, which could leave the repo in an inconsistent state.
- **Test reliability** — added 60s timeouts to four slow smoke tests; fixed linear-config integration test skip gating and done-callback timeout.

## 0.4.0

### Features

- **Namespaced slice branches** (`kata/<scope>/<M>/<S>`) for monorepo/worktree safety — branches are scoped by project path, preventing silent collision across projects. Legacy `kata/<M>/<S>` format remains compatible during transition.
- **Git service** (`git-service.ts`) ported from gsd-pi — typed API for branch management, smart staging (excludes `.kata-cli/` runtime files), auto-commit with conventional commit messages, and squash-merge. Replaces ad-hoc shell git execution.
- **`linear_add_comment` tool** — post comments on Linear issues from agent workflows (UAT verdicts, status updates).
- **Model preferences in `/kata step`** — `models.*` preferences now apply to `/kata step` in addition to `/kata auto`. The statusline badge shows the active model (e.g. `auto · claude-opus-4-6`).
- **Auto-push before PR creation** — `runCreatePr` now checks if the branch exists on the remote and pushes it automatically if not. Returns a structured `push-failed` error instead of the cryptic GitHub GraphQL "Head sha can't be blank" message.
- **PR titles prefixed with branch name** — PRs are titled `[kata/apps-cli/M001/S01] Slice title`, making them easy to identify per-project in a monorepo.
- **`promptSnippet` for all custom tools** — upgraded to pi-coding-agent 0.60.0 which made `promptSnippet` opt-in; added snippets to all 109 custom tools so they appear in the agent's "Available tools" list.

### Fixes

- **PR error message** — auto-mode failure message now shows the actual branch name instead of hardcoding legacy `kata/<M>/<S>` format.
- **`resolveModelForUnit`** — added missing `complete-milestone` and `reassess-roadmap` unit types; added warning when configured model ID is not found in registry.
- **Provenance guard** — legacy branch fast-path in `ensureSliceBranch` now runs conflict detection even when already checked out on the legacy branch.
- **Merge hint** — `kata_merge_pr` error hint no longer references `milestoneId`/`sliceId` params that don't exist on that tool.
- **`promptSnippet` grammar** — fixed truncated and grammatically broken snippets in mac-tools, linear-tools, and pr-lifecycle.

### Dependency

- Upgrade `@mariozechner/pi-coding-agent` from `^0.57.1` to `^0.60.0`

## 0.3.0

### Built-in Linear Integration

- Add native Linear extension with GraphQL client — 22+ tools, no MCP server required
- Linear workflow mode (`workflow.mode: linear`) stores all Kata artifacts as Linear documents
- State derivation from Linear API (`kata_derive_state`) replaces file-based `state.md`
- Entity mapping: milestones → ProjectMilestones, slices → Issues, tasks → Sub-issues
- Document storage: plans, summaries, decisions stored as LinearDocuments via API
- Rate limit resilience with automatic retry and error classification
- `LINEAR_API_KEY` hydration in auth wizard

### KataBackend Architecture

- Unified `KataBackend` interface abstracts File and Linear backends behind a common API
- Eliminate all `isLinearMode` forks — single codepath through unified dispatch loop
- Unified prompt layer: all prompt templates migrated to backend ops vars
- Phase recipes — shared declaration of what each workflow phase reads/writes
- Merge `LINEAR-WORKFLOW.md` into unified `KATA-WORKFLOW.md`
- Golden snapshot tests and structural prompt assertions for both backends

### PR Lifecycle Management

- Add `/kata pr` subcommands: `status`, `create`, `review`, `address`, `merge`
- PR creation with body composition from `.kata/` slice artifacts
- Bundled reviewer subagents with parallel dispatch for code review
- Context-aware comment evaluation with triage-first workflow
- PR address workflow: fetch comments, evaluate, fix, reply, resolve threads
- Linear cross-linking: `Closes KAT-N` references and issue state advancement on merge
- PR gating in auto-mode: slice completion gates on PR creation when `pr.enabled`
- Replace Python PR scripts (`create_pr_safe.py`, `fetch_comments.py`) with native TypeScript

### Other Features

- Add `/kata step` as first-class subcommand for single-step execution
- Patch Opus 4.6 context window to 1M at session start

### Fixes

- Monorepo support: add `gitRoot` to KataBackend for correct PR and merge operations
- Abort step on branch failure, correct multi-milestone paths, replan fallback
- PR failure pauses and helps user recover instead of terse error
- Show PR notification after stop message so it's visible
- Linear: improve teamKey → teamId resolution across all surfaces
- Linear: sort milestones by sortOrder, scope task-level docs to slice issue
- Linear: `ensureLabel` falls back to workspace-level labels before creating
- Linear: deterministic active slice/task selection in state derivation
- Harden error handling, caching, and edge cases across kata extensions
- Truncate large diffs in reviewer prompts to prevent context overflow

### Internal

- Migrate tests from Node `--test` to Bun test runner
- Extract shared utilities and fix duplicate code across backends
- Add Turborepo `lint` and `typecheck` scripts

## 0.2.1

- Fix `/changelog` command — symlink `pkg/CHANGELOG.md` so Kata can find it
- Rewrite README for consumers: quick start with `npx`, getting started flow, how it works, mode comparison, full command reference

## 0.2.0

- Add MCP (Model Context Protocol) support via `pi-mcp-adapter` — connect to any MCP server (Linear, Figma, custom tools) from Kata
- Auto-install `pi-mcp-adapter` on startup and scaffold starter `mcp.json` config
- Inject `mcp-config` flag into extension runtime for seamless MCP server discovery
- Fix inline `[]` and `{}` literal handling in preferences YAML parser
- Add comprehensive MCP documentation and setup guide to README
- Add MCP smoke tests to CI
- Install `pi-mcp-adapter` globally in CI for test coverage

## 0.1.2

- Fix `~/.kata/` paths to `~/.kata-cli/` to avoid collision with Kata Desktop config directory

## 0.1.1

- Rename `@kata/*` to `@kata-sh/*` npm scope
- Initial public release to npm
