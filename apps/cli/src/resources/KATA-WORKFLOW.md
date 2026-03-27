# Kata Workflow — Manual Bootstrap Protocol

> This document teaches you how to operate the Kata planning methodology.
>
> **When to read this:** At the start of any session working on Kata-managed work, or when told `read @KATA-WORKFLOW.md`.
>
> **After reading this:**
> - Call `kata_derive_state` to find out what's next. Do not read local `.kata/` milestone artifacts — workflow state lives in Linear.

---

## Quick Start: "What's next?"

State, plans, and artifacts live in Linear. Always start here:

1. **Call `kata_derive_state` (no arguments)** — returns a `KataState` JSON telling you:
   - `phase` — what stage of work the project is in right now
   - `activeMilestone` — the current milestone (`id`, `identifier`, `title`)
   - `activeSlice` — the current slice/parent-issue (`id`, `identifier`, `title`)
   - `activeTask` — the current task/sub-issue to execute (`id`, `identifier`, `title`)
   - `progress` — completion counts across milestones, slices, tasks
   - `blockers` — list of strings describing why work is blocked (if `phase:"blocked"`)

2. **Act on `phase`** — see Phase Transitions below for the exact action each phase requires.

3. **Read the active task plan** — load the task issue via `linear_get_issue` and use `issue.description` as the task plan. Fallback: if description is empty, call `kata_read_document` with the task plan title (e.g. `T01-PLAN`).

4. **Execute the work** — do the coding/writing/testing described in the task plan.

5. **Write the summary** — call `kata_write_document` to persist the outcome.

6. **Advance the issue state** — call `kata_update_issue_state` to mark the task done.

**Do not read or write local `.kata/` milestone artifacts. Do not create local milestone directories. Never use shell/file-search tools (`bash`, `find`, `rg`, `git`) to look for or create `*-PLAN`/`*-SUMMARY` artifacts on disk in Linear mode. Never run `mkdir` for `.kata/` artifact paths. All artifacts are stored via `kata_write_document` and `kata_read_document`.**

---

## The Hierarchy

```
Milestone  →  a shippable version (4-10 slices)
  Slice    →  one demoable vertical capability (1-7 tasks)
    Task   →  one context-window-sized unit of work (fits in one session)
```

**The iron rule:** A task MUST fit in one context window. If it can't, it's two tasks.

### Entity Mapping

| Kata Concept   | Linear Entity          | Notes                                             |
| -------------- | ---------------------- | ------------------------------------------------- |
| Milestone      | ProjectMilestone       | Attached to the configured project                |
| Slice          | Issue (parent)         | In the configured team; has milestone set         |
| Task           | Sub-issue              | Child of the slice issue                          |
| Artifact       | LinearDocument         | Attached to project or slice issue                |
| Workflow state | Issue state            | `backlog→planning→executing→verifying→done`       |
| Labels         | Issue labels           | `kata:milestone`, `kata:slice`, `kata:task`       |

### Entity Title Convention (D021)

All Kata entities in Linear use a bracket prefix. The regex is `/^\[([A-Z]\d+)\] (.+)$/`.

| Entity    | Format               | Example                         |
| --------- | -------------------- | ------------------------------- |
| Milestone | `[M001] Title`       | `[M001] Auth & Session Layer`   |
| Slice     | `[S01] Title`        | `[S01] JWT Token Foundation`    |
| Task      | `[T01] Title`        | `[T01] Core types and helpers`  |

When calling `kata_create_milestone`, `kata_create_slice`, or `kata_create_task`, pass only the human-readable title (e.g. `"Auth & Session Layer"`) — the tool automatically adds the bracket prefix.

---

## Artifact Storage

In Linear mode, artifacts are stored as **LinearDocuments** attached to the project or slice issue. The same formats apply — same markdown structure, same content — but stored via API instead of files.

Use these tools to read and write:
```
kata_read_document(title, { projectId })    → project-scoped artifact
kata_read_document(title, { issueId })      → slice-scoped artifact
kata_write_document(title, content, { projectId })  → write project-scoped artifact
kata_write_document(title, content, { issueId })    → write slice-scoped artifact
```

**Scoping rules — where documents live:**

