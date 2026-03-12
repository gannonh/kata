# Requirements

This file is the explicit capability and coverage contract for the project.

## Active

## Active

(none — all requirements delivered in M001)

## Validated

### R001 — MCP tool access out of the box
- Class: core-capability
- Status: validated
- Description: Users of Kata CLI get a working `mcp` tool and `/mcp` commands without any manual install step
- Why it matters: MCP ecosystem has useful tools (databases, browsers, APIs); users should access them without friction
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: none
- Validation: validated
- Notes: settingsManager.setPackages() seeds npm:pi-mcp-adapter; pi auto-installs on resourceLoader.reload()

### R002 — MCP config lives in Kata's config dir
- Class: integration
- Status: validated
- Description: MCP server config reads from `~/.kata-cli/agent/mcp.json`, not `~/.pi/agent/mcp.json`
- Why it matters: Kata uses `~/.kata-cli/` as its config root; using `~/.pi/` would confuse users and mix configs
- Source: inferred
- Primary owning slice: M001/S01
- Supporting slices: none
- Validation: validated
- Notes: --mcp-config injected via process.argv in loader.ts; adapter reads it at session_start

### R003 — Starter mcp.json scaffolded for new installs
- Class: primary-user-loop
- Status: validated
- Description: A starter `mcp.json` is created in `~/.kata-cli/agent/` on first launch if one doesn't exist
- Why it matters: Users need to know where and how to configure MCP servers; an empty/example file provides the entry point
- Source: inferred
- Primary owning slice: M001/S01
- Supporting slices: none
- Validation: validated
- Notes: initResources() writes starter mcp.json only if absent; verified by runtime test

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
| R001 | core-capability | validated | M001/S01 | none | validated |
| R002 | integration | validated | M001/S01 | none | validated |
| R003 | primary-user-loop | validated | M001/S01 | none | validated |
| R010 | anti-feature | out-of-scope | none | none | n/a |

## Coverage Summary

- Active requirements: 0
- Mapped to slices: 3
- Validated: 3
- Unmapped active requirements: 0
