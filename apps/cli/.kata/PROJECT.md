# Project

## What This Is

Kata CLI — a branded, opinionated coding agent built on `@mariozechner/pi-coding-agent`. It ships the Kata planning methodology (structured milestone/slice/task workflow), bundled extensions (browser tools, subagent dispatch, context7, search, bg-shell, mac-tools), and a first-run wizard. Published to npm as `@kata-sh/cli`.

## Core Value

A coding agent that executes structured, multi-session development work reliably — with planning artifacts that let any fresh agent session pick up exactly where the last one left off.

## Current State

- v0.1.2 published on npm
- Full extension bundle synced to `~/.kata-cli/agent/` on every launch
- Wizard for API key setup on first run
- Default model: anthropic/claude-sonnet-4-6
- MCP support shipped via pi-mcp-adapter auto-bundled (M001 complete)
- File-based Kata workflow fully operational (local `.kata/` artifacts)
- M002 Linear Mode complete: all 6 slices done (S01 GraphQL client, S02 config/mode switching, S03 entity mapping, S04 document storage, S05 state derivation, S06 workflow prompt + auto-mode); 86 tests pass; R101–R109 all validated
- M003/S01 PR Creation complete: kata_create_pr tool, gh-utils.ts, PR body composition from slice artifacts, bundled create_pr_safe.py and fetch_comments.py scripts; R204, R206 validated
- M003/S02 Reviewer Subagents complete: 6 bundled pr-*.md reviewer agent definitions, pr-review-utils.ts (scopeReviewers, buildReviewerTaskPrompt, aggregateFindings), kata_review_pr tool with parallel dispatch plan; 8 contract tests pass; R201, R207 validated
- M003/S03 Address Review Comments complete: kata_fetch_pr_comments, kata_resolve_thread, kata_reply_to_thread tools registered; pr-address-utils.ts (summarizeComments + GraphQL mutation wrappers); 4 unit tests pass; TypeScript clean; 112/112 tests pass; R202 validated

## Architecture / Key Patterns

- `src/loader.ts` — entry point; sets env vars, syncs resources, then imports `cli.ts`
- `src/cli.ts` — thin wrapper: configures pi session, calls `initResources()`, then `InteractiveMode.run()`
- `src/resource-loader.ts` — syncs `src/resources/` to `~/.kata-cli/agent/` on every launch
- `src/resources/extensions/` — bundled extensions (kata, browser-tools, subagent, context7, search-the-web, bg-shell, slash-commands, mac-tools, shared)
- `src/resources/extensions/kata/` — the core Kata extension: state derivation, file parsing, auto-mode, dashboard, preferences, prompts, templates
- `pkg/package.json` — piConfig shim: `name: "kata"`, `configDir: ".kata-cli"` — tells pi the branded config dir
- Config dir: `~/.kata-cli/agent/` (not `~/.pi/agent/`)
- Extensions are loaded by pi's DefaultResourceLoader from agentDir

## Capability Contract

See `.kata/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [x] M001: MCP Support — ship pi-mcp-adapter auto-bundled in Kata so users get MCP tool access out of the box
- [x] M002: Linear Mode — native Linear integration as a switchable workflow mode, replacing local file artifacts with Linear projects/milestones/issues/documents
- [ ] M003: PR Lifecycle — built-in PR creation, specialized review via bundled subagents, comment addressing, and merge integrated into slice workflow for both file-mode and Linear-mode projects
