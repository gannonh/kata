---
id: S01
milestone: M001
provides:
  - pi-mcp-adapter auto-installs on every kata startup (settings.json seeding)
  - MCP config reads from ~/.kata-cli/agent/mcp.json (--mcp-config injection)
  - Starter mcp.json scaffolded on first launch, never overwritten
  - mcp tool and /mcp commands available in every kata session
key_files:
  - src/loader.ts
  - src/cli.ts
  - src/resource-loader.ts
  - src/resources/AGENTS.md
key_decisions:
  - Auto-seed npm:pi-mcp-adapter in settings.json packages (D001)
  - MCP config at ~/.kata-cli/agent/mcp.json via --mcp-config injection (D002)
  - mcp.json scaffold is create-only, never overwrites (D003)
drill_down_paths:
  - .kata/milestones/M001/slices/S01/tasks/T01-SUMMARY.md
completed_at: 2026-03-11T19:30:00Z
verification_result: pass
---

# S01: Wire pi-mcp-adapter into Kata

**pi-mcp-adapter auto-installs in kata; mcp tool available out of the box with config at ~/.kata-cli/agent/mcp.json**

## What Was Built

Three-file change wires pi-mcp-adapter into Kata's startup lifecycle. On first launch, Kata seeds `npm:pi-mcp-adapter` into settings.json, pi auto-installs it, and a starter `~/.kata-cli/agent/mcp.json` is created. The `--mcp-config` flag is injected into process.argv so the adapter reads from Kata's config dir instead of `~/.pi/agent/`.

Users get the `mcp` proxy tool (search MCP tools, call them, manage servers) and `/mcp` interactive panel without any install step.

## Verification

- TypeScript builds clean (`npx tsc --noEmit`)
- settingsManager API verified: idempotent seeding, no duplicates
- mcp.json scaffold verified: creates on first run, preserves on re-run
