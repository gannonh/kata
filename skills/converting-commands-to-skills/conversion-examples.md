# Conversion Examples: Commands to Skills

This document provides complete before/after examples of command-to-skill conversions.

## Conversion Types

**Basic Conversion:** Transforms YAML frontmatter and directory structure only. Content below frontmatter is copied as-is with NO changes (keeps @path, !commands, etc.)

**Full Conversion:** Transforms frontmatter, directory structure, AND content (progressive disclosure, @path → ./path, !command → Bash tool instructions, etc.)

---

## Basic Conversion Example

### Before: ./commands/kata/add-phase.md

```markdown
---
description: Add a new phase to the project roadmap
allowed-tools: [Read, Write, Edit, Bash]
argument-hint: "[phase-name]"
---

# Add Phase

Add a new phase to the current milestone.

!cat .planning/ROADMAP.md

Update the roadmap file @roadmap-format.md with the new phase.
```

### After: ./skills/kata-adding-phases/SKILL.md (BASIC CONVERSION)

```markdown
---
name: adding-phases
description: Use this skill when adding planned phases to the roadmap, appending sequential work to milestones, or creating new phase entries. Triggers include 'add phase', 'append phase', 'new phase', and 'create phase'.
---

# Add Phase

Add a new phase to the current milestone.

!cat .planning/ROADMAP.md

Update the roadmap file @roadmap-format.md with the new phase.
```

**Changes Made (Basic Conversion):**
- ✅ Name: `add-phase.md` → `adding-phases` (gerund + plural)
- ✅ Directory: `commands/kata/` → `skills/kata-adding-phases/` (category as prefix)
- ✅ Description: Enhanced with trigger keywords and use cases
- ✅ Removed: `allowed-tools`, `argument-hint`
- ❌ Content: LEFT AS-IS (kept `!cat`, kept `@roadmap-format.md`)
- ❌ No progressive disclosure
- ❌ No supporting files created

---

## Full Conversion Examples

## Example 1: Simple Command (add-phase)

### Before: ./commands/kata/add-phase.md

```markdown
---
description: Add a new phase to the project roadmap
allowed-tools: [Read, Write, Edit, Bash]
argument-hint: "[phase-name]"
---

# Add Phase

Add a new phase to the current milestone.

!cat .planning/ROADMAP.md

Update the roadmap file @roadmap-format.md with the new phase.
```

### After: ./skills/kata-adding-phases/SKILL.md (FULL CONVERSION)

```markdown
---
name: adding-phases
description: Use this skill when adding planned phases to the roadmap, appending sequential work to milestones, or creating new phase entries. Triggers include 'add phase', 'append phase', 'new phase', and 'create phase'.
---

# Adding Phases to Roadmap

Add a new phase to the current milestone in the project roadmap.

## Process

1. Read the current roadmap using Read tool:
   ```bash
   cat .planning/ROADMAP.md
   ```

2. Identify the current milestone and next phase number

3. Extract phase details from user request:
   - Phase name or description
   - Expected deliverables
   - Dependencies (if any)

4. Update the roadmap file following the format in `./roadmap-format.md`

5. Use Edit tool to append the new phase to the current milestone

## Acceptance Criteria

- [ ] Phase added to current milestone
- [ ] Phase number is sequential
- [ ] Format matches existing phases
- [ ] ROADMAP.md file is valid markdown
```

**Changes Made (Full Conversion):**
- Name: `add-phase.md` → `adding-phases` (gerund + plural)
- Directory: `commands/kata/` → `skills/kata-adding-phases/` (category as prefix)
- Description: Enhanced with trigger keywords and use cases
- Removed: `allowed-tools`, `argument-hint`
- Bash: `!cat` → explicit Bash tool instruction
- File ref: `@roadmap-format.md` → `./roadmap-format.md`
- Added: Acceptance criteria for validation

---

## Example 2: Complex Command with Agent (plan-phase) - FULL CONVERSION

### Before: ./commands/kata/plan-phase.md

```markdown
---
description: Create a detailed plan for a project phase
allowed-tools: [Read, Write, Bash, Task]
agent: kata-planner
model: sonnet
context: conversation
---

# Plan Phase

Create a detailed implementation plan for a phase.

## Steps

1. Research the phase requirements
   !git status
   !ls .planning/

2. Break down into tasks
   See @task-breakdown.md for guidance

3. Launch the planner agent
   Agent: kata-planner

4. Review and validate the plan
```

