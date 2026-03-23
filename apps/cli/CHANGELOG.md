# Changelog

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
