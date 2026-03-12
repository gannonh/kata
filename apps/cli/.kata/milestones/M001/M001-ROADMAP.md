# M001: MCP Support

**Vision:** Ship pi-mcp-adapter auto-bundled in Kata so users get MCP tool access out of the box with no install step.

## Success Criteria

- Launching `kata` makes the `mcp` tool available without any user install step
- MCP config reads from `~/.kata-cli/agent/mcp.json` (Kata's config dir, not `~/.pi/agent/`)
- A starter `mcp.json` is scaffolded on first launch if one doesn't exist
- Existing `mcp.json` is never overwritten by Kata updates

## Key Risks / Unknowns

- **process.argv injection timing** — adapter reads argv at session_start; injection must happen in loader.ts before cli.ts imports

## Proof Strategy

- argv injection timing → retire in S01 by launching kata and confirming mcp tool registers + `/mcp` responds

## Verification Classes

- Contract verification: unit-check that settings seeding is idempotent; mcp.json scaffold logic tested
- Integration verification: launch kata, confirm `mcp` tool appears, `/mcp` responds, config path is correct
- Operational verification: re-launch kata with existing mcp.json — confirm file not overwritten
- UAT / human verification: user confirms `/mcp` panel opens and shows correct config path

## Milestone Definition of Done

This milestone is complete only when all are true:

- S01 is complete and verified
- `mcp` tool is available in a live kata session
- `~/.kata-cli/agent/mcp.json` exists after first launch
- Re-launch does not overwrite existing mcp.json
- `/mcp` command responds with server status

## Requirement Coverage

- Covers: R001, R002, R003
- Partially covers: none
- Leaves for later: none
- Orphan risks: none

## Slices

- [ ] **S01: Wire pi-mcp-adapter into Kata** `risk:low` `depends:[]`
  > After this: launching `kata` gives the `mcp` tool, `/mcp` works, config reads from `~/.kata-cli/agent/mcp.json`, and a starter mcp.json is scaffolded on first run.

## Boundary Map

### S01 → (no downstream slices)

Produces:
- `src/loader.ts` — injects `--mcp-config ~/.kata-cli/agent/mcp.json` into process.argv
- `src/cli.ts` — seeds `pi-mcp-adapter` into settings.json packages (idempotent)
- `src/resource-loader.ts` — scaffolds starter `~/.kata-cli/agent/mcp.json` if absent

Consumes:
- nothing (single-slice milestone)
