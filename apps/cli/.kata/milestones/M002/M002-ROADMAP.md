# M002: Linear Mode

**Vision:** Add a native Linear integration to Kata CLI so users can run the entire Kata workflow — planning, execution, verification, summarization — with Linear as the single source of truth, replacing local `.kata/` files.

## Success Criteria

- User can configure a project to use Linear mode via preferences
- All Kata CRUD operations (milestones, slices, tasks, documents) work against Linear's API
- `/kata auto` runs a complete milestone cycle in Linear mode — plan, execute, verify, summarize, advance
- `/kata status` shows live progress derived from Linear API queries
- File mode continues working unchanged for projects that don't opt into Linear mode

## Key Risks / Unknowns

- Linear GraphQL API surface coverage — do all needed mutations exist for our entity model? Could block the hierarchy mapping
- Sub-issue parent auto-close behavior — if Linear doesn't auto-close parents when children complete, auto-mode advancement needs manual status transitions
- Document attachment semantics — can Documents be attached to milestones, or only projects and issues? Affects where roadmaps and context live
- State derivation latency — querying Linear on every state check may be noticeably slower than file reads

## Proof Strategy

- Linear GraphQL API coverage → retire in S01 by proving all CRUD operations work against real Linear workspace
- Sub-issue / parent-issue behavior → retire in S03 by proving parent issues can be created with sub-issues and status transitions work correctly
- Document attachment → retire in S01 by proving documents can be attached to projects and issues

## Verification Classes

- Contract verification: unit tests for GraphQL client, type mappings, config parsing
- Integration verification: real Linear API calls creating/reading/updating/deleting entities in a test workspace
- Operational verification: full auto-mode cycle running against real Linear workspace
- UAT / human verification: user confirms Linear UI shows correct hierarchy, documents are readable, status reflects reality

## Milestone Definition of Done

This milestone is complete only when all are true:

- Native Linear extension can CRUD all entity types (projects, milestones, issues, sub-issues, documents, labels)
- Mode switching works: projects can be configured for file mode or Linear mode
- Full /kata auto cycle completes in Linear mode against a real Linear workspace
- /kata status and dashboard show accurate progress from Linear API
- File mode is unaffected by Linear mode changes
- LINEAR-WORKFLOW.md prompt guides agents correctly through Linear-mode operations

## Requirement Coverage

- Covers: R100, R101, R102, R103, R104, R105, R106, R107, R108, R109
- Partially covers: none
- Leaves for later: none
- Orphan risks: none

## Slices

- [ ] **S01: Linear GraphQL Client Extension** `risk:high` `depends:[]`
  > After this: agent can authenticate with Linear API key and perform CRUD on projects, milestones, issues, sub-issues, documents, and labels against a real Linear workspace via extension tools.

- [ ] **S02: Project Configuration & Mode Switching** `risk:medium` `depends:[S01]`
  > After this: user can configure a project for Linear mode (team, API key) via preferences and Kata detects the mode to dispatch file-based or Linear-based operations.

- [ ] **S03: Entity Mapping — Hierarchy & Labels** `risk:high` `depends:[S01]`
  > After this: agent can create a Kata milestone as a Linear milestone, slices as parent issues, tasks as sub-issues, with Kata labels for filtering — and the hierarchy is visible in Linear's UI.

- [ ] **S04: Document Storage — Artifacts as Linear Documents** `risk:medium` `depends:[S01, S03]`
  > After this: agent can create and update roadmaps, context, research, summaries, and decisions as Linear Documents attached to the correct project/issue — and read them back with full markdown fidelity.

- [ ] **S05: State Derivation from Linear API** `risk:medium` `depends:[S03, S04]`
  > After this: `/kata status` and the dashboard overlay show correct progress derived from Linear API queries — active milestone, slice, task, phase, completion counts — with no local state files.

- [ ] **S06: Workflow Prompt & Auto-Mode Integration** `risk:medium` `depends:[S02, S05]`
  > After this: `/kata auto` runs a complete task cycle in Linear mode — the agent reads plans from Linear, executes work, writes summaries to Linear, advances tasks/slices, and auto-mode loops correctly with fresh context per task.

## Boundary Map

### S01 → S02

Produces:
- `linear-client.ts` → `LinearClient` class with auth, GraphQL execution, error handling
- `linear-tools.ts` → pi extension tools: `linear_create_project`, `linear_create_issue`, `linear_create_document`, etc.
- `linear-types.ts` → TypeScript types for Linear entities (Project, Milestone, Issue, Document, Label)

Consumes:
- nothing (first slice)

### S01 → S03

Produces:
- `LinearClient` → `createIssue({ parentId })` for sub-issues, `createMilestone()`, label CRUD
- Proven: all mutations work against real Linear API

Consumes:
- nothing (first slice)

### S01 → S04

Produces:
- `LinearClient` → `createDocument({ projectId, issueId })`, `updateDocument()`, `getDocument()`
- Proven: documents can be attached to projects and issues

Consumes:
- nothing (first slice)

### S02 → S06

Produces:
- `linear-config.ts` → `getLinearMode()`, `getLinearTeamId()`, `getLinearProjectId()`
- Mode detection: `isLinearMode(basePath)` returns boolean
- Config storage in `.kata/preferences.md` or `.kata/linear.toml`

Consumes from S01:
- `LinearClient` for validating team/project config during setup

### S03 → S04

Produces:
- `linear-entities.ts` → `createKataMilestone()`, `createKataSlice()` (parent issue), `createKataTask()` (sub-issue)
- Label conventions: `kata:milestone`, `kata:slice`, `kata:task` labels created and applied
- Entity ID mapping: Kata IDs (M001, S01, T01) embedded in issue titles or custom fields

Consumes from S01:
- `LinearClient` → issue CRUD, milestone CRUD, label CRUD

### S03 → S05

Produces:
- Kata-labeled issues queryable by label + parent hierarchy
- Status conventions: which Linear workflow states map to Kata phases

Consumes from S01:
- `LinearClient` → query/filter APIs

### S04 → S05

Produces:
- `linear-documents.ts` → `writeRoadmap()`, `writeContext()`, `writeSummary()`, `readRoadmap()`, `readPlan()`
- Document naming convention: `"M001-ROADMAP"`, `"S01-PLAN"`, etc. as document titles

Consumes from S01:
- `LinearClient` → document CRUD
Consumes from S03:
- Entity IDs to attach documents to correct issues/projects

### S05 → S06

Produces:
- `linear-state.ts` → `deriveLinearState(config)` returning `KataState` equivalent
- Dashboard data source: milestone/slice/task progress from Linear queries

Consumes from S03:
- Entity query patterns, label filters, status mapping
Consumes from S04:
- Document reading for roadmap/plan parsing

### S02, S05 → S06

Produces:
- Mode-aware prompt injection: `LINEAR-WORKFLOW.md` loaded when `isLinearMode()` is true
- Mode-aware auto-mode: advancement reads/writes Linear instead of files

Consumes from S02:
- `isLinearMode()`, project config
Consumes from S05:
- `deriveLinearState()` for auto-mode state checks
