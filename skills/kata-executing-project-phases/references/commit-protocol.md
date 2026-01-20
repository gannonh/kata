# Commit Protocol

Atomic task commits during plan execution.

## Core Principle

Each task gets its own commit immediately after completion. This enables:
- Independent revertability
- Git bisect finding exact failing task
- Git blame tracing to specific task context
- Clear history for future sessions

---

## Task Commit Flow

After each task completes (verification passed, done criteria met):

### 1. Identify Modified Files

```bash
git status --short
```

Track files changed during THIS specific task, not the entire plan.

### 2. Stage Files Individually

**NEVER use:**
- `git add .`
- `git add -A`
- `git add src/` or any broad directory

**ALWAYS stage each file:**

```bash
git add src/api/auth.ts
git add src/types/user.ts
git add src/lib/validation.ts
```

### 3. Determine Commit Type

| Type | When to Use | Example |
|------|-------------|---------|
| `feat` | New feature, endpoint, component | feat(08-02): create user registration endpoint |
| `fix` | Bug fix, error correction | fix(08-02): correct email validation regex |
| `test` | Test-only changes (TDD RED) | test(08-02): add failing test for password hashing |
| `refactor` | Code cleanup, no behavior change (TDD REFACTOR) | refactor(08-02): extract validation to helper |
| `perf` | Performance improvement | perf(08-02): add database index for user lookups |
| `docs` | Documentation changes | docs(08-02): add API endpoint documentation |
| `style` | Formatting, linting fixes | style(08-02): format auth module |
| `chore` | Config, tooling, dependencies | chore(08-02): add bcrypt dependency |

### 4. Craft Commit Message

**Format:** `{type}({phase}-{plan}): {task-name-or-description}`

```bash
git commit -m "{type}({phase}-{plan}): {concise task description}

- {key change 1}
- {key change 2}
- {key change 3}
"
```

**Example:**

```bash
git commit -m "feat(08-02): create user registration endpoint

- POST /auth/register validates email and password
- Checks for duplicate users
- Returns JWT token on success
"
```

### 5. Record Commit Hash

```bash
TASK_COMMIT=$(git rev-parse --short HEAD)
echo "Task ${TASK_NUM} committed: ${TASK_COMMIT}"
```

Store for SUMMARY.md generation.

---

## Plan Metadata Commit

After ALL tasks in a plan complete, commit execution metadata:

**What to stage:**
- SUMMARY.md (created by executor)
- STATE.md (updated positions)

**NEVER include in metadata commit:**
- Code files (already committed per-task)
- PLAN.md (committed during planning phase)

```bash
git add .planning/phases/XX-name/{phase}-{plan}-SUMMARY.md
git add .planning/STATE.md
git commit -m "docs({phase}-{plan}): complete [plan-name] plan

Tasks completed: [N]/[N]
- [Task 1 name]
- [Task 2 name]
- [Task 3 name]

SUMMARY: .planning/phases/XX-name/{phase}-{plan}-SUMMARY.md
"
```

---

## Phase Completion Commit

After ALL plans in phase complete (at orchestrator level):

**What to stage:**
- ROADMAP.md (phase marked complete)
- STATE.md (updated positions)
- REQUIREMENTS.md (if requirements marked complete)
- VERIFICATION.md (phase verification results)

```bash
git add .planning/ROADMAP.md
git add .planning/STATE.md
git add .planning/REQUIREMENTS.md  # if updated
git add "$PHASE_DIR"/*-VERIFICATION.md
git commit -m "docs({phase}): complete {phase-name} phase"
```

---

## Git Log After Plan Execution

```
abc123f docs(08-02): complete user registration plan
def456g feat(08-02): add email confirmation flow
hij789k feat(08-02): implement password hashing with bcrypt
lmn012o feat(08-02): create user registration endpoint
```

Each task has its own commit, followed by metadata commit.

---

## TDD Commit Pattern

TDD tasks have different pattern (2-3 commits per task):

```
# RED phase
test(02-03): add failing test for password hashing

# GREEN phase
feat(02-03): implement password hashing

# REFACTOR phase (optional)
refactor(02-03): clean up password hashing
```

---

## Summary Documentation

In SUMMARY.md, document all commits:

```markdown
## Task Commits

Each task was committed atomically:

1. **Task 1: Create registration endpoint** - `lmn012o` (feat)
2. **Task 2: Add password hashing** - `hij789k` (feat)
3. **Task 3: Add email confirmation** - `def456g` (feat)

**Plan metadata:** `abc123f` (docs: complete plan)

_Note: TDD tasks may have multiple commits (test -> feat -> refactor)_
```

---

## Atomic Commit Benefits

| Benefit | How Commits Enable |
|---------|--------------------|
| Revertability | `git revert abc123f` reverts single task |
| Bisect | `git bisect` finds exact task that broke something |
| Blame | `git blame file.ts` shows which task added each line |
| Context | Future Claude sessions see clear task boundaries |
| Observability | CI/CD can track per-task success |
