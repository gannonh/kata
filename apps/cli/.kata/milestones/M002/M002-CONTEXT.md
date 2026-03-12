# M002: Linear Mode — Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

## Project Description

Add a native Linear integration to Kata CLI that enables a "Linear mode" workflow. Instead of storing planning artifacts (roadmaps, plans, summaries, state) as local `.kata/` files, Linear mode stores everything in Linear — using Projects, Milestones, Issues (parent for slices, sub-issues for tasks), and Documents. A built-in Linear GraphQL client extension replaces the MCP-based Linear integration for Kata workflow operations.

## Why This Milestone

Teams using Linear for project management currently have to maintain parallel planning artifacts in both Linear and local `.kata/` files. This milestone eliminates that duplication by making Linear the single source of truth for Kata's structured workflow. It also removes the MCP/OAuth dependency for Linear operations, replacing it with a simpler API key auth and a native Node.js GraphQL client.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Configure a project to use Linear mode (team + API key)
- Run `/kata` commands and auto-mode with all artifacts created/read from Linear
- View Kata's planning hierarchy in Linear's native UI (projects, milestones, parent issues with sub-issues, documents)
- See the Kata dashboard with progress derived from Linear API queries

### Entry point / environment

- Entry point: `/kata` CLI command with Linear mode configured in project preferences
- Environment: local dev terminal
- Live dependencies involved: Linear GraphQL API (https://api.linear.app/graphql)

## Completion Class

- Contract complete means: GraphQL client can CRUD all Kata entity types; mode switching works; all artifact types round-trip through Linear
- Integration complete means: Full Kata workflow (discuss → plan → execute → verify → summarize → advance) runs against real Linear workspace
- Operational complete means: Auto-mode loops correctly in Linear mode, advancing through tasks/slices/milestones via Linear API

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- A fresh project can be configured in Linear mode with `linear config` or preferences, creating a Linear project and team mapping
- The full /kata auto cycle works: creates milestone, plans slices as parent issues with sub-issue tasks, executes tasks, writes summaries as Linear documents, advances through the workflow — all against a real Linear workspace
- /kata status shows accurate progress derived from live Linear API queries, not cached state

## Risks and Unknowns

- Linear GraphQL API rate limits and pagination — high-volume auto-mode could hit limits
- Linear Document API capabilities — need to verify markdown fidelity, attachment to projects/issues, and update semantics
- Sub-issue behavior — need to verify parent issue auto-close when all sub-issues close, status inheritance
- State derivation latency — querying Linear on every state check vs local file reads has performance implications

## Existing Codebase / Prior Art

- `src/resources/extensions/kata/` — the entire Kata extension (10,751 lines across ~25 files). Core abstractions: `types.ts` (type hierarchy), `files.ts` (file parsing/writing), `state.ts` (state derivation from files), `auto.ts` (auto-mode loop), `commands.ts` (slash command registration), `prompt-loader.ts` (workflow prompt injection)
- `src/resources/extensions/kata/prompts/` — 22 prompt templates for all workflow phases (execute-task.md, plan-milestone.md, etc.)
- `src/resources/extensions/kata/templates/` — 16 file format templates
- `src/resources/extensions/kata/preferences.ts` — preference loading, skill rules, model config
- `src/resources/extensions/kata/paths.ts` — all path resolution for `.kata/` directory structure
- `/tmp/linear-cli-inspect/` — forked reference: schpet/linear-cli. Deno/TypeScript, GraphQL codegen, Cliffy CLI framework. Key files: `src/utils/graphql.ts` (GraphQL client), `src/utils/linear.ts` (entity resolution), `src/commands/` (issue/project/milestone/document CRUD), `graphql/schema.graphql` (28K lines Linear API schema)

> See `.kata/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R100 — Native Linear GraphQL client extension (core capability for this milestone)
- R101 — Linear mode as switchable workflow alternative (the top-level feature)
- R102 — Kata hierarchy maps to Linear entities (structural mapping)
- R103 — Rich artifacts stored as Linear Documents (document storage)
- R104 — State derived from Linear API queries (state derivation)
- R105 — Per-project team configuration (project config)
- R106 — Personal API key authentication (auth)
- R107 — Separate LINEAR-WORKFLOW.md prompt (agent instructions)
- R108 — Auto-mode works in Linear mode (execution loop)
- R109 — Dashboard and status work in Linear mode (observability)

## Scope

### In Scope

- Native Linear GraphQL client as a Kata extension (ported from linear-cli)
- Personal API key auth for Linear
- Per-project Linear team configuration
- Mode switching: file mode (default) vs Linear mode
- Mapping: Project→Project, Milestone→Milestone, Slice→Parent Issue, Task→Sub-Issue
- Artifacts as Linear Documents (roadmaps, context, research, summaries, decisions)
- State derivation from Linear API
- LINEAR-WORKFLOW.md prompt for agent instructions
- Auto-mode support in Linear mode
- Dashboard/status support in Linear mode

### Out of Scope / Non-Goals

- Offline/cached Linear mode (R110)
- Bidirectional file↔Linear sync (R111)
- OAuth authentication flow
- Custom MCP panel (R010)
- Modifying the file-based workflow (it remains as-is)

## Technical Constraints

- Extension must be pure Node.js TypeScript (no Deno runtime)
- GraphQL client must work with `graphql-request` or similar lightweight Node library (not the full Linear SDK which pulls in heavy deps)
- Must not break the existing file-based workflow
- Linear API key must be stored securely (not in plaintext config files committed to git)
- All Linear operations must handle network errors gracefully with clear error messages

## Integration Points

- Linear GraphQL API (`https://api.linear.app/graphql`) — all CRUD operations
- Kata preference system (`preferences.ts`) — mode selection, team config
- Kata prompt loader (`prompt-loader.ts`) — injecting LINEAR-WORKFLOW.md vs KATA-WORKFLOW.md
- Kata state derivation (`state.ts`) — alternative implementation querying Linear
- Kata auto-mode (`auto.ts`) — must dispatch through Linear mode abstractions
- Kata dashboard (`dashboard-overlay.ts`) — must render Linear-derived progress

## Open Questions

- Linear Document size limits — are there practical limits on document content length? May affect large roadmaps — current thinking: split into multiple documents if needed
- Issue label conventions — should Kata tag its managed issues with specific labels (e.g. `kata:slice`, `kata:task`) for easy filtering? — current thinking: yes, use labels to distinguish Kata-managed issues from manually created ones
- Status mapping — how do Linear's workflow states (Backlog, Todo, In Progress, Done, Cancelled) map to Kata's phases? — current thinking: explicit mapping in config, with sensible defaults
