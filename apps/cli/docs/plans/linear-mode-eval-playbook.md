# Linear Mode Eval Playbook

> End-to-end evaluation of Kata CLI's Linear workflow mode from a **fresh user's perspective**.
> The evaluator acts as a new user. You bring: a Linear workspace and an API key.
> Everything else — Kata should handle.

## What You're Testing

1. **Onboarding:** Can a new user go from `kata` to working in Linear mode with natural interaction?
2. **Workflow correctness:** Does each phase read the right documents, write the right artifacts, and advance state?
3. **No fallback leaks:** Does the agent ever touch `.kata/` files, read from disk, or reference `LINEAR-WORKFLOW.md`?

---

## Current Architecture Context

In **file mode**, `/kata` on a fresh project triggers a full onboarding flow:
- Creates `.kata/` scaffold
- Dispatches `buildDiscussPrompt` which asks "What would you like to build?"
- Captures decisions → writes `context.md` → kicks off planning

In **Linear mode**, `/kata` calls `showLinearSmartEntry()` which:
- Calls `deriveKataState()` → `selectLinearPrompt(state)` → dispatches
- Has **no** equivalent onboarding wizard
- If no milestones exist, the user gets `phase: "blocked"` or an empty state

**This gap is itself a key eval finding.** The playbook tests what exists and documents what's missing.

---

## Prerequisites

- Kata CLI built from the branch under test
- A Linear workspace with API key (`LINEAR_API_KEY` in env)
- A Linear team (know the key, e.g. `KAT`)
- A Linear project in that team

> **Note:** The preferences system requires `linear.projectId` as a UUID. There is no
> project-name or project-slug resolution (unlike teams, which support `teamKey`). A new
> user has no obvious way to get this ID. Part of this eval is testing whether Kata helps
> them find it. If you need to get it manually: open the project in Linear → the URL
> contains `/project/<name>-<slugId>` → call `linear_list_projects` in Kata to find the
> UUID. This UX gap is itself a finding.

---

## Phase 0: Fresh Project

```bash
mkdir /tmp/kata-eval && cd /tmp/kata-eval
git init
echo "# Kata Linear Eval" > README.md
git add . && git commit -m "init"
```

No `.kata/`, no preferences, no history.

---

## Phase 1: First Run — The Onboarding Gap

### 1.1 Launch Kata

```bash
cd /tmp/kata-eval
kata
```

**Observe:** First-run banner, resource sync. You're in interactive mode.

### 1.2 Try the natural path

Type what a new user would:
```
I want to build a CLI tool that converts markdown to HTML
```

**What SHOULD happen (ideal):**
- Kata detects no preferences, no `.kata/`, no Linear config
- Asks: "Do you want to use file-based workflow or Linear?"
- If Linear: prompts for team key, project ID, API key
- Writes preferences
- Begins the discuss/plan flow

**What PROBABLY happens (current state):**
- Kata runs file-mode flow (creates `.kata/`, asks "What would you like to build?" via file-mode wizard)
- Linear mode is never offered

**Record:** Does the onboarding flow mention Linear mode? Is there a way to choose it without knowing about `/kata prefs`?

### 1.3 Try `/kata`

```
/kata
```

**What happens?** Since there's no preferences file, this runs file-mode `showSmartEntry()`. Linear mode isn't reachable yet.

**Finding:** A new user has no natural path to Linear mode. They must know to configure preferences first.

### 1.4 Configure Linear mode

Since there's no guided setup, configure manually:

```
/kata prefs project
```

**Observe:** Does this command exist? Does it let you set `workflow.mode`, `linear.teamKey`, `linear.projectId`?

If not, tell Kata directly:
```
Set up this project to use Linear workflow mode. My team key is KAT and my project ID is <uuid>.
```

The agent should use the preference system to write `.kata/preferences.md`. If it can't figure this out, do it yourself:
```bash
mkdir -p .kata && cat > .kata/preferences.md << 'EOF'
---
workflow:
  mode: linear
linear:
  teamKey: "YOUR_TEAM_KEY"
  projectId: "YOUR_PROJECT_UUID"
---
EOF
```

**Record:** How did you get to Linear mode? Was it discoverable?

### 1.5 Set API key if needed

If `LINEAR_API_KEY` isn't in your environment, tell Kata:
```
I need to set my Linear API key
```

