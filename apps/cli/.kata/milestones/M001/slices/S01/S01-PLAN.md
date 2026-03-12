# S01: Wire pi-mcp-adapter into Kata

**Goal:** Make `mcp` tool and `/mcp` commands available in every `kata` session without any user install step, with config reading from `~/.kata-cli/agent/mcp.json`.

**Demo:** Launch `kata`, type `/mcp` — the adapter responds with server status. `~/.kata-cli/agent/mcp.json` exists as a starter template.

## Must-Haves

- `mcp` tool is registered in kata sessions (pi-mcp-adapter loaded)
- MCP config reads from `~/.kata-cli/agent/mcp.json` not `~/.pi/agent/mcp.json`
- `~/.kata-cli/agent/mcp.json` is created as a starter template on first launch
- Existing `mcp.json` is not overwritten on re-launch
- settings.json seeding is idempotent (no duplicate package entries)

## Tasks

- [x] **T01: Implement MCP wiring**
  Three-file change: loader.ts injects --mcp-config argv, cli.ts seeds packages, resource-loader.ts scaffolds mcp.json. Update AGENTS.md.

## Files Likely Touched

- `src/loader.ts`
- `src/cli.ts`
- `src/resource-loader.ts`
- `src/resources/AGENTS.md`
