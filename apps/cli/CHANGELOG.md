# Changelog

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