It should use `secure_env_collect`. If not, export directly.

### 1.6 Verify Linear connection

```
/kata prefs status
```

**Expected:** Shows linear mode, team resolved, project resolved, API key present.

---

## Phase 2: Milestone Bootstrap — "What would you like to build?"

### 2.1 Start the workflow

```
/kata
```

**What SHOULD happen:** Linear-mode smart entry. Since there are no milestones in the Linear project, Kata should guide the user through creating one — similar to the file-mode discuss flow that asks "What would you like to build?"

**What PROBABLY happens:** `kata_derive_state` returns a state with no active milestone. `selectLinearPrompt` may return null (no matching phase). The user gets a notification like "No Linear prompt available for phase: ..." or "Linear mode is blocked."

**Record:** What does the user see? Is there a path forward?

### 2.2 If Kata doesn't bootstrap automatically

Tell it what to build:
```
I want to build a CLI tool that converts markdown to HTML. Create a milestone and plan it.
```

**Observe:** Does the agent:
- ✅ Create a milestone via `kata_create_milestone`
- ✅ Write `M001-CONTEXT` via `kata_write_document`
- ✅ Write `M001-ROADMAP` via `kata_write_document`
- ✅ Create slices via `kata_create_slice`
- ❌ NOT create `.kata/milestones/` directories
- ❌ NOT write files to disk
- ❌ NOT reference `LINEAR-WORKFLOW.md`

### 2.3 Verify state

After milestone is planned, ask:
```
What's next?
```

The agent should call `kata_derive_state` and report the active slice.

```
/kata status
```

Should show milestone progress from Linear.

---

## Phase 3: Slice Planning

### 3.1 Plan the first slice

```
/kata
```

**Expected flow:**
- `kata_derive_state` → `planning` with activeSlice = S01
- Agent reads `M001-ROADMAP` via `kata_read_document` — **required**
- Agent reads `S01-RESEARCH`, `DECISIONS`, `REQUIREMENTS` — optional, skips if null
- Agent checks dependency summaries from `depends:[]`
- Agent checks idempotency (existing plan? existing tasks?)
- Agent writes `S01-PLAN` via `kata_write_document`
- Agent creates task sub-issues via `kata_create_task`
- Agent writes `T01-PLAN`, `T02-PLAN`, etc. via `kata_write_document`
- Agent advances slice to executing via `kata_update_issue_state`

**Verify:**
```
Read the slice plan for S01
```
Agent should call `kata_read_document("S01-PLAN")` — not `cat .kata/.../plan.md`.

---

## Phase 4: Task Execution

### 4.1 Execute first task

```
/kata
```

**Expected flow:**
- `kata_derive_state` → `executing` with activeTask = T01
- Agent reads `T01-PLAN` via `kata_read_document` — **required, hard fail if null**
- Agent reads `S01-PLAN` — optional, for slice context
- Agent checks carry-forward (reads completed `Txx-SUMMARY` docs)
- Agent checks continue/resume (reads `T01-SUMMARY` for partial progress)
- Agent does the actual coding work
- Agent writes `T01-SUMMARY` via `kata_write_document`
- Agent advances task to done via `kata_update_issue_state`

**Critical checks:**
- ❌ If `T01-PLAN` is null, agent must STOP — not cascade to S01-PLAN → M001-ROADMAP → invent
- ❌ No plan auto-creation from thin air
- ✅ Summary written BEFORE state advance

### 4.2 Subsequent tasks

Run `/kata` for each remaining task. For T02+:
- ✅ Agent reads `T01-SUMMARY` for carry-forward (knows what was already built)
- ✅ Each task uses `kata_read_document` for its plan, not disk reads

### 4.3 All tasks done

After last task:
```
kata_derive_state → phase: "summarizing"
```

---

## Phase 5: Slice Completion

### 5.1 Complete the slice

```
/kata
```

**Expected flow:**
- `kata_derive_state` → `summarizing`
- Reads `M001-ROADMAP` — **required** (success criteria)
- Reads `S01-PLAN` — **required** (must-haves)
- Reads `REQUIREMENTS` — optional
- Collects all task summaries via `kata_list_tasks` + `kata_read_document`
- Writes `S01-SUMMARY`
- Writes `S01-UAT`
- Advances slice to done

