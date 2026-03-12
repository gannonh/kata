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
- No MCP support yet

## Architecture / Key Patterns

- `src/loader.ts` — entry point; sets env vars, syncs resources, then imports `cli.ts`
- `src/cli.ts` — thin wrapper: configures pi session, calls `initResources()`, then `InteractiveMode.run()`
- `src/resource-loader.ts` — syncs `src/resources/` to `~/.kata-cli/agent/` on every launch
- `src/resources/extensions/` — bundled extensions (kata, browser-tools, subagent, context7, search-the-web, bg-shell, slash-commands, mac-tools, shared)
- `pkg/package.json` — piConfig shim: `name: "kata"`, `configDir: ".kata-cli"` — tells pi the branded config dir
- `src/wizard.ts` — first-run setup, env key hydration from auth.json
- Config dir: `~/.kata-cli/agent/` (not `~/.pi/agent/`)
- Extensions are loaded by pi's DefaultResourceLoader from agentDir

## Capability Contract

See `.kata/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [ ] M001: MCP Support — ship pi-mcp-adapter auto-bundled in Kata so users get MCP tool access out of the box
