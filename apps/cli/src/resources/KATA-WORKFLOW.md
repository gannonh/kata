# Kata Workflow — Manual Bootstrap Protocol

> This document teaches you how to operate the Kata planning methodology.
>
> **When to read this:** At the start of any session working on Kata-managed work, or when told `read @KATA-WORKFLOW.md`.
>
> **After reading this:**
> - **File mode:** Read `.kata/STATE.md` to find out what's next. If the milestone has a `CONTEXT.md`, read that too.
> - **Linear mode:** Call `kata_derive_state` to find out what's next. Do not read `.kata/` files — all state and artifacts live in Linear.

---

## Quick Start: "What's next?"

### File Mode

Read these files in order and act on what they say:

1. **`.kata/STATE.md`** — Where are we? What's the next action?
2. **`.kata/milestones/<active>/ROADMAP.md`** — What's the plan? Which slices are done? (STATE.md tells you which milestone is active)
3. **`.kata/milestones/<active>/CONTEXT.md`** — Project-specific decisions, reference paths, constraints. Read this before doing implementation work.
4. If a slice is active, read its **`PLAN.md`** — Which tasks exist? Which are done?
5. If a task was interrupted, check for **`continue.md`** in the active slice directory — Resume from there.

Then do the thing `STATE.md` says to do next.

### Linear Mode

In Linear mode, **there are no `.kata/` files to read**. State, plans, and artifacts live in Linear. Always start here:

1. **Call `kata_derive_state` (no arguments)** — returns a `KataState` JSON telling you:
   - `phase` — what stage of work the project is in right now
   - `activeMilestone` — the current milestone (`id`, `identifier`, `title`)
   - `activeSlice` — the current slice/parent-issue (`id`, `identifier`, `title`)
   - `activeTask` — the current task/sub-issue to execute (`id`, `identifier`, `title`)
   - `progress` — completion counts across milestones, slices, tasks
   - `blockers` — list of strings describing why work is blocked (if `phase:"blocked"`)

2. **Act on `phase`** — see Phase Transitions (Linear Mode) below for the exact action each phase requires.

3. **Read the active task plan** — load the task issue via `linear_get_issue` and use `issue.description` as the task plan. Fallback: if description is empty, call `kata_read_document` with the task plan title (e.g. `T01-PLAN`).

4. **Execute the work** — do the coding/writing/testing described in the task plan.

5. **Write the summary** — call `kata_write_document` to persist the outcome.

6. **Advance the issue state** — call `kata_update_issue_state` to mark the task done.

**Do not read or write `.kata/` files. Do not create `.kata/milestones/` directories. Do not fall back to file-backed artifacts. Never use shell/file-search tools (`bash`, `find`, `rg`, `git`) to look for or create `*-PLAN`/`*-SUMMARY` artifacts on disk in Linear mode. Never run `mkdir` for `.kata/` paths. All artifacts are stored via `kata_write_document` and `kata_read_document`.**

---

## The Hierarchy

```
Milestone  →  a shippable version (4-10 slices)
  Slice    →  one demoable vertical capability (1-7 tasks)
    Task   →  one context-window-sized unit of work (fits in one session)
```

**The iron rule:** A task MUST fit in one context window. If it can't, it's two tasks.

> **Linear mode — entity mapping:**
>
> | Kata Concept   | Linear Entity          | Notes                                             |
> | -------------- | ---------------------- | ------------------------------------------------- |
> | Milestone      | ProjectMilestone       | Attached to the configured project                |
> | Slice          | Issue (parent)         | In the configured team; has milestone set         |
> | Task           | Sub-issue              | Child of the slice issue                          |
> | Artifact       | LinearDocument         | Attached to project or slice issue                |
> | Workflow state | Issue state            | `backlog→planning→executing→verifying→done`       |
> | Labels         | Issue labels           | `kata:milestone`, `kata:slice`, `kata:task`       |