| Scope          | Documents                                                              | Attachment         |
| -------------- | ---------------------------------------------------------------------- | ------------------ |
| Project-level  | `PROJECT`, `REQUIREMENTS`, `DECISIONS`, `M001-ROADMAP`, `M001-CONTEXT`, `M001-RESEARCH`, `M001-SUMMARY` | `{ projectId }`    |
| Slice-level    | `S01-RESEARCH`, `S01-SUMMARY`, `S01-UAT`, `S01-REPLAN`, `S01-ASSESSMENT` | `{ issueId }` of the slice issue |

**Slice and task plans live in issue descriptions, not LinearDocuments.** Pass the plan content as the `description` parameter when calling `kata_create_slice` or `kata_create_task`. Do not write separate `S01-PLAN` or `T01-PLAN` documents. Task summaries are posted as issue comments via `linear_add_comment`.

**Why slice docs use `{ issueId }`:** Slice IDs (S01, S02, ...) reset per milestone. Without scoping to the slice issue, `S01-PLAN` from milestone M001 would collide with `S01-PLAN` from milestone M002. Attaching to the slice issue prevents this.

**Document title format:**

| Artifact           | Title            | Scope              |
| ------------------ | ---------------- | ------------------ |
| Milestone roadmap  | `M001-ROADMAP`   | `{ projectId }`    |
| Milestone context  | `M001-CONTEXT`   | `{ projectId }`    |
| Milestone research | `M001-RESEARCH`  | `{ projectId }`    |
| Milestone summary  | `M001-SUMMARY`   | `{ projectId }`    |
| Slice plan         | *(issue description)* | `kata_create_slice({ description })` |
| Slice research     | `S01-RESEARCH`   | `{ issueId }`      |
| Slice summary      | `S01-SUMMARY`    | `{ issueId }`      |
| Task plan          | *(issue description)* | `kata_create_task({ description })` |
| Task summary       | *(issue comment)*    | `linear_add_comment`               |
| Decisions register | `DECISIONS`      | `{ projectId }`    |

Titles are unique within their scope. `kata_write_document` is an upsert — creates on first write, updates on subsequent writes.

**D028 — markdown normalization:** Linear normalizes document content on write. Use `* ` (asterisk + space) for list bullets, not `- `. Checkboxes use `* [ ]` and `* [x]`. Always accept both when parsing.

**`requirements` field:** `kata_derive_state` returns a `requirements` field. In Linear mode, this is always `undefined`. Derive what needs to be done from the task's issue description instead.

---

## File Format Reference

### `ROADMAP.md`

```markdown
# M001: Title of the Milestone

**Vision:** One paragraph describing what this milestone delivers.

**Success Criteria:**
- Observable outcome 1
- Observable outcome 2

---

## Slices

- [ ] **S01: Slice Title** `risk:low` `depends:[]`
  > After this: what the user can demo when this slice is done.

- [ ] **S02: Another Slice** `risk:medium` `depends:[S01]`
  > After this: demo sentence.

- [x] **S03: Completed Slice** `risk:low` `depends:[S01]`
  > After this: demo sentence.
```

**Parsing rules:** `- [x]` = done, `- [ ]` = not done. The `risk:` and `depends:[]` tags are inline metadata parsed from the line. `depends:[]` lists slice IDs this slice requires to be complete first.

Same format, stored as `M001-ROADMAP` document. In Linear mode, use `* [ ]` and `* [x]` instead of `- [ ]` and `- [x]` for D028 compatibility.

**Boundary Map** (required section in ROADMAP.md):

After the slices section, include a `## Boundary Map` that shows what each slice produces and consumes:

```markdown
## Boundary Map

### S01 → S02
Produces:
  types.ts → User, Session, AuthToken (interfaces)
  auth.ts  → generateToken(), verifyToken(), refreshToken()

Consumes: nothing (leaf node)

### S02 → S03
Produces:
  api/auth/login.ts  → POST handler
  api/auth/signup.ts → POST handler
  middleware.ts       → authMiddleware()

Consumes from S01:
  auth.ts → generateToken(), verifyToken()
```

The boundary map is a **planning artifact** — not runnable code. It:
- Forces upfront thinking about slice boundaries before implementation
- Gives downstream slices a concrete target to code against
- Enables deterministic verification that slices actually connect
- Gets updated during slice planning if new interfaces emerge

### `PLAN.md` (slice-level)

```markdown
# S01: Slice Title

**Goal:** What this slice achieves.
**Demo:** What the user can see/do when this is done.

## Must-Haves
- Observable outcome 1 (used for verification)
- Observable outcome 2

## Tasks

- [ ] **T01: Task Title**
  Description of what this task does.
  
- [ ] **T02: Another Task**
  Description.

## Files Likely Touched
- path/to/file.ts
- path/to/another.ts
```

