---
name: kata-executing-quick-tasks
description: Use this skill for executing small, well-defined tasks quickly without full planning overhead. Triggers include "quick", "quick task", "do this quickly", "fast task", "skip research", "skip planning", "just do it", "just do this", "simple task", "one-off task", "small change", "tiny fix", "quick fix", "quick change", "don't plan just do".
---

# Quick Task Execution Orchestrator

Executes small, well-defined tasks with Kata guarantees (atomic commits) but skips optional planning agents.

## When to Use

Use this skill when:
- Task is small and well-defined
- Requirements are clear (no research needed)
- No architecture decisions required
- Direct execution is faster than planning

**Do NOT use for:**
- Multi-file changes (>3 files)
- Uncertain requirements
- New features requiring design
- Changes affecting multiple subsystems

See `./references/task-constraints.md` for detailed heuristics.

## Workflow Overview

```
1. Parse task description from user
2. Validate task fits quick constraints
3. Execute task directly (no sub-agents)
4. Create atomic commit
5. Report completion
```

## Execution Flow

### Step 1: Parse Task Description

Extract task details from user request:

**What to identify:**
- **Action:** What needs to be done
- **Files:** Which files will be modified/created
- **Acceptance:** How to verify completion

**If description is unclear or missing critical details:**

Use AskUserQuestion:
```
question="What needs to be done?"
options=[
  "Let me describe it",
  "Show me similar completed tasks",
  "This needs planning (not quick)"
]
```

If user selects "This needs planning", exit and recommend:
```
This task may benefit from planning.

Use "plan this" or `/kata-planning-phases` for structured approach.
```

### Step 2: Validate Task Constraints

Check if task meets quick task criteria:

**Size constraints:**
- [ ] Affects ≤3 files
- [ ] Takes <30 minutes
- [ ] Single logical change

**Clarity constraints:**
- [ ] Requirements are clear
- [ ] No research needed
- [ ] No architecture decisions

**Scope constraints:**
- [ ] No new dependencies
- [ ] No schema changes
- [ ] No breaking changes

See `./references/task-constraints.md` for complete validation rules.

**If any constraint fails:**

Ask user to confirm escalation:
```
question="This task may be too large for quick execution. How to proceed?"
options=[
  "Do it anyway (quick)",
  "Create a plan instead",
  "Break into smaller tasks"
]
```

### Step 3: Execute Task

Execute the task directly without spawning sub-agents:

1. **Read relevant files** (use Read tool)
2. **Make changes** (use Write/Edit tools)
3. **Run verification** (test commands, build checks)
4. **Confirm completion** (acceptance criteria met)

**Error handling:**
- If unexpected complexity discovered → pause and ask to escalate
- If breaking changes needed → pause and ask to escalate
- If additional files required → check constraint, continue or escalate

### Step 4: Create Atomic Commit

After task completes successfully:

**1. Stage modified files individually:**

```bash
git status --short
```

For each modified file:
```bash
git add path/to/file.ts
```

**NEVER use:** `git add .` or `git add -A`

**2. Determine commit type:**

| Type       | When to Use                               |
| ---------- | ----------------------------------------- |
| `feat`     | New functionality                         |
| `fix`      | Bug fix                                   |
| `refactor` | Code cleanup, no behavior change          |
| `docs`     | Documentation only                        |
| `style`    | Formatting, linting                       |
| `test`     | Test changes only                         |
| `chore`    | Config, dependencies, tooling             |

**3. Craft commit message:**

Format: `{type}: {description}`

```bash
git commit -m "{type}: {concise description}

- {key change 1}
- {key change 2}
- {key change 3}
"
```

**Example:**
```bash
git commit -m "fix: correct email validation regex

- Update pattern to allow plus signs in email addresses
- Add test case for email+tag@domain.com format
"
```

**4. Verify commit:**

```bash
git log -1 --oneline
```

### Step 5: Report Completion

Output this markdown directly (not as a code block):

KATA > QUICK TASK COMPLETE

**{Task description}**

**Files modified:**
- {file1}
- {file2}

**Commit:** {hash}

---

Task completed without planning overhead.

For larger changes: "plan this" or `/kata-planning-phases`

---

## Key Principles

### Atomic Commits

Every quick task produces exactly one commit:
- Single logical change
- Descriptive message
- Independently revertable
- Git bisect friendly

### No Sub-agents

Quick tasks execute in main context:
- No Task tool spawning
- Direct file operations
- Immediate feedback
- Fast execution

### Fail Fast

If task exceeds constraints during execution:
1. **Stop immediately**
2. **Ask user** to escalate or continue
3. **Preserve work** (don't discard changes)
4. **Suggest planning** if appropriate

## Anti-patterns to Avoid

**DON'T use quick tasks for:**
- Refactoring multiple files ("clean up codebase")
- Adding new features ("add authentication")
- Fixing complex bugs ("fix race condition")
- Making breaking changes ("change API contract")

**DO use quick tasks for:**
- Typo fixes
- Single function additions
- Config updates
- Documentation edits
- Import path corrections
- Simple bug fixes

See `./references/task-constraints.md` for full list.

## Key References

- **Size and scope heuristics:** See `./references/task-constraints.md`
- **When to escalate to planning:** See `./references/task-constraints.md`
- **Commit message formats:** See `./references/task-constraints.md`

## Quality Standards

Quick tasks must:

- [ ] Complete in single commit
- [ ] Affect ≤3 files
- [ ] Have clear acceptance criteria
- [ ] No sub-agents spawned
- [ ] Descriptive commit message with type prefix
- [ ] Files staged individually (never `git add .`)