**Verify in Linear UI:**
- S01 issue state = Done
- Documents visible on the project

---

## Phase 6: Full Lifecycle

### 6.1 Remaining slices

Repeat Phases 3-5 for each slice. At each boundary verify:
- State transitions correctly
- New slice reads dependency summaries from completed slices

### 6.2 Milestone completion

After all slices:
```
kata_derive_state → phase: "completing-milestone"
```

Run `/kata`:
- Reads `M001-ROADMAP` — required
- Reads all `Sxx-SUMMARY` via iteration
- Writes `M001-SUMMARY`

Final:
```
kata_derive_state → phase: "complete"
```

---

## Auto-Mode Test

Once manual stepping works for at least one full slice:

1. Create a new milestone (or use a second milestone in the same project)
2. Write the context doc
3. Run `/kata auto`
4. Observe:
   - Each iteration starts with `kata_derive_state`
   - Phase advances between iterations
   - No stuck loops (same phase 3+ times → error)
   - Full lifecycle: plan milestone → plan slice → execute tasks → complete slice → repeat → complete milestone

---

## Cross-Cutting Invariants

Check at **every** `/kata` dispatch:

| # | Invariant | Violation signal |
|---|-----------|-----------------|
| 1 | No `LINEAR-WORKFLOW.md` references | String appears in agent output |
| 2 | No bash/find/rg for artifact search | `cat .kata/`, `find .kata/`, `rg` on plan/summary files |
| 3 | No cascading document fallbacks | "if null, try X; if that's null, try Y" behavior |
| 4 | Required docs fail visibly | Null required read → agent improvises instead of stopping |
| 5 | Optional docs skipped silently | Null optional read produces errors |
| 6 | `projectId` on all doc operations | Missing scope in `kata_read_document` / `kata_write_document` |
| 7 | State advances correctly | Same phase returned after completed work |
| 8 | No `.kata/` file creation | `mkdir .kata/milestones`, `write .kata/...` |
| 9 | Summary before state advance | `kata_update_issue_state` before summary written |
| 10 | Unified workflow doc referenced | `KATA-WORKFLOW.md` in system prompt, not `LINEAR-WORKFLOW.md` |

---

## Failure Modes

| Scenario | How to trigger | Expected |
|----------|---------------|----------|
| No API key | Unset `LINEAR_API_KEY`, `/kata` | `phase: "blocked"`, clear message |
| No project configured | Remove `projectId`, `/kata` | `phase: "blocked"`, clear message |
| Bad team key | Set `teamKey: "INVALID"`, `/kata` | `phase: "blocked"`, resolution error |
| Missing task plan | Delete `T01-PLAN` in Linear, `/kata` during executing | Agent stops, does NOT cascade |
| Missing roadmap | Delete `M001-ROADMAP`, `/kata` during planning | Agent stops, does NOT cascade |
| No milestones | Fresh project with Linear config but empty project | Guided to create or clear error |

---

## Known Gaps (Expected Findings)

Based on code review before the eval:

1. **No Linear onboarding wizard.** File mode has "What would you like to build?" via `buildDiscussPrompt`. Linear mode has nothing — `showLinearSmartEntry()` goes straight to `selectLinearPrompt()` which has no handler for "no milestones."

2. **No `/kata prefs` guided setup.** A new user can't discover Linear mode without knowing the preference key names.

3. **Dispatch-time routing not yet wired.** `selectLinearPrompt` has override options for research/reassess/UAT, but the dispatch loop in `auto.ts` doesn't call the Linear equivalents of `checkNeedsReassessment` / `checkNeedsRunUat` / research-before-plan yet.

4. **No `replanning-slice` state from Linear deriver.** File mode detects replanning from task summary frontmatter (`blocker_discovered: true`). Linear state deriver doesn't check this — so `replan-slice` prompts exist but can't be triggered.

---

## Findings Template

```markdown
### Finding: [short title]
**Phase:** [eval phase #]
**Severity:** blocker / bug / gap / cosmetic
**Observed:** [what happened]
**Expected:** [what should have happened]
**Evidence:** [tool call, prompt text, or agent behavior]
**Workaround:** [if any]
```

---

## Cleanup

- Archive or delete the eval project in Linear
- `rm -rf /tmp/kata-eval`