### `TNN-PLAN.md` (task-level)

```markdown
# T01: Task Title

**Slice:** S01
**Milestone:** M001

## Goal
What this task accomplishes in one sentence.

## Must-Haves

### Truths
Observable behaviors that must be true when this task is done:
- "User can sign up with email and password"
- "Login returns a JWT token"

### Artifacts
Files that must exist with real implementation (not stubs):
- `src/lib/auth.ts` — JWT helpers (min 30 lines, exports: generateToken, verifyToken)
- `src/app/api/auth/login/route.ts` — Login endpoint (exports: POST)

### Key Links
Critical wiring between artifacts:
- `login/route.ts` → `auth.ts` via import of `generateToken`
- `middleware.ts` → `auth.ts` via import of `verifyToken`

## Steps
1. First thing to do
2. Second thing to do
3. Third thing to do

## Context
- Relevant prior decisions or patterns to follow
- Key files to read before starting
```

**Must-haves are what make verification mechanically checkable.** Truths are checked by running commands or reading output. Artifacts are checked by confirming files exist with real content. Key links are checked by confirming imports/references actually connect the pieces.

### `CONTEXT.md` (from discuss phase)

```markdown
# S01: Slice Title — Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

## Implementation Decisions
- Decision on gray area 1
- Decision on gray area 2

## Agent's Discretion
- Areas where the user said "you decide"

## Deferred Ideas
- Ideas that came up but belong in other slices
```

### `DECISIONS.md` (append-only register)

```markdown
# Decisions Register

<!-- Append-only. Never edit or remove existing rows.
     To reverse a decision, add a new row that supersedes it.
     Read this file at the start of any planning or research phase. -->

| #    | When     | Scope      | Decision           | Choice                      | Rationale                                | Revisable?            |
| ---- | -------- | ---------- | ------------------ | --------------------------- | ---------------------------------------- | --------------------- |
| D001 | M001/S01 | library    | Validation library | Zod                         | Type inference, already in deps          | No                    |
| D002 | M001/S01 | arch       | Session storage    | HTTP-only cookies           | Security, SSR compat                     | Yes — if mobile added |
| D003 | M001/S02 | api        | API versioning     | URL prefix /v1              | Simple, fits scale                       | Yes                   |
| D004 | M001/S03 | convention | Error format       | RFC 7807                    | Standard, client-friendly                | No                    |
| D005 | M002/S01 | arch       | Session storage    | JWT in Authorization header | Mobile client needs it (supersedes D002) | No                    |
```

**Rules:**
- **Append-only** — rows are never edited or removed. To reverse a decision, add a new row that supersedes it (reference the old ID).
- **#** — Sequential ID (`D001`, `D002`, ...), never reused.
- **When** — Where the decision was made: `M001`, `M001/S01`, or `M001/S01/T02`.
- **Scope** — Category tag: `arch`, `pattern`, `library`, `data`, `api`, `scope`, `convention`.
- **Revisable?** — `No`, or `Yes — trigger condition`.

**When to read:** At the start of any planning or research phase.
**When to write:** During discussion (seed from context), during planning (structural choices), during task execution (if an architectural choice was made), and during slice completion (catch-all for missed decisions).

Same format, stored as a `DECISIONS` document via `kata_write_document`.

---

## The Phases

Kata execution is phase-driven from `kata_derive_state.phase`.

### Phase 1: Discuss (optional)

Use this when scope or UX direction is unclear.

- Milestone discuss: refine milestone context and constraints.
- Slice discuss: run a focused context interview for one slice.
- Persist context with `kata_write_document` (`M001-CONTEXT`, `S01-CONTEXT`).

### Phase 2: Research (optional but recommended for uncertainty)

Research targets risk and integration unknowns.

- Read context docs (`M001-CONTEXT`, `S01-CONTEXT`, `DECISIONS`, `REQUIREMENTS`).
- Inspect real code paths and framework docs.
- Write research docs with `kata_write_document` (`M001-RESEARCH`, `S01-RESEARCH`).

Use this structure:

```markdown
# S01 Research

## Summary
What matters for planning and execution.

## Don't Hand-Roll
| Problem | Use Instead | Why |

## Common Pitfalls
- Pitfall + mitigation

## Relevant Code
- modules/files to extend

## Sources
- docs/links consulted
```