> **Linear mode — entity title convention (D021):**
>
> All Kata entities in Linear use a bracket prefix. The regex is `/^\[([A-Z]\d+)\] (.+)$/`.
>
> | Entity    | Format               | Example                         |
> | --------- | -------------------- | ------------------------------- |
> | Milestone | `[M001] Title`       | `[M001] Auth & Session Layer`   |
> | Slice     | `[S01] Title`        | `[S01] JWT Token Foundation`    |
> | Task      | `[T01] Title`        | `[T01] Core types and helpers`  |
>
> When calling `kata_create_milestone`, `kata_create_slice`, or `kata_create_task`, pass only
> the human-readable title (e.g. `"Auth & Session Layer"`) — the tool automatically adds the
> bracket prefix.

---

## File Locations

> **Linear mode: skip this section entirely.** In Linear mode, artifacts do NOT live in `.kata/`. They are stored as LinearDocuments via `kata_write_document`/`kata_read_document`. See "Artifact Storage (Linear Mode)" below.

### File Mode

All artifacts live in `.kata/` at the project root:

```
.kata/
  STATE.md                                  # Dashboard — always read first
  DECISIONS.md                              # Append-only decisions register
  milestones/
    M001/
      ROADMAP.md                            # Milestone plan (checkboxes = state)
      CONTEXT.md                            # Optional: user decisions from discuss phase
      RESEARCH.md                           # Optional: codebase/tech research
      SUMMARY.md                            # Milestone rollup (updated as slices complete)
      slices/
        S01/
          PLAN.md                           # Task decomposition for this slice
          CONTEXT.md                        # Optional: slice-level user decisions
          RESEARCH.md                       # Optional: slice-level research
          SUMMARY.md                        # Slice summary (written on completion)
          UAT.md                            # Non-blocking human test script (written on completion)
          continue.md                       # Ephemeral: resume point if interrupted
          tasks/
            T01-PLAN.md                     # Individual task plan
            T01-SUMMARY.md                  # Task summary with frontmatter
```

### Artifact Storage (Linear Mode)

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

> **Linear mode:** Same format, stored as `M001-ROADMAP` document. In Linear mode, use `* [ ]` and `* [x]` instead of `- [ ]` and `- [x]` for D028 compatibility.

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

### `STATE.md`

```markdown
# Kata State

**Active Milestone:** M001 — Title
**Active Slice:** S02 — Slice Title
**Active Task:** T01 — Task Title
**Phase:** Executing

## Recent Decisions
- Decision 1
- Decision 2

## Blockers
- None (or list blockers)

## Next Action
Exact next thing to do.
```

> **Linear mode:** There is no `STATE.md`. Call `kata_derive_state` instead — it returns equivalent information as a JSON object.

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

> **Linear mode:** Same format, stored as a `DECISIONS` document via `kata_write_document`.

---

## The Phases

Work flows through these phases. Each phase produces a file (or a LinearDocument in Linear mode).

### Phase 1: Discuss (Optional)

**Purpose:** Capture user decisions on gray areas before planning.
**Produces:** `CONTEXT.md` at milestone or slice level.
**When to use:** When the scope has ambiguities the user should weigh in on.
**When to skip:** When the user already knows exactly what they want, or told you to just go.

**How to do it manually:**
1. Read the roadmap to understand the scope.
2. Identify 3-5 gray areas — implementation decisions the user cares about.
3. Use `ask_user_questions` to discuss each area.
4. Write decisions to `CONTEXT.md`.
5. Do NOT discuss how to implement — only what the user wants.

> **Linear mode:** Do NOT create `.kata/milestones/` directories. Do NOT write files to disk. Do NOT run `mkdir` or `git commit` for planning artifacts. Write all documents (PROJECT, REQUIREMENTS, CONTEXT, ROADMAP, DECISIONS) via `kata_write_document`. Create milestones via `kata_create_milestone`. Linear IS the store — no local files.

### Phase 2: Research (Optional)

**Purpose:** Scout the codebase and relevant docs before planning.
**Produces:** `RESEARCH.md` at milestone or slice level.
**When to use:** When working in unfamiliar code, with unfamiliar libraries, or on complex integrations.
**When to skip:** When the codebase is familiar and the work is straightforward.

**How to do it manually:**
1. Read `CONTEXT.md` if it exists — know what decisions are locked.
2. Scout relevant code: `rg`, `find`, read key files.
3. Use `resolve_library` / `get_library_docs` if needed.
4. Write findings to `RESEARCH.md` with these sections:

