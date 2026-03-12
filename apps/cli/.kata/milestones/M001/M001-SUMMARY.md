---
id: M001
provides:
  - pi-mcp-adapter ships with Kata — auto-installs on first launch
  - mcp tool and /mcp commands available in every kata session
  - MCP config at ~/.kata-cli/agent/mcp.json (Kata's config dir)
  - Starter mcp.json scaffolded on first launch
key_files:
  - src/loader.ts
  - src/cli.ts
  - src/resource-loader.ts
completed_at: 2026-03-11T19:30:00Z
---

# M001: MCP Support

**pi-mcp-adapter bundled in Kata — users get MCP tool access out of the box**

## Slices Completed

- S01: Wire pi-mcp-adapter into Kata — settings seeding, --mcp-config injection, mcp.json scaffold
