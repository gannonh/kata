# Linear Workflow — Kata Protocol for Linear Mode

> This document teaches you how to operate the Kata planning methodology using Linear as the
> backing store instead of `.kata/` files on disk.
>
> **When to read this:** At the start of any session working on a Kata-managed project in Linear
> mode, or when told `read @LINEAR-WORKFLOW.md`.
>
> **After reading this, always call `kata_derive_state` to find out what's next.**

---

## Quick Start: "What's next?"

In Linear mode, **there are no `.kata/` files to read**. State, plans, and artifacts live in
Linear. Always start here:

1. **Call `kata_derive_state` (no arguments)** — returns a `KataState` JSON telling you:
   - `phase` — what stage of work the project is in right now
   - `activeMilestone` — the current milestone (`id`, `identifier`, `title`)
   - `activeSlice` — the current slice/parent-issue (`id`, `identifier`, `title`)
   - `activeTask` — the current task/sub-issue to execute (`id`, `identifier`, `title`)
   - `progress` — completion counts across milestones, slices, tasks
   - `blockers` — list of strings describing why work is blocked (if `phase:"blocked"`)

2. **Act on `phase`** — see Phase Transitions below for the exact action each phase requires.

3. **Read the active task plan** — call `kata_read_document` with the task's plan title
   (e.g. `T01-PLAN`) to load the task execution contract.

4. **Execute the work** — do the coding/writing/testing described in the task plan.

5. **Write the summary** — call `kata_write_document` to persist the outcome.

6. **Advance the issue state** — call `kata_update_issue_state` to mark the task done and
   let `kata_derive_state` move to the next task on the next call.

**Do not read `.kata/` files. Do not fall back to `KATA-WORKFLOW.md`. All state and artifacts
are in Linear. Never use shell/file-search tools (`bash`, `find`, `rg`, `git`) to look for
`*-PLAN`/`*-SUMMARY` artifacts on disk in Linear mode.**

---

## The Hierarchy

```
Milestone       →  a shippable version (LinearMilestone on the project)
  Slice         →  one demoable vertical capability (parent Issue in the team)
    Task        →  one context-window-sized unit of work (sub-Issue under the slice)
    Artifact    →  plan/summary/UAT docs (LinearDocument attached to project or issue)
```

### Kata ↔ Linear Entity Mapping

| Kata Concept   | Linear Entity          | Notes                                             |
| -------------- | ---------------------- | ------------------------------------------------- |
| Milestone      | ProjectMilestone       | Attached to the configured project                |
| Slice          | Issue (parent)         | In the configured team; has milestone set         |
| Task           | Sub-issue              | Child of the slice issue                          |
| Artifact       | LinearDocument         | Attached to project or slice issue                |
| Workflow state | Issue state            | `backlog→planning→executing→verifying→done`       |
| Labels         | Issue labels           | `kata:milestone`, `kata:slice`, `kata:task`       |

---

## Entity Title Convention (D021)

All Kata entities in Linear use a bracket prefix. The regex is `/^\[([A-Z]\d+)\] (.+)$/`.

| Entity    | Format               | Example                         |
| --------- | -------------------- | ------------------------------- |
| Milestone | `[M001] Title`       | `[M001] Auth & Session Layer`   |
| Slice     | `[S01] Title`        | `[S01] JWT Token Foundation`    |
| Task      | `[T01] Title`        | `[T01] Core types and helpers`  |

**Always use this format when creating or searching for entities.** The bracket prefix is
regex-parseable, visually distinct in the Linear UI, and avoids conflicts with Linear's own
identifier format (e.g. `KAT-42`).

When calling `kata_create_milestone`, `kata_create_slice`, or `kata_create_task`, pass only
the human-readable title (e.g. `"Auth & Session Layer"`) — the tool automatically adds the
bracket prefix.

---

## Phase Transitions

`kata_derive_state` returns a `phase` field. Here is what each phase means and what to do.