### Phase 3: Plan

Planning produces executable contracts, not vague TODOs.

For milestone planning:

1. Read `M001-CONTEXT`, `M001-RESEARCH`, `DECISIONS`, `REQUIREMENTS`.
2. Build 4-10 vertical slices ordered by risk.
3. Write `M001-ROADMAP` with checkboxes, risk, dependencies, demo lines, and boundary map.
4. Create slices via `kata_create_slice`.

For slice planning:

1. Read `M001-ROADMAP` and dependency summaries.
2. Read slice context/research docs.
3. Decompose into 1-7 tasks (context-window-sized).
4. Write slice plan to slice issue description.
5. Create tasks via `kata_create_task` with task plans in task issue descriptions.

### Phase 4: Execute

1. Call `kata_derive_state`.
2. Read active task issue description (fallback: `TNN-PLAN` doc if needed).
3. Execute steps and verify must-haves.
4. Record important decisions in `DECISIONS`.

### Phase 5: Verify

Verification must prove outcomes, not effort.

Verification ladder:
1. Static (exports, wiring, no stubs)
2. Command (tests/build/lint)
3. Behavioral (runtime/browser/API)
4. Human (only if non-automatable)

Capture results in task summary with explicit pass/fail evidence.

### Phase 6: Summarize

At task completion:

1. Post task summary comment on the task issue (`linear_add_comment`).
2. Include what shipped, evidence, deviations, and key files.
3. Advance task state with `kata_update_issue_state(..., phase:"done")`.

At slice completion:

1. Write `S01-SUMMARY` and `S01-UAT` via `kata_write_document` (slice scope).
2. Mark slice done in `M001-ROADMAP`.
3. Advance slice issue to done.

At milestone completion:

1. Write `M001-SUMMARY` via `kata_write_document`.

### Phase 7: Advance

After each completed unit, derive fresh state and move to the next active unit from `kata_derive_state`.

### Phase Transitions

| Phase                  | Meaning                                                   | Required action |
| ---------------------- | --------------------------------------------------------- | --------------- |
| `pre-planning`         | Active milestone exists but roadmap/slices not established | Write roadmap + create slice issues |
| `planning`             | Active slice needs task decomposition                      | Write slice plan + create task issues |
| `executing`            | Active task exists and needs implementation                | Execute + verify + summarize task |
| `verifying`            | Some tasks done, others pending                            | Continue execution on next non-terminal task |
| `summarizing`          | All tasks terminal, slice wrap-up pending                  | Write slice summary/UAT + advance slice |
| `completing-milestone` | All slices complete                                        | Write milestone summary |
| `complete`             | All milestones complete                                    | Report completion |
| `blocked`              | Missing config/auth/API issue                              | Surface blockers, stop until fixed |

`verifying` is operationally the same as `executing`: pick the first non-terminal task and continue.

---

## Git Strategy: Branch-Per-Slice with Squash Merge

Main stays clean; each slice gets an isolated branch.

### Lifecycle

1. Slice starts → create branch `kata/<scope>/M001/S01` from `main`.
2. Make small, descriptive task-level commits on that branch.
3. On slice completion → squash merge to `main`.
4. Keep branch history available for debugging/audit.

### Commit conventions

- Task commits: `feat(S01/T01): <what shipped>` (or `fix/refactor/test/docs/chore`).
- Squash commit: `feat(M001/S01): <slice outcome>`.

### Rollback guidance

- Revert on `main` with `git revert <sha>`.
- If needed, cherry-pick specific task commits from the slice branch for surgical rollback/reapply.

---

## Summary Injection for Downstream Tasks

When planning or executing a task, load relevant prior context:

1. Check the current slice's `depends:[]` in `ROADMAP.md`.
2. Load summaries from dependency slices.
3. Start with milestone summaries; drill to slice/task summaries only when needed.
4. Keep injected summary context bounded (~2500 tokens target).
5. If dependency context is too large, drop least-relevant/oldest summaries first.

Use `kata_read_document` to load summaries.
---

## Project-Specific Context

Project-specific guidance belongs in each milestone context document in Linear (for example `M001-CONTEXT`).

Always read the active milestone context before implementation work (`kata_read_document("M001-CONTEXT")`).

---

## Checklist for a Fresh Session

