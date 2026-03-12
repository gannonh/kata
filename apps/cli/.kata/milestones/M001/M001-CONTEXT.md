# M001: MCP Support — Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

## Project Description

Kata CLI is a branded pi-coding-agent wrapper. It bundles extensions and syncs them to `~/.kata-cli/agent/` on every launch. The config dir is `~/.kata-cli/` (not `~/.pi/`).

## Why This Milestone

Users want MCP (Model Context Protocol) server access — databases, browsers, external APIs. `pi-mcp-adapter` (npm) already solves this for pi users. Kata should ship it automatically so users get MCP without any install step.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Launch `kata` and immediately have the `mcp` tool available (no `kata install` step)
- Add MCP servers to `~/.kata-cli/agent/mcp.json` and have them work
- Use `/mcp` to see server status, search tools, and toggle direct/proxy modes

### Entry point / environment

- Entry point: `kata` CLI (npm global install)
- Environment: local dev, macOS
- Live dependencies involved: none for the adapter itself; MCP servers user chooses to configure

## Completion Class

- Contract complete means: pi-mcp-adapter loads, `mcp` tool is registered, `--mcp-config` points to `~/.kata-cli/agent/mcp.json`
- Integration complete means: launching `kata` with an `mcp.json` configured shows the `mcp` tool available; `/mcp` command works
- Operational complete means: starter mcp.json is created on first launch; existing mcp.json is not overwritten on update

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- `kata` launches and the `mcp` tool appears in the tool list (or `/mcp` shows adapter status)
- `~/.kata-cli/agent/mcp.json` is created as a starter template if it didn't exist
- `--mcp-config ~/.kata-cli/agent/mcp.json` is passed to the adapter (verified by checking argv injection or adapter behavior)

## Risks and Unknowns

- **pi-mcp-adapter config path hardcoded to `~/.pi/agent/mcp.json`** — adapter reads `process.argv` directly for `--mcp-config`; we inject via `process.argv.push` in loader.ts before imports
- **Package auto-install timing** — pi's `packageManager.resolve()` installs missing packages during `resourceLoader.reload()`; this happens synchronously during `cli.ts` startup so it should work
- **settingsManager.setPackages() vs direct JSON write** — settingsManager is available in `cli.ts` after construction; best to call `setPackages()` there

## Existing Codebase / Prior Art

- `src/loader.ts` — sets env vars and injects into `process.argv`/`process.env` before cli.ts runs; this is the right place for `--mcp-config` injection
- `src/cli.ts` — constructs `settingsManager`; best place to seed packages
- `src/resource-loader.ts` — `initResources()` creates starter files; right place for `mcp.json` scaffold
- `~/.kata-cli/agent/settings.json` — pi reads packages array from here for auto-install

## Relevant Requirements

- R001 — primary: MCP tool auto-available
- R002 — primary: config in `~/.kata-cli/agent/mcp.json`
- R003 — primary: starter mcp.json scaffolded

## Scope

### In Scope

- Seed pi-mcp-adapter into settings.json packages during cli.ts startup
- Inject `--mcp-config ~/.kata-cli/agent/mcp.json` in process.argv in loader.ts
- Create starter `~/.kata-cli/agent/mcp.json` in initResources() if not present
- Update AGENTS.md docs with MCP section

### Out of Scope / Non-Goals

- Building a custom MCP UI or commands in Kata
- Pinning pi-mcp-adapter to a specific version (use latest)
- Pre-configuring specific MCP servers

## Technical Constraints

- `--mcp-config` must be injected into `process.argv` BEFORE the extension loads (adapter reads argv directly at session_start)
- `initResources()` must NOT overwrite an existing `mcp.json` (preserve user config)
- `settingsManager.setPackages()` must only add if not already present (idempotent)

## Integration Points

- `@mariozechner/pi-coding-agent` DefaultPackageManager — installs npm packages from settings.json packages array on `resourceLoader.reload()`
- `pi-mcp-adapter` npm package — registers `mcp` tool and `/mcp` commands as a pi extension

## Open Questions

- None — approach is clear from source inspection
