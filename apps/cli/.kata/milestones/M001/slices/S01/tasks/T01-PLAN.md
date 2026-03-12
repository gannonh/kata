# T01: Implement MCP wiring

**Slice:** S01
**Milestone:** M001

## Goal

Wire pi-mcp-adapter into Kata's startup so the `mcp` tool is available in every session, config reads from `~/.kata-cli/agent/mcp.json`, and a starter mcp.json is scaffolded on first launch.

## Must-Haves

### Truths
- `kata` session has `mcp` tool registered (pi-mcp-adapter auto-installs and loads)
- `/mcp` command responds without error
- MCP config path is `~/.kata-cli/agent/mcp.json`
- `~/.kata-cli/agent/mcp.json` exists after first launch (starter template)
- Re-launching kata does not overwrite existing `mcp.json`
- settings.json has no duplicate `pi-mcp-adapter` entries after multiple launches

### Artifacts
- `src/loader.ts` — injects `--mcp-config ~/.kata-cli/agent/mcp.json` into process.argv
- `src/cli.ts` — seeds `npm:pi-mcp-adapter` into settingsManager packages (idempotent)
- `src/resource-loader.ts` — creates starter `~/.kata-cli/agent/mcp.json` if not present

### Key Links
- `loader.ts` → argv injection → `pi-mcp-adapter` reads `--mcp-config` at session_start
- `cli.ts` → settingsManager.setPackages() → pi auto-installs pi-mcp-adapter on `resourceLoader.reload()`
- `resource-loader.ts` → `initResources()` → starter `mcp.json` scaffolded before session starts

## Steps

1. In `src/loader.ts`: before `await import("./cli.js")`, inject `--mcp-config` and the config path into process.argv if not already present
2. In `src/cli.ts`: after constructing settingsManager, read current packages, add `npm:pi-mcp-adapter` if absent, call `settingsManager.setPackages()`
3. In `src/resource-loader.ts`: in `initResources()`, write starter `mcp.json` to `agentDir/mcp.json` if file does not exist
4. Write the starter mcp.json content — commented JSON showing example servers and the imports field
5. Update `src/resources/AGENTS.md` to document MCP support
6. Build (`npx tsc`) and verify no type errors
7. Verify: check that `~/.kata-cli/agent/mcp.json` is created, check settings.json has pi-mcp-adapter package, manually confirm mcp tool loads

## Context

- `pi-mcp-adapter` reads `process.argv` directly for `--mcp-config` at lines 74-79 of index.ts — injection must happen before the extension's session_start fires
- `settingsManager.setPackages(packages)` writes the global settings; pi's DefaultPackageManager.resolve() picks this up during `resourceLoader.reload()`
- `initResources()` in resource-loader.ts is the right place for mcp.json scaffold — it already handles AGENTS.md in the same pattern
- JSON with comments is not valid JSON — use a valid JSON starter with a `_comment` field or just empty `mcpServers: {}`