| Phase          | What it means                                              | What to do                                                  |
| -------------- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| `pre-planning` | Active milestone exists but has no slices                  | Create slices with `kata_create_slice`; write roadmap doc   |
| `planning`     | Active slice is in backlog/unstarted state; no tasks       | Create tasks with `kata_create_task`; write slice plan doc  |
| `executing`    | Slice is started; active task exists, none terminal yet    | Read task plan doc, execute work, write summary, advance    |
| `verifying`    | Slice is started; some but not all tasks are terminal      | Same as `executing` — pick the first non-terminal task      |
| `complete`     | All milestones complete                                    | Nothing left; inform user                                   |
| `blocked`      | `LINEAR_API_KEY` missing, config invalid, or API error     | Surface `blockers[]` to user; do not retry without fixing   |

### `verifying` phase

Treat `verifying` exactly the same as `executing`. Do **not** stop or request UAT — the phase
name reflects that some tasks are done and some remain in the current slice. Pick the first
sub-issue whose state is not terminal (not `done`/`canceled`) and continue executing it.

### Advancing the slice

When all sub-issues under a slice are terminal, the slice's own issue should be advanced to
`done`. Call `kata_update_issue_state` with the slice issue ID and `phase: "done"`. On the
next `kata_derive_state` call, the next slice becomes active.

---

## Artifact Storage

Plans, summaries, and other documents are stored as **LinearDocuments** attached to the project
or slice issue. Use these two tools to read and write them:

```
kata_read_document(title)           → read an artifact by title
kata_write_document(title, content) → write (upsert) an artifact by title
```

### Document Title Format

| Artifact           | Title format     | Example          |
| ------------------ | ---------------- | ---------------- |
| Milestone roadmap  | `M001-ROADMAP`   | `M001-ROADMAP`   |
| Slice plan         | `S01-PLAN`       | `S01-PLAN`       |
| Task plan          | `T01-PLAN`       | `T01-PLAN`       |
| Task summary       | `T01-SUMMARY`    | `T01-SUMMARY`    |
| Slice summary      | `S01-SUMMARY`    | `S01-SUMMARY`    |
| Milestone context  | `M001-CONTEXT`   | `M001-CONTEXT`   |
| Decisions register | `DECISIONS`      | `DECISIONS`      |

**Titles are unique within the attachment scope (project or issue).** `kata_write_document`
is an upsert — it creates the document on first write and updates it on subsequent writes.

### D028 Markdown Normalization

Linear normalizes document content on write. The canonical round-trip format is:

- Use `* ` (asterisk + space) for list bullets, not `- ` (hyphen + space)
- Checkboxes use `* [ ]` and `* [x]` (not `- [ ]`)
- No trailing newline at the end of the document

When reading a document you previously wrote with `- ` bullets, Linear may return `* ` bullets.
Always accept both when parsing. When writing new documents, prefer `* ` bullets to avoid
unnecessary diffs on re-read.

### `requirements` field

`kata_derive_state` returns a `requirements` field on `KataState`. In Linear mode, this field
is **always `undefined`**. There is no `REQUIREMENTS.md` file in Linear mode. Do not assume
requirements are populated; derive what needs to be done from the task plan document instead.

---

## Auto-Mode Contract

Auto-mode runs fresh context windows in a loop until the slice is complete. Each session MUST
follow this contract:

### At the start of every session

1. Call `kata_derive_state` — always, no exceptions. Never assume state from prior context.
2. Act on `phase` as described in Phase Transitions.
3. If `phase: "blocked"`, surface `blockers[]` to the user and stop.
4. If `phase: "executing"` or `phase: "verifying"`:
   - Get `activeTask.id` and `activeTask.title` from the result.
   - Call `kata_read_document` with the task plan title (e.g. `T01-PLAN`) to load the contract.
   - If no plan doc exists yet (null result), check `activeTask` and derive intent from the
     slice roadmap (`kata_read_document("M001-ROADMAP")`) or slice plan (`kata_read_document("S01-PLAN")`).
   - If those are also null, create the missing task plan via `kata_write_document("T01-PLAN", ...)`
     and continue. Do not search local files or git history for plans.

### During execution

