# Requirements

This file is the explicit capability and coverage contract for the project.

## Active

### R100 — Native Linear GraphQL client extension
- Class: core-capability
- Status: active
- Description: Kata ships a built-in Linear extension that talks directly to the Linear GraphQL API — no MCP dependency for Linear operations
- Why it matters: Removes the MCP OAuth flow, mcp-remote proxy, and Deno runtime from the critical path. Agent gets typed, reliable Linear access as a first-class tool
- Source: user
- Primary owning slice: M002/S01
- Supporting slices: none
- Validation: unmapped
- Notes: Port GraphQL client layer from schpet/linear-cli (Deno → Node TS). Auth via personal API key stored with secure_env_collect

### R101 — Linear mode as switchable workflow alternative
- Class: core-capability
- Status: active
- Description: Users can configure a project to use "Linear mode" instead of file mode. In Linear mode, all Kata artifacts (state, roadmaps, plans, summaries, decisions) live in Linear instead of local `.kata/` files
- Why it matters: Teams already using Linear shouldn't have to maintain a parallel set of local planning files. Linear becomes the single source of truth
- Source: user
- Primary owning slice: M002/S03
- Supporting slices: M002/S04, M002/S05, M002/S06
- Validation: unmapped
- Notes: Mode configured per-project. File mode remains the default

### R102 — Kata hierarchy maps to Linear entities
- Class: core-capability
- Status: active
- Description: Kata's planning hierarchy maps to Linear as: Project → Linear Project, Milestone → Linear Milestone, Slice → Parent Issue, Task → Sub-Issue
- Why it matters: This mapping preserves Kata's structured decomposition while using Linear's native hierarchy. Sub-issues give tasks their own status, assignee, and comment threads
- Source: user
- Primary owning slice: M002/S03
- Supporting slices: M002/S04
- Validation: unmapped
- Notes: Parent issue (slice) with sub-issues (tasks) uses Linear's native sub-issue support

### R103 — Rich artifacts stored as Linear Documents
- Class: core-capability
- Status: active
- Description: Roadmaps, context, research, summaries, and decisions are stored as Linear Documents attached to the relevant project or milestone
- Why it matters: All planning artifacts are searchable, editable, and visible in Linear's UI alongside the issues they describe
- Source: user
- Primary owning slice: M002/S04
- Supporting slices: none
- Validation: unmapped
- Notes: Documents are markdown-native in Linear. Attach to project for milestone-level, to parent issue for slice-level

### R104 — State derived from Linear API queries
- Class: core-capability
- Status: active
- Description: In Linear mode, Kata derives its state (active milestone, slice, task, phase) by querying Linear's API — no local state files
- Why it matters: Linear is the single source of truth. No sync, no cache, no stale local state
- Source: user
- Primary owning slice: M002/S05
- Supporting slices: none
- Validation: unmapped
- Notes: Queries project milestones, issue status, sub-issue completion to derive equivalent of state.md

### R105 — Per-project team configuration
- Class: integration
- Status: active
- Description: Each project configures which Linear team it maps to, similar to linear-cli's .linear.toml
- Why it matters: Issues are created under the correct team with the correct workflow states
- Source: user
- Primary owning slice: M002/S02
- Supporting slices: none
- Validation: unmapped
- Notes: Config stored in .kata/preferences.md or a dedicated .kata/linear.toml

### R106 — Personal API key authentication
- Class: integration
- Status: active
- Description: Linear auth uses a personal API key, stored securely via secure_env_collect
- Why it matters: Simpler than OAuth, works headlessly for agent automation, no browser flow required
- Source: user
- Primary owning slice: M002/S01
- Supporting slices: none
- Validation: unmapped
- Notes: Key stored as LINEAR_API_KEY in .env or equivalent

### R107 — Separate LINEAR-WORKFLOW.md prompt
- Class: core-capability
- Status: active
- Description: Linear mode gets its own workflow prompt document (LINEAR-WORKFLOW.md) that instructs agents to use Linear API operations instead of file I/O
- Why it matters: Clean separation from file-mode workflow. Agent instructions reference Linear entities and API calls, not file paths
- Source: user
- Primary owning slice: M002/S06
- Supporting slices: none
- Validation: unmapped
- Notes: Injected via prompt-loader when project is in Linear mode. Parallel to KATA-WORKFLOW.md for file mode

### R108 — Auto-mode works in Linear mode
- Class: primary-user-loop
- Status: active
- Description: /kata auto works in Linear mode — creating issues, advancing through tasks, writing summaries to Linear, just as it does with local files
- Why it matters: Auto-mode is Kata's primary execution loop. It must work in both modes
- Source: inferred
- Primary owning slice: M002/S06
- Supporting slices: none
- Validation: unmapped
- Notes: Auto-mode advancement reads/writes Linear instead of local files

### R109 — Dashboard and status work in Linear mode
- Class: primary-user-loop
- Status: active
- Description: /kata status and the dashboard overlay show progress derived from Linear in Linear mode
- Why it matters: Users need the same quick-glance status experience regardless of mode
- Source: inferred
- Primary owning slice: M002/S05
- Supporting slices: none
- Validation: unmapped
- Notes: Dashboard queries Linear API for progress data

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

### R110 — Offline/cached Linear mode
- Class: constraint
- Status: out-of-scope
- Description: Linear mode does not work offline or maintain a local cache of Linear state
- Why it matters: Prevents scope creep into sync/conflict-resolution complexity. Linear API must be reachable
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: If network is unavailable, Linear mode operations fail gracefully with clear error

### R111 — Bidirectional sync between file mode and Linear mode
- Class: anti-feature
- Status: out-of-scope
- Description: No import/export or sync between local .kata/ files and Linear
- Why it matters: Sync is a massive complexity trap. Users choose one mode per project
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Migration tooling could be a future milestone if demand exists

## Traceability

| ID | Class | Status | Primary owner | Supporting | Proof |
|---|---|---|---|---|---|
| R001 | core-capability | validated | M001/S01 | none | validated |
| R002 | integration | validated | M001/S01 | none | validated |
| R003 | primary-user-loop | validated | M001/S01 | none | validated |
| R010 | anti-feature | out-of-scope | none | none | n/a |
| R100 | core-capability | active | M002/S01 | none | unmapped |
| R101 | core-capability | active | M002/S03 | M002/S04, S05, S06 | unmapped |
| R102 | core-capability | active | M002/S03 | M002/S04 | unmapped |
| R103 | core-capability | active | M002/S04 | none | unmapped |
| R104 | core-capability | active | M002/S05 | none | unmapped |
| R105 | integration | active | M002/S02 | none | unmapped |
| R106 | integration | active | M002/S01 | none | unmapped |
| R107 | core-capability | active | M002/S06 | none | unmapped |
| R108 | primary-user-loop | active | M002/S06 | none | unmapped |
| R109 | primary-user-loop | active | M002/S05 | none | unmapped |
| R110 | constraint | out-of-scope | none | none | n/a |
| R111 | anti-feature | out-of-scope | none | none | n/a |

## Coverage Summary

- Active requirements: 10
- Mapped to slices: 10
- Validated: 3
- Unmapped active requirements: 0