```markdown
# S01: Slice Title — Research

**Researched:** 2026-03-07
**Domain:** Primary technology/problem domain
**Confidence:** HIGH/MEDIUM/LOW

## Summary
2-3 paragraph executive summary. Primary recommendation.

## Don't Hand-Roll
| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
Problems that look simple but have existing solutions.

## Common Pitfalls
### Pitfall 1: Name
**What goes wrong:** ...
**Why it happens:** ...
**How to avoid:** ...
**Warning signs:** ...

## Relevant Code
Existing files, patterns, reusable assets, integration points.

## Sources
- Context7: /library/id — topics fetched (HIGH confidence)
- WebSearch: finding — verified against docs (MEDIUM confidence)
```

The **Don't Hand-Roll** and **Common Pitfalls** sections prevent the most expensive mistakes.

### Phase 3: Plan

**Purpose:** Decompose work into context-window-sized tasks with must-haves.
**Produces:** `PLAN.md` + individual `T01-PLAN.md` files.

**For a milestone (roadmap):**
1. Read `CONTEXT.md`, `RESEARCH.md`, and `.kata/DECISIONS.md` if they exist.
2. Decompose the vision into 4-10 demoable vertical slices.
3. Order by risk (high-risk first to validate feasibility early).
4. Write `ROADMAP.md` with checkboxes, risk levels, dependencies, demo sentences.
5. **Write the boundary map** — for each slice, specify what it produces (functions, types, interfaces, endpoints) and what it consumes from upstream slices. This forces interface thinking before implementation and enables deterministic verification that slices actually connect.

**For a slice (task decomposition):**
1. Read the slice's entry in `ROADMAP.md` **and its boundary map section** — know what interfaces this slice must produce and consume.
2. Read `CONTEXT.md`, `RESEARCH.md`, and `.kata/DECISIONS.md` if they exist for this slice.
3. Read summaries from dependency slices (check `depends:[]` in roadmap).
4. Verify that upstream slices' actual outputs match what the boundary map says this slice consumes. If they diverge, update the boundary map.
5. Decompose into 1-7 tasks, each fitting one context window.
6. Each task needs: title, description, steps (3-10), must-haves (observable verification criteria).
7. Must-haves should reference boundary map contracts — e.g. "exports `generateToken()` as specified in boundary map S01→S02".
8. Create tasks via `kata_create_task`, passing the full task plan as the `description` parameter. Similarly, pass the slice plan as `description` when calling `kata_create_slice`. **Do not also write separate `TNN-PLAN` or `SNN-PLAN` LinearDocuments** — the plan lives in the issue description, not in a document.

### Phase 4: Execute

**Purpose:** Do the work for one task.
**Produces:** Code changes + `[DONE:n]` markers.