1. Execute the work described in the task plan — write code, run tests, fix bugs.
2. Verify the task's must-haves are actually met.
3. If you make an architectural decision, append it to the `DECISIONS` document via
   `kata_write_document`.

### At the end of every session (before context window closes)

1. **Write the task summary** — call `kata_write_document` with title `T01-SUMMARY` (or the
   appropriate task ID) and the full task summary content.
2. **Advance the task state** — call `kata_update_issue_state` with the task issue ID and
   `phase: "done"` to mark it terminal.
3. If this was the last task in the slice:
   - Write the slice summary: `kata_write_document("S01-SUMMARY", content)`.
   - Advance the slice issue: `kata_update_issue_state(sliceIssueId, { phase: "done" })`.
4. Auto-mode will then call `kata_derive_state` at the start of the next session and pick up
   from where the work left off.

**Never finish a session without writing the summary and advancing the issue state.** Auto-mode
depends on Linear state (not local files) to know what to do next.

---

## Tool Reference

All Kata-specific tools use the `kata_` prefix.

### State and Navigation

| Tool                    | Description                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `kata_derive_state`     | Derive full KataState from Linear API. Returns `phase`, `activeMilestone`, `activeSlice`, `activeTask`, `progress`, `blockers`. Call first at every session start. No arguments required. |
| `kata_list_milestones`  | List all milestones (ProjectMilestones) on the configured project.                                |
| `kata_list_slices`      | List slice issues (parent issues with `kata:slice` label) for a given milestone.                  |
| `kata_list_tasks`       | List task sub-issues for a given slice issue.                                                     |

### Issue State Advancement

| Tool                       | Description                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `kata_update_issue_state`  | Advance a Linear issue to the workflow state for a given Kata phase. Takes `issueId` and `phase` (`"backlog"` / `"planning"` / `"executing"` / `"verifying"` / `"done"`). |

### Document Storage

| Tool                    | Description                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `kata_write_document`   | Write (upsert) a Kata artifact as a LinearDocument. Takes `title` and `content`. Attaches to the project or a specific issue. |
| `kata_read_document`    | Read a Kata artifact document by title. Returns document with full markdown content, or `null` if not found. |
| `kata_list_documents`   | List all Kata artifact documents in the attachment scope.                                         |

### Entity Creation

| Tool                    | Description                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `kata_create_milestone` | Create a new milestone on the configured project. Pass human-readable title; bracket prefix is added automatically. |
| `kata_create_slice`     | Create a new slice issue with the `kata:slice` label and milestone assignment. Pass human-readable title; bracket prefix `[S01]` is added automatically using the next available ID. |
| `kata_create_task`      | Create a new task sub-issue under a slice. Pass human-readable title; bracket prefix `[T01]` is added automatically. |
| `kata_ensure_labels`    | Ensure the required Kata labels (`kata:milestone`, `kata:slice`, `kata:task`) exist in the team. |

---

## Session Checklist

1. Call `kata_derive_state` — no exceptions.
2. Check `phase` and act per Phase Transitions table.
3. If executing/verifying: read the task plan doc, do the work, verify must-haves.
4. Write task summary doc before session ends.
5. Advance task issue state to `done`.
6. If slice complete: write slice summary doc, advance slice to `done`.

---

## When Context Gets Large

If context pressure is building during a long execution:

1. **Prioritize the summary write and state advance above all else.** A written summary and a
   `done` state on the task issue is a clean handoff — auto-mode will start the next session
   correctly from Linear state alone.
2. Do not write a `continue.md` file — there are no `.kata/` files in Linear mode. Linear issue
   state IS the continue protocol.
3. If you cannot finish the task: write a partial summary document describing what was completed
   and what remains, advance the issue state to `"verifying"` (not `"done"`), and auto-mode will
   re-read the task on the next session.

---

## Project-Specific Context

Milestone-level decisions and project constraints can be stored as a `M001-CONTEXT` document.
Call `kata_read_document("M001-CONTEXT")` before starting implementation work on any milestone.
This is the Linear-mode equivalent of `.kata/milestones/M001/context.md`.