### After: ./skills/kata-planning-phases/SKILL.md (FULL CONVERSION)

```markdown
---
name: planning-phases
description: Use this skill when creating detailed implementation plans for project phases. Handles task breakdown, dependency analysis, and plan file creation. Triggers include 'plan phase', 'create plan', 'plan implementation', and 'break down phase'.
---

# Planning Project Phases

Create a detailed implementation plan for a project phase.

## Planning Process

### 1. Research Phase Requirements

Gather context about the phase:

```bash
# Check current git status
git status

# List planning files
ls .planning/
```

Review conversation history for:
- User's requirements and constraints
- Previous decisions
- Related completed work

### 2. Break Down Into Tasks

Follow the task breakdown methodology in `./task-breakdown.md`:
- Identify deliverables
- Decompose into atomic tasks
- Estimate complexity
- Identify dependencies

### 3. Launch Planning Agent

Use the Task tool to invoke the kata-planner agent:

```markdown
Task tool parameters:
- subagent_type: "kata-planner"
- prompt: "Create a plan for [phase-name] that achieves [goals]"
- description: "Planning phase implementation"
```

### 4. Review and Validate

After agent completes:
- Verify all requirements are addressed
- Check task dependencies are logical
- Ensure plan is actionable
- Validate against `./plan-format.md`

## Supporting Files

- `./task-breakdown.md` - Task decomposition methodology
- `./dependency-analysis.md` - Dependency mapping guidance
- `./plan-format.md` - Plan file structure and format

## Acceptance Criteria

- [ ] Plan file created in correct location
- [ ] All phase requirements addressed
- [ ] Tasks are atomic and actionable
- [ ] Dependencies are clearly mapped
- [ ] Plan follows standard format
```

**Changes Made (Full Conversion):**
- Name: `plan-phase.md` → `planning-phases` (gerund + plural)
- Directory: `commands/kata/` → `skills/kata-planning-phases/` (category as prefix)
- Description: Enhanced with trigger keywords and specific use cases
- Removed: `allowed-tools`, `agent`, `model`, `context`
- Bash: `!git status` → explicit bash command
- File ref: `@task-breakdown.md` → `./task-breakdown.md`
- Agent invocation: Direct mention → explicit Task tool usage
- Structure: Added supporting files section

---

## Example 3: Command with Inline Script (debug) - FULL CONVERSION

### Before: ./commands/kata/debug.md

```markdown
---
description: Debug a failing test or issue
allowed-tools: [Read, Write, Bash, Grep]
---

# Debug

Systematically debug an issue.

## Process

!npm test 2>&1 | tee test-output.log

!grep -r "ERROR" . --include="*.log"

@debugging-workflow.md
```

### After: ./skills/kata-debugging-issues/SKILL.md (FULL CONVERSION)

```markdown
---
name: debugging-issues
description: Use this skill when encountering bugs, test failures, or unexpected behavior. Applies systematic debugging methodology with hypothesis testing, minimal reproduction, and root cause analysis. Invoke for any debugging task before proposing fixes.
---

# Debugging Issues Systematically

Apply a systematic approach to debug failing tests or unexpected behavior.

## Debugging Process

### 1. Reproduce the Issue

Run tests and capture output:

```bash
# Run tests and save output
npm test 2>&1 | tee test-output.log
```

### 2. Gather Error Information

Search for error messages and stack traces:

```bash
# Search for errors in logs
grep -r "ERROR" . --include="*.log"

# Search in source files if needed
grep -r "TODO\|FIXME\|BUG" . --include="*.js" --include="*.ts"
```

### 3. Apply Debugging Workflow

Follow the systematic debugging methodology in `./debugging-workflow.md`:

1. **Understand** - Read error messages, stack traces, and context
2. **Hypothesize** - Form testable hypotheses about root cause
3. **Test** - Create minimal reproduction
4. **Isolate** - Narrow down to specific code or conditions
5. **Fix** - Apply targeted fix
6. **Verify** - Confirm fix resolves issue without side effects

### 4. Document Findings

After resolving:
- Document root cause
- Update tests if needed
- Consider preventive measures

## When to Use

Invoke this skill when:
- Tests are failing
- Unexpected behavior occurs
- Error messages appear
- User reports a bug
- Code behaves differently than expected

## Acceptance Criteria

- [ ] Issue reproduced consistently
- [ ] Root cause identified
- [ ] Fix applied and tested
- [ ] No regressions introduced
- [ ] Documentation updated if needed
```