**How to do it manually:**
1. Read the task's `TNN-PLAN.md`.
2. Read relevant summaries from prior tasks (for context on what's already built).
3. Execute each step. Mark progress with `[DONE:n]` in responses.
4. If you made an architectural, pattern, or library decision, append it to `.kata/DECISIONS.md`.
5. If interrupted or context is getting full, write `continue.md` (see below).

> **Linear mode:** Read the task plan from the issue description (`linear_get_issue` → `issue.description`). Backward-compatible fallback: if `description` is empty, call `kata_read_document("T01-PLAN", { issueId })`. Append decisions via `kata_write_document("DECISIONS", ...)`. There is no `continue.md` — issue state is the continue protocol (see below).

### Phase 5: Verify

**Purpose:** Check that the task's must-haves are actually met.
**Produces:** Pass/fail determination.

**Verification ladder — use the strongest tier you can reach:**
1. **Static:** Files exist, exports present, wiring connected, not stubs.
2. **Command:** Tests pass, build succeeds, lint clean, blocked command works.
3. **Behavioral:** Browser flows work, API responses correct.
4. **Human:** Ask the user only when you genuinely can't verify yourself.

**The rule:** "All steps done" is NOT verification. Check the actual outcomes.

**Verification report format** (written into the summary or surfaced on failure):

```
### Observable Truths
| #   | Truth             | Status | Evidence                          |
| --- | ----------------- | ------ | --------------------------------- |
| 1   | User can sign up  | ✓ PASS | POST /api/auth/signup returns 201 |
| 2   | Login returns JWT | ✗ FAIL | Returns 500 — missing env var     |

### Artifacts
| File             | Expected                  | Status        | Evidence                                |
| ---------------- | ------------------------- | ------------- | --------------------------------------- |
| src/lib/auth.ts  | JWT helpers, min 30 lines | ✓ SUBSTANTIVE | 87 lines, exports generateTokens        |
| src/lib/email.ts | Email sending             | ✗ STUB        | 8 lines, console.log instead of sending |

### Key Links
| From           | To         | Via                   | Status      |
| -------------- | ---------- | --------------------- | ----------- |
| login/route.ts | auth.ts    | import generateTokens | ✓ WIRED     |
| email.ts       | Resend API | resend.emails.send()  | ✗ NOT WIRED |

### Anti-Patterns Found
| File             | Line | Pattern          | Severity  |
| ---------------- | ---- | ---------------- | --------- |
| src/lib/email.ts | 5    | console.log stub | 🛑 Blocker |
```

When verification finds gaps, include a **Gaps** section with what's missing, impact, and suggested fix.

### Phase 6: Summarize

**Purpose:** Record what happened for downstream tasks.
**Produces:** `TNN-SUMMARY.md`, and when slice completes, `SUMMARY.md`.

**Task summary format:**
```markdown
---
id: T01
parent: S01
milestone: M001
provides:
  - What this task built (~5 items)
requires:
  - slice: S00
    provides: What that prior slice built that this task used
affects: [S02, S03]
key_files:
  - path/to/important/file.ts
key_decisions:
  - "Decision made: reasoning"
patterns_established:
  - "Pattern name and where it lives"
drill_down_paths:
  - .kata/milestones/M001/slices/S01/tasks/T01-PLAN.md
duration: 15min
verification_result: pass
completed_at: 2026-03-07T16:00:00Z
---

# T01: Task Title

**Substantive one-liner — NOT "task complete" but what actually shipped**

## What Happened

Concise prose narrative of what was built, why key decisions were made,
and what matters for future work.

## Deviations
What differed from the plan and why (or "None").

## Files Created/Modified
- `path/to/file.ts` — What it does
```

The one-liner must be substantive: "JWT auth with refresh rotation using jose" not "Authentication implemented."

**Slice summary:** Written when all tasks in a slice complete. Compresses all task summaries. Includes `drill_down_paths` to each task summary. During slice completion, review task summaries for `key_decisions` and ensure any significant ones are captured in `.kata/DECISIONS.md`.

**Milestone summary:** Updated each time a slice completes. Compresses all slice summaries. This is what gets injected into later slice planning instead of loading many individual summaries.

> **Linear mode:** Post the task summary as an issue comment via `linear_add_comment(issueId, body)`. After posting, advance the issue state via `kata_update_issue_state(issueId, { phase: "done" })`. Always post the summary AND advance state before context ends.

### Phase 7: Advance

**Purpose:** Mark work done and move to the next thing.

**After a task completes:**
1. Mark the task done in `PLAN.md` (checkbox).
2. Check if there's a next task in the slice → execute it.
3. If slice is complete → write slice summary, mark slice done in `ROADMAP.md`.

**After a slice completes:**
1. Write slice `SUMMARY.md` (compresses all task summaries).
2. Write slice `UAT.md` — a non-blocking human test script derived from the slice's must-haves and demo sentence. The agent does NOT wait for UAT results.
3. Mark the slice checkbox in `ROADMAP.md` as `[x]`.
4. Update `STATE.md` with new position.
5. Update milestone `SUMMARY.md` with the completed slice's contributions.
6. Continue to next slice immediately. The user tests the UAT whenever convenient.
7. If the user reports UAT failures later, create fix tasks in the current or a new slice.
8. If all slices done → milestone complete.

> **Linear mode:** Advance issue state via `kata_update_issue_state`. When all sub-issues under a slice are terminal, advance the slice issue to `done`. On the next `kata_derive_state` call, the next slice becomes active.

### Phase Transitions (Linear Mode)

`kata_derive_state` returns a `phase` field. Here is what each phase means and what to do:

| Phase              | What it means                                              | What to do                                                   |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------------------------ |
| `pre-planning`     | Active milestone exists but has no slices                  | Create slices with `kata_create_slice` (pass slice plan as `description`); write roadmap doc |
| `planning`         | Active slice is in backlog/unstarted state; no tasks       | Create tasks with `kata_create_task` (pass task plan as `description`)                       |
| `executing`        | Slice is started; active task exists, none terminal yet    | Read task plan doc, execute work, write summary, advance     |
| `verifying`        | Slice is started; some but not all tasks are terminal      | Same as `executing` — pick the first non-terminal task       |
| `summarizing`      | All tasks terminal; slice summary not yet written          | Write slice summary, advance slice to done                   |
| `completing-milestone` | All slices complete                                    | Write milestone summary                                      |
| `complete`         | All milestones complete                                    | Nothing left; inform user                                    |
| `blocked`          | `LINEAR_API_KEY` missing, config invalid, or API error     | Surface `blockers[]` to user; do not retry without fixing    |

**`verifying` phase:** Treat exactly the same as `executing`. The phase name reflects that some tasks are done and some remain. Pick the first non-terminal sub-issue and continue executing.

---

## Continue-Here Protocol

**When to write `continue.md`:**
- You're about to lose context (compaction, session end, Ctrl+C).
- The current task isn't done yet.
- You want to pause and come back later.

**What to capture:**
```markdown
---
milestone: M001
slice: S01
task: T02
step: 3
total_steps: 7
saved_at: 2026-03-07T15:30:00Z
---

## Completed Work
- What's already done in this task and prior tasks in the slice.

## Remaining Work
- What steps remain, with enough detail to resume.

## Decisions Made
- Key decisions and WHY (so next session doesn't re-debate).

## Context
The "vibe" — what you were thinking, what's tricky, what to watch out for.

## Next Action
The EXACT first thing to do when resuming. Not vague. Specific.
```

**How to resume:**
1. Read `continue.md`.
2. Delete `continue.md` (it's consumed, not permanent).
3. Pick up from "Next Action".

> **Linear mode:** There is no `continue.md`. Issue state is the continue protocol. If you cannot finish a task: write a partial summary describing what was completed and what remains, then advance the issue state to `"verifying"` (not `"done"`). Auto-mode will re-read the task on the next session.

---

## State Management

### `STATE.md` is a derived cache

It is NOT the source of truth. It's a convenience dashboard.

**Sources of truth:**
- `ROADMAP.md` → which slices exist and which are done
- `PLAN.md` → which tasks exist within a slice
- `TNN-SUMMARY.md` → what happened during a task
- `SUMMARY.md` (slice/milestone) → compressed outcomes

**Update `STATE.md`** after every significant action:
- Active milestone/slice/task
- Recent decisions (last 3-5)
- Blockers
- Next action (most important — this is what a fresh session reads first)

> **Linear mode:** `kata_derive_state` replaces `STATE.md`. It derives state from Linear issue states and milestone structure. No need to manually update state — Linear issue state IS the source of truth.

### Reconciliation

If files disagree, **pause and surface to the user**:
- Roadmap says slice done but task summaries missing → inconsistency
- Task marked done but no summary → treat as incomplete
- Continue file exists for completed task → delete continue file
- State points to nonexistent slice/task → rebuild state from files

---

## Git Strategy: Branch-Per-Slice with Squash Merge

**Principle:** Main is always clean and working. Each slice gets an isolated branch. The user never runs a git command — the agent handles everything.

### Branch Lifecycle

1. **Slice starts** → create branch `kata/M001/S01` from main
2. **Per-task commits** on the branch — atomic, descriptive, bisectable
3. **Slice completes** → squash merge to main as one clean commit
4. **Branch kept** — not deleted, available for per-task history

### What Main Looks Like

```
feat(M001/S03): milestone and slice discuss commands
feat(M001/S02): extension scaffold and command routing
feat(M001/S01): file I/O foundation
```

One commit per slice. Individually revertable. Reads like a changelog.

### What the Branch Looks Like

```
kata/M001/S01:
  test(S01): round-trip tests passing
  feat(S01/T03): file writer with round-trip fidelity
  checkpoint(S01/T03): pre-task
  feat(S01/T02): markdown parser for plan files
  checkpoint(S01/T02): pre-task
  feat(S01/T01): core types and interfaces
  checkpoint(S01/T01): pre-task
```

### Commit Conventions

| When                 | Format                            | Example                    |
| -------------------- | --------------------------------- | -------------------------- |
| Before each task     | `checkpoint(S01/T02): pre-task`   | Safety net for `git reset` |
| After task verified  | `feat(S01/T02): <what was built>` | The real work              |
| Plan/docs committed  | `docs(S01): add slice plan`       | Bundled with first task    |
| Slice squash to main | `feat(M001/S01): <slice title>`   | Clean one-liner on main    |

Commit types: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`

### Squash Merge Message

```
feat(M001/S01): file I/O foundation

Agent can parse, format, load, and save all Kata file types with round-trip fidelity.

Tasks completed:
- T01: core types and interfaces
- T02: markdown parser for plan files
- T03: file writer with round-trip fidelity
```

### Rollback

| Problem                 | Fix                                                                      |
| ----------------------- | ------------------------------------------------------------------------ |
| Bad task                | `git reset --hard` to checkpoint on the branch                           |
| Bad slice               | `git revert <squash commit>` on main                                     |
| UAT failure after merge | Fix tasks on `kata/M001/S01-fix` branch, squash as `fix(M001/S01): <fix>` |

---

## Summary Injection for Downstream Tasks

When planning or executing a task, load relevant prior context:

1. Check the current slice's `depends:[]` in `ROADMAP.md`.
2. Load summaries from those dependency slices.
3. Start with the **highest available level** — milestone `SUMMARY.md` first.
4. Only drill down to slice/task summaries if you need specific detail.
5. Stay within **~2500 tokens** of total injected summary context.
6. If the dependency chain is too large, drop the oldest/least-relevant summaries first.

**Aim for:**
- ~5 provides per summary
- ~10 key_files per summary
- ~5 key_decisions per summary
- ~3 patterns_established per summary

These are soft caps — exceed them when genuinely needed, but don't let summaries become essays.

> **Linear mode:** Use `kata_read_document` to load summaries. Same injection rules apply.

---

## Project-Specific Context

This methodology doc is generic. Project-specific guidance belongs in the milestone's `CONTEXT.md`:

- **`.kata/milestones/<active>/CONTEXT.md`** — Architecture decisions, reference file paths, per-slice doc reading guides, implementation constraints, and any project-specific protocols (worktrees, testing, etc.)

**Always read the active milestone's `CONTEXT.md` before starting implementation work.** It tells you what decisions are locked, what files to reference, and how to verify your work in this specific project.

> **Linear mode:** Call `kata_read_document("M001-CONTEXT")` before starting implementation work on any milestone.

---

## Checklist for a Fresh Session

### File Mode

1. Read `.kata/STATE.md` — what's the next action?
2. Check for `continue.md` in the active slice — is there interrupted work?
3. If resuming: read `continue.md`, delete it, pick up from "Next Action".
4. If starting fresh: read the active slice's `PLAN.md`, find the next incomplete task.
5. If in a planning or research phase, read `.kata/DECISIONS.md` — respect existing decisions.
6. Read relevant summaries from prior tasks/slices for context.
7. Do the work.
8. Verify the must-haves.
9. Write the summary.
10. Mark done, update `STATE.md`, advance.
11. If context is getting full or you're done for now: write `continue.md` if mid-task, or update `STATE.md` with next action if between tasks.

### Linear Mode

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

### File Mode

1. **If mid-task:** Write `continue.md` with exact resume state. Tell the user: "Context is getting full. I've saved progress to continue.md. Start a new session and say `read @KATA-WORKFLOW.md - what's next?`"
2. **If between tasks:** Just update `STATE.md` with the next action. No continue file needed — the next session will read STATE.md and pick up the next task cleanly.
3. **Don't fight it.** The whole system is designed for this. A fresh session with the right files loaded is better than a stale session with degraded reasoning.

### Linear Mode

1. **Prioritize the summary write and state advance above all else.** A written summary and a `done` state on the task issue is a clean handoff.
2. Do not write a `continue.md` file — Linear issue state IS the continue protocol.
3. If you cannot finish the task: write a partial summary describing what was completed and what remains, advance the issue to `"verifying"` (not `"done"`), and auto-mode will re-read the task on the next session.

---

## Auto-Mode Contract (Linear Mode)

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

## Tool Reference (Linear Mode)

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
