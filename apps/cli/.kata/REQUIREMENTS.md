# Requirements

This file is the explicit capability and coverage contract for the project.

## Active

### R001 — MCP tool access out of the box
- Class: core-capability
- Status: active
- Description: Users of Kata CLI get a working `mcp` tool and `/mcp` commands without any manual install step
- Why it matters: MCP ecosystem has useful tools (databases, browsers, APIs); users should access them without friction
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: none
- Validation: unmapped
- Notes: Delivered via auto-seeding pi-mcp-adapter into settings.json packages

### R002 — MCP config lives in Kata's config dir
- Class: integration
- Status: active
- Description: MCP server config reads from `~/.kata-cli/agent/mcp.json`, not `~/.pi/agent/mcp.json`
- Why it matters: Kata uses `~/.kata-cli/` as its config root; using `~/.pi/` would confuse users and mix configs
- Source: inferred
- Primary owning slice: M001/S01
- Supporting slices: none
- Validation: unmapped
- Notes: Requires `--mcp-config` injection in loader.ts since pi-mcp-adapter defaults to `~/.pi/agent/mcp.json`

### R003 — Starter mcp.json scaffolded for new installs
- Class: primary-user-loop
- Status: active
- Description: A commented starter `mcp.json` is created in `~/.kata-cli/agent/` on first launch if one doesn't exist
- Why it matters: Users need to know where and how to configure MCP servers; an empty/example file provides the entry point
- Source: inferred
- Primary owning slice: M001/S01
- Supporting slices: none
- Validation: unmapped
- Notes: Created by initResources() only if file doesn't exist (don't overwrite user configs)

## Validated

(none yet)

## Deferred

(none)

## Out of Scope

### R010 — Custom MCP panel UI in Kata
- Class: anti-feature
- Status: out-of-scope
- Description: Kata does not build its own MCP management UI
- Why it matters: pi-mcp-adapter ships `/mcp` commands and an interactive panel; duplicating this in Kata adds maintenance cost with no benefit
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Use pi-mcp-adapter's `/mcp` panel as-is

## Traceability

| ID | Class | Status | Primary owner | Supporting | Proof |
|---|---|---|---|---|---|
| R001 | core-capability | active | M001/S01 | none | unmapped |
| R002 | integration | active | M001/S01 | none | unmapped |
| R003 | primary-user-loop | active | M001/S01 | none | unmapped |
| R010 | anti-feature | out-of-scope | none | none | n/a |

## Coverage Summary

- Active requirements: 3
- Mapped to slices: 3
- Validated: 0
- Unmapped active requirements: 0