**Changes Made (Full Conversion):**
- Name: `debug.md` → `debugging-issues` (gerund + plural noun)
- Directory: `commands/kata/` → `skills/kata-debugging-issues/` (category as prefix)
- Description: Comprehensive invocation triggers and methodology keywords
- Removed: `allowed-tools`
- Bash: Inline commands → explicit bash blocks with context
- File ref: `@debugging-workflow.md` → `./debugging-workflow.md`
- Structure: Added "When to Use" section for clarity

---

## Example 4: Simple Command Without Category - FULL CONVERSION

### Before: ./commands/commit.md

```markdown
---
description: Create a git commit with changes
allowed-tools: [Bash]
---

# Commit

Create a git commit.

!git add .
!git commit -m "$1"
!git log -1
```

### After: ./skills/committing-changes/SKILL.md (FULL CONVERSION)

```markdown
---
name: committing-changes
description: Use this skill when committing code changes, creating git commits, staging files for commit, or when the user asks to commit, save changes, or make a commit. Handles conventional commit format, explicit file staging, and commit message crafting.
---

# Committing Changes

Create a git commit with staged or modified files.

## Commit Process

### 1. Review Changes

Check what will be committed:

```bash
git status
git diff
```

### 2. Stage Files

Stage files for commit:

```bash
# Stage all changes
git add .

# Or stage specific files
git add path/to/file1 path/to/file2
```

### 3. Craft Commit Message

Extract from user request or analyze changes to create:
- Clear, concise summary (50 chars or less)
- Present tense ("Add feature" not "Added feature")
- Optional body with details if needed

Follow conventional commit format if project uses it:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `refactor:` - Code refactoring
- `test:` - Tests
- `chore:` - Maintenance

### 4. Create Commit

```bash
git commit -m "commit message here"
```

### 5. Verify Commit

```bash
git log -1
```

## When to Use

Invoke when user:
- Says "commit these changes"
- Asks to "save my work"
- Requests "create a commit"
- Says "git commit"
- Completes a logical unit of work

## Acceptance Criteria

- [ ] Changes reviewed before committing
- [ ] Appropriate files staged
- [ ] Commit message is clear and follows project conventions
- [ ] Commit created successfully
- [ ] Verification shows correct commit
```

**Changes Made (Full Conversion):**
- Name: `commit.md` → `committing-changes` (gerund + object)
- Directory: `commands/commit.md` → `skills/committing-changes/` (no category, no prefix)
- Description: Multiple trigger phrases and use cases
- Removed: `allowed-tools`
- Bash: Simple commands → structured process with context
- Structure: Added sections for different stages
- Enhanced: Guidance on commit messages and conventions

---

## Key Transformation Patterns

### Directory Structure Pattern

**Rule:** Category/namespace becomes a prefix in the skill directory name

| Source | Target | Explanation |
|--------|--------|-------------|
| `commands/kata/add-phase.md` | `skills/kata-adding-phases/SKILL.md` | Category `kata` becomes prefix |
| `commands/gsd/new-project.md` | `skills/gsd-starting-new-projects/SKILL.md` | Category `gsd` becomes prefix |
| `commands/commit.md` | `skills/committing-changes/SKILL.md` | No category = no prefix |

### Name Patterns

| Pattern | Examples |
|---------|----------|
| Action + Object | `committing-changes`, `reviewing-code` |
| Gerund + Plural Noun | `adding-phases`, `planning-phases` |
| Process + Context | `debugging-issues`, `executing-plans` |
| Category + Gerund | `kata-adding-phases`, `gsd-starting-new-projects` |

### Description Patterns

| Pattern | Example |
|---------|---------|
| "Use this skill when..." | "Use this skill when committing code changes..." |
| List triggers | "Triggers include 'add phase', 'new phase'..." |
| List use cases | "Handles task breakdown, dependency analysis..." |
| Action verbs | "converting, adding, planning, debugging" |

### Content Structure Patterns

| Section | Purpose |
|---------|---------|
| Overview | Brief introduction to the skill |
| Process/Steps | Main workflow instructions |
| When to Use | Explicit invocation triggers |
| Supporting Files | References to detailed docs |
| Acceptance Criteria | Validation checklist |
