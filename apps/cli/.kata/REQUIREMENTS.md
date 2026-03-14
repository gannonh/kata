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
- Status: validated
- Description: Users can configure a project to use "Linear mode" instead of file mode. In Linear mode, all Kata artifacts (state, roadmaps, plans, summaries, decisions) live in Linear instead of local `.kata/` files
- Why it matters: Teams already using Linear shouldn't have to maintain a parallel set of local planning files. Linear becomes the single source of truth
- Source: user
- Primary owning slice: M002/S03
- Supporting slices: M002/S04, M002/S05, M002/S06
- Validation: validated — all supporting slices complete: S02 provides mode switching + config; S03 provides entity hierarchy; S04 provides document storage; S05 provides state derivation + dashboard; S06 provides workflow prompt + auto-mode dispatch. Full Linear-mode pipeline is operational.
- Notes: Mode configured per-project. File mode remains the default

### R102 — Kata hierarchy maps to Linear entities
- Class: core-capability
- Status: validated
- Description: Kata's planning hierarchy maps to Linear as: Project → Linear Project, Milestone → Linear Milestone, Slice → Parent Issue, Task → Sub-Issue
- Why it matters: This mapping preserves Kata's structured decomposition while using Linear's native hierarchy. Sub-issues give tasks their own status, assignee, and comment threads
- Source: user
- Primary owning slice: M002/S03
- Supporting slices: M002/S04
- Validation: validated — M002/S03 integration test creates full M001→S01→T01 hierarchy; asserts task.parent.id === slice.id; proves hierarchy is queryable via label-filtered and parent-filtered API queries; parseKataEntityTitle recovers Kata IDs from Linear issue titles
- Notes: Parent issue (slice) with sub-issues (tasks) uses Linear's native sub-issue support

