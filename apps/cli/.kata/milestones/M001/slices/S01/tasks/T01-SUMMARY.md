---
id: T01
parent: S01
milestone: M001
provides:
  - loader.ts injects --mcp-config ~/.kata-cli/agent/mcp.json into process.argv before cli.ts loads
  - cli.ts idempotently seeds npm:pi-mcp-adapter into settings.json packages on every startup
  - resource-loader.ts scaffolds starter mcp.json in agentDir on first launch (never overwrites)
  - KATA_MCP_CONFIG_PATH env var set for downstream reference
  - AGENTS.md documents MCP setup, config location, and usage
key_files:
  - src/loader.ts
  - src/cli.ts
  - src/resource-loader.ts
  - src/resources/AGENTS.md
key_decisions:
  - "Auto-seed pi-mcp-adapter in settings.json — pi installs it on first startup automatically"
  - "--mcp-config injected via process.argv in loader.ts (adapter reads argv directly at session_start)"
  - "mcp.json scaffold is create-only — never overwrites user config"
patterns_established:
  - "Startup package seeding pattern: settingsManager.getPackages() → add if absent → setPackages()"
  - "process.argv injection pattern for pi package flags: push before await import('./cli.js')"
drill_down_paths:
  - .kata/milestones/M001/slices/S01/tasks/T01-PLAN.md
duration: 20min
verification_result: pass
completed_at: 2026-03-11T19:30:00Z
---

# T01: Implement MCP wiring

**pi-mcp-adapter auto-installs on kata startup; MCP config reads from ~/.kata-cli/agent/mcp.json with starter template scaffolded on first launch**

## What Happened

Three-file change wires pi-mcp-adapter into Kata's startup lifecycle:

1. **loader.ts**: Injects `--mcp-config ~/.kata-cli/agent/mcp.json` into `process.argv` before `cli.ts` imports. pi-mcp-adapter reads this flag directly at session_start — the injection must happen here (before extensions load). Also exports `KATA_MCP_CONFIG_PATH` env var for reference.

2. **cli.ts**: After constructing `settingsManager`, reads current packages and adds `npm:pi-mcp-adapter` if absent. pi's DefaultPackageManager.resolve() picks this up during `resourceLoader.reload()` and installs the package automatically. Idempotent — no duplicate entries.

3. **resource-loader.ts**: In `initResources()`, writes a starter `mcp.json` to `agentDir` if the file doesn't exist. The starter has empty `mcpServers` and default settings. Never overwrites — user's server config is preserved across Kata updates.

AGENTS.md updated with a full MCP section covering config location, server setup examples, `imports` field for migrating existing configs, and usage patterns.

## Deviations

None from plan.

## Files Created/Modified

- `src/loader.ts` — injects `--mcp-config` and `KATA_MCP_CONFIG_PATH` env var
- `src/cli.ts` — idempotent pi-mcp-adapter package seeding
- `src/resource-loader.ts` — STARTER_MCP_JSON constant + mcp.json scaffold in initResources()
- `src/resources/AGENTS.md` — MCP section + KATA_MCP_CONFIG_PATH in env vars table