1. Call `kata_derive_state` — no exceptions.
2. Check `phase` and act per Phase Transitions table.
3. If `phase: "blocked"`, surface `blockers[]` to user and stop.
4. If executing/verifying: read the task plan from `issue.description`, do the work, verify must-haves.
5. Post task summary as issue comment (`linear_add_comment`) before session ends.
6. Advance task issue state to `done`.
7. If slice complete: post slice summary as comment on slice issue, advance slice to `done`.

---

## When Context Gets Large

If you sense context pressure (many files read, long execution, lots of tool output):

1. **Prioritize summary + state update before anything else.**
2. Do not write local continuation files — Linear issue state is the continuation protocol.
3. If the task is incomplete, write a partial summary describing exactly what is done vs remaining.
4. Keep the task in a non-terminal phase (`verifying`/in-progress as appropriate), then resume from `kata_derive_state` in the next session.

---

## Auto-Mode Contract

Auto-mode runs fresh context windows in a loop until the slice is complete. Each session MUST follow this contract:

### At the start of every session

1. Call `kata_derive_state` — always, no exceptions. Never assume state from prior context.
2. Act on `phase` as described in Phase Transitions.
3. If `phase: "blocked"`, surface `blockers[]` to the user and stop.
4. If `phase: "executing"` or `phase: "verifying"`:
   - Get `activeTask.id` and `activeTask.title` from the result.
   - Load the task issue via `linear_get_issue(<task-uuid>)` and use `issue.description` as the task plan contract.
   - Backward-compatible fallback: if task `description` is empty, call `kata_read_document` with the task plan title (e.g. `T01-PLAN`).
   - If both description and fallback plan doc are empty, planning did not complete correctly. Stop and surface the error.

### During execution

1. Execute the work described in the task plan — write code, run tests, fix bugs.
2. Verify the task's must-haves are actually met.
3. If you make an architectural decision, append it to the `DECISIONS` document via `kata_write_document`.

### At the end of every session (before context window closes)

1. **Write the task summary** — post an issue comment on the task via `linear_add_comment`.
2. **Advance the task state** — call `kata_update_issue_state` with `phase: "done"`.
3. If this was the last task in the slice:
   - Write the slice summary as a comment on the slice issue via `linear_add_comment`.
   - Advance the slice issue via `kata_update_issue_state(sliceIssueId, { phase: "done" })`.

**Never finish a session without writing the summary and advancing the issue state.**

---

## Tool Reference

All Kata-specific tools use the `kata_` prefix.

### State and Navigation

| Tool                    | Description                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `kata_derive_state`     | Derive full KataState from Linear API. Returns `phase`, `activeMilestone`, `activeSlice`, `activeTask`, `progress`, `blockers`. Call first at every session start. |
| `kata_list_milestones`  | List all milestones (ProjectMilestones) on the configured project.                                |
| `kata_list_slices`      | List slice issues (parent issues with `kata:slice` label) for a given milestone.                  |
| `kata_list_tasks`       | List task sub-issues for a given slice issue.                                                     |

### Issue State Advancement

| Tool                       | Description                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `kata_update_issue_state`  | Advance a Linear issue to the workflow state for a given Kata phase. Takes `issueId` and `phase`. |

### Document Storage

| Tool                    | Description                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `kata_write_document`   | Write (upsert) a Kata artifact as a LinearDocument. Use for milestone/project artifacts (`ROADMAP`, `CONTEXT`, `DECISIONS`, `PROJECT`, `REQUIREMENTS`, milestone/slice summaries, slice research). **Do not use for slice/task plans** (those go in issue descriptions) **or task summaries** (those go in issue comments). |
| `kata_read_document`    | Read a Kata artifact document by title. Returns document with content, or `null` if not found. Use as fallback for legacy slice/task plan docs when issue descriptions are empty. |
| `kata_list_documents`   | List all Kata artifact documents in the attachment scope.                                         |

> Slice plans (`Sxx-PLAN`) and task plans (`Txx-PLAN`) should now live in issue descriptions, not LinearDocuments. Slice/task summaries should be issue comments (`linear_add_comment`).

### Entity Creation

| Tool                    | Description                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `kata_create_milestone` | Create a new milestone. Pass human-readable title; bracket prefix is added automatically.         |
| `kata_create_slice`     | Create a new slice issue with the `kata:slice` label and milestone assignment.                    |
| `kata_create_task`      | Create a new task sub-issue under a slice.                                                        |
| `kata_ensure_labels`    | Ensure the required Kata labels exist in the team.                                                |