### R103 — Rich artifacts stored as Linear Documents
- Class: core-capability
- Status: validated
- Description: Roadmaps, context, research, summaries, and decisions are stored as Linear Documents attached to the relevant project or issue
- Why it matters: All planning artifacts are searchable, editable, and visible in Linear's UI alongside the issues they describe
- Source: user
- Primary owning slice: M002/S04
- Supporting slices: none
- Validation: validated — M002/S04 integration tests prove project-level and issue-level document writes round-trip with byte-identical content; upsert idempotency confirmed (1 document, not 2); scope isolation verified (project docs don't appear in issue scope); null-on-miss behavior confirmed; 6/6 integration test cases pass against real Linear workspace
- Notes: Documents are markdown-native in Linear. Attach to project for milestone-level, to parent issue for slice-level. Linear normalizes `- ` bullets to `* ` on storage

### R104 — State derived from Linear API queries
- Class: core-capability
- Status: validated
- Description: In Linear mode, Kata derives its state (active milestone, slice, task, phase) by querying Linear's API — no local state files
- Why it matters: Linear is the single source of truth. No sync, no cache, no stale local state
- Source: user
- Primary owning slice: M002/S05
- Supporting slices: none
- Validation: validated — M002/S05 integration test creates full milestone→slice→task hierarchy, calls deriveLinearState, asserts correct activeMilestone/activeSlice/activeTask/phase/progress; advances task state and re-derives to confirm phase transition; 4/4 integration tests pass against real Linear workspace
- Notes: Queries project milestones, issue status, sub-issue completion to derive equivalent of state.md; phase derived from Linear state type + children completion ratio (pure-issue-state, no document parsing)

### R105 — Per-project team configuration
- Class: integration
- Status: validated
- Description: Each project configures which Linear team it maps to, similar to linear-cli's .linear.toml
- Why it matters: Issues are created under the correct team with the correct workflow states
- Source: user
- Primary owning slice: M002/S02
- Supporting slices: none
- Validation: validated
- Notes: Config stored in `.kata/preferences.md`; legacy `.kata/PREFERENCES.md` remains a read-only fallback during the transition

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
- Status: validated
- Description: Linear mode gets its own workflow prompt document (LINEAR-WORKFLOW.md) that instructs agents to use Linear API operations instead of file I/O
- Why it matters: Clean separation from file-mode workflow. Agent instructions reference Linear entities and API calls, not file paths
- Source: user
- Primary owning slice: M002/S06
- Supporting slices: none
- Validation: validated — M002/S06: `src/resources/LINEAR-WORKFLOW.md` (265 lines, 7 sections) written and bundled; `loader.ts` sets `LINEAR_WORKFLOW_PATH`; `index.ts` `before_agent_start` injects full content into system prompt when `protocol.ready` is true; mode-switching tests confirm system prompt wiring; `wc -l` = 265
- Notes: Injected via protocol.ready gate in before_agent_start when project is in Linear mode. Parallel to KATA-WORKFLOW.md for file mode

### R108 — Auto-mode works in Linear mode
- Class: primary-user-loop
- Status: validated
- Description: /kata auto works in Linear mode — creating issues, advancing through tasks, writing summaries to Linear, just as it does with local files
- Why it matters: Auto-mode is Kata's primary execution loop. It must work in both modes
- Source: inferred
- Primary owning slice: M002/S06
- Supporting slices: none
- Validation: validated — M002/S06: `getWorkflowEntrypointGuard("auto")` returns `allow: true` in Linear mode; `selectLinearPrompt` routes all 5 phases to correct builders (executing, verifying → execute-task; planning → plan-slice; pre-planning → plan-milestone; summarizing → complete-slice; complete/blocked → null); `auto.ts` skips git operations in Linear mode; 22 unit tests pass; TypeScript clean
- Notes: Auto-mode advancement reads/writes Linear instead of local files. End-to-end live run against real workspace is optional; routing behavior is fully unit-tested

### R109 — Dashboard and status work in Linear mode
- Class: primary-user-loop
- Status: validated
- Description: /kata status and the dashboard overlay show progress derived from Linear in Linear mode
- Why it matters: Users need the same quick-glance status experience regardless of mode
- Source: inferred
- Primary owning slice: M002/S05
- Supporting slices: none
- Validation: validated — M002/S05: buildLinearEntrypointGuard "status"/"dashboard" cases return allow:true; handleStatus() dispatches to deriveLinearState in Linear mode; KataDashboardOverlay.loadData() is mode-aware; TypeScript clean; entrypoint guard grep confirmed
- Notes: Dashboard caches LinearClient + sliceLabelId in instance fields; refreshes from Linear API every 2s without re-creating the client

### R200 — PR creation as part of slice completion
- Class: core-capability
- Status: active
- Description: When a slice's tasks are all complete, Kata can create a GitHub PR for the slice branch with body auto-composed from slice artifacts
- Why it matters: Closes the gap between "code done" and "PR open" — the agent handles the full loop
- Source: user
- Primary owning slice: M003/S01
- Supporting slices: M003/S05
- Validation: unmapped
- Notes: Auto-create controlled by `pr.auto_create` preference. Uses file-backed body creation to prevent shell interpolation

### R201 — Specialized parallel PR review via subagents
- Class: core-capability
- Status: validated
- Description: `/kata pr review` dispatches 6 specialized reviewer subagents in parallel against the PR diff, producing aggregated findings ranked by severity
- Why it matters: Thorough code review from multiple perspectives (quality, tests, errors, types, comments, simplification) catches issues a single pass would miss
- Source: user
- Primary owning slice: M003/S02
- Supporting slices: none
- Validation: validated — M003/S02: `kata_review_pr` tool returns structured dispatch plan `{ ok, prNumber, selectedReviewers, reviewerTasks }` ready for `subagent({ tasks: [...] })` parallel dispatch; `scopeReviewers` heuristics proven by 5 contract tests; `aggregateFindings` deduplication and severity ranking proven by 2 contract tests; `buildReviewerTaskPrompt` tested; TypeScript clean; all 8/8 pr-review tests pass. Live parallel dispatch deferred to S05 operational verification.
- Notes: Reviewers are bundled subagent definitions. Scoping heuristics skip irrelevant reviewers based on what changed

### R202 — PR review comment addressing workflow
- Class: core-capability
- Status: validated
- Description: `/kata pr address` fetches PR review comments, presents them for triage, applies fixes for selected items, resolves GitHub threads, and pushes updates
- Why it matters: Review feedback loop is a major time sink; agent can handle mechanical fixes and thread management
- Source: user
- Primary owning slice: M003/S03
- Supporting slices: none
- Validation: validated — M003/S03: `kata_fetch_pr_comments` tool fetches all PR comment types (conversation, review, inline threads) via `fetch_comments.py` GraphQL; `summarizeComments` produces numbered, actionable comment list with resolved/outdated filtering; `kata_resolve_thread` resolves inline review threads via `resolveReviewThread` GraphQL mutation; `kata_reply_to_thread` posts replies via `addPullRequestReviewThreadReply` mutation; all 4 contract tests pass; TypeScript clean; full tool surface registered and loads without error
- Notes: Uses GraphQL to fetch all comment types (conversation, review, inline threads). Agent asks user which to address before acting. `/kata pr address` command surface deferred to S05.

### R203 — PR merge with CI validation
- Class: core-capability
- Status: active
- Description: `/kata pr merge` runs local CI checks, merges the PR, deletes the branch, and marks the slice complete
- Why it matters: Merge is the final step in slice completion; automating it with CI gating ensures quality
- Source: user
- Primary owning slice: M003/S04
- Supporting slices: none
- Validation: unmapped
- Notes: Merge is a separate human/agent action after PR creation — slice tasks done → PR created → merge confirms completion

### R204 — PR lifecycle preferences
- Class: integration
- Status: validated
- Description: PR behavior is configurable per-project: enabled/disabled, auto-create on slice completion, base branch, review on create, Linear linking
- Why it matters: Different projects have different PR workflows; one-size-fits-all won't work
- Source: user
- Primary owning slice: M003/S05
- Supporting slices: M003/S01
- Validation: validated — M003/S01: KataPrPreferences (5 fields: enabled, auto_create, base_branch, review_on_create, linear_link) round-trips through loadEffectiveKataPreferences(); normalizePrPreferences emits named errors; mergePreferences spreads pr block correctly; 3/3 unit tests pass. Auto-create hook deferred to S05.
- Notes: Preferences: pr.enabled, pr.auto_create, pr.base_branch, pr.review_on_create, pr.linear_link

### R205 — `/kata pr` command surface
- Class: primary-user-loop
- Status: active
- Description: `/kata pr` provides subcommands for create, review, address, merge, and status — the unified entry point for all PR operations
- Why it matters: Consistent command surface; discoverability; works with `/kata` wizard
- Source: inferred
- Primary owning slice: M003/S05
- Supporting slices: M003/S01, M003/S02, M003/S03, M003/S04
- Validation: unmapped
- Notes: Onboarding detects git + GitHub remote and offers PR setup

### R206 — PR body composition from slice artifacts
- Class: core-capability
- Status: validated
- Description: PR body is auto-composed from Kata slice plan, task summaries, and verification results — not written from scratch by the agent each time
- Why it matters: Consistent, high-quality PR descriptions that surface the right context for reviewers
- Source: inferred
- Primary owning slice: M003/S01
- Supporting slices: none
- Validation: validated — M003/S01: composePRBody reads slice plan (title + must-haves), task plan files (titles), and optional slice summary; produces ## What Changed / ## Must-Haves / ## Tasks sections; degrades gracefully on missing artifacts; 4/4 unit tests pass with real artifact fixtures. Linear-mode (reads Linear documents) deferred to S05/S06.
- Notes: Works in file-mode (reads .kata/ files). Linear-mode body composition deferred to S06 (Linear cross-linking). Template-driven

### R207 — Bundled PR reviewer subagents
- Class: core-capability
- Status: validated
- Description: Kata ships 6 specialized reviewer subagents: code-reviewer, failure-finder, test-analyzer, type-design-analyzer, comment-analyzer, code-simplifier
- Why it matters: Each reviewer has a focused mandate and isolated context window; proper subagents, not skill-based role-play
- Source: user
- Primary owning slice: M003/S02
- Supporting slices: none
- Validation: validated — M003/S02: 6 agent `.md` files in `src/resources/agents/pr-*.md`; all 6 have correct `name:` frontmatter matching `scopeReviewers` return values; content ported verbatim from pull-requests skill references; `ls src/resources/agents/pr-*.md | wc -l` → 6; synced to `~/.kata-cli/agent/agents/` via existing `resource-loader.ts` agents sync path
- Notes: Bundled in src/resources/agents/, synced to ~/.kata-cli/agent/agents/ via resource-loader. Ported from user's existing pr-review-plugin agents

### R208 — Linear cross-linking for PRs
- Class: integration
- Status: active
- Description: When both Linear mode and PR lifecycle are active, PRs include Linear issue references and Linear issues are updated with PR links
- Why it matters: Bidirectional traceability between code (GitHub) and planning (Linear)
- Source: user
- Primary owning slice: M003/S06
- Supporting slices: none
- Validation: unmapped
- Notes: Depends on M002 Linear mode being available. Additive — PR lifecycle works without it

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
| R101 | core-capability | validated | M002/S03 | M002/S04, S05, S06 | validated |
| R102 | core-capability | validated | M002/S03 | M002/S04 | validated |
| R103 | core-capability | validated | M002/S04 | none | validated |
| R104 | core-capability | validated | M002/S05 | none | validated |
| R105 | integration | validated | M002/S02 | none | validated |
| R106 | integration | active | M002/S01 | none | unmapped |
| R107 | core-capability | validated | M002/S06 | none | validated |
| R108 | primary-user-loop | validated | M002/S06 | none | validated |
| R109 | primary-user-loop | validated | M002/S05 | none | validated |
| R110 | constraint | out-of-scope | none | none | n/a |
| R111 | anti-feature | out-of-scope | none | none | n/a |
| R200 | core-capability | active | M003/S01 | M003/S05 | unmapped |
| R201 | core-capability | validated | M003/S02 | none | validated |
| R202 | core-capability | validated | M003/S03 | none | validated |
| R203 | core-capability | active | M003/S04 | none | unmapped |
| R204 | integration | validated | M003/S05 | M003/S01 | validated |
| R205 | primary-user-loop | active | M003/S05 | M003/S01–S04 | unmapped |
| R206 | core-capability | validated | M003/S01 | none | validated |
| R207 | core-capability | validated | M003/S02 | none | validated |
| R208 | integration | active | M003/S06 | none | unmapped |

## Coverage Summary

- Active requirements: 6 (R100, R106 from M002; R200, R203, R205, R208 from M003)
- Mapped to slices: 19
- Validated: 16 (R001–R003, R101–R109, R201, R202, R204, R206, R207)
- Unmapped active requirements: 0
