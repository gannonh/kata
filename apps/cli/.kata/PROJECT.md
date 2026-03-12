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
- [ ] M002: Linear Mode — native Linear integration as a switchable workflow mode, replacing local file artifacts with Linear projects/milestones/issues/documents
