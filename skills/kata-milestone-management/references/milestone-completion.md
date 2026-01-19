# Milestone Completion Workflow

Complete workflow for marking milestones complete, archiving artifacts, and preparing for next milestone.

## Overview

Mark a shipped version complete. This creates a historical record, archives milestone artifacts (roadmap + requirements), and prepares for the next milestone.

**Purpose:** Create historical record of shipped version, archive milestone artifacts, and prepare for next milestone.

**Output:** Milestone archived (roadmap + requirements), PROJECT.md evolved, git tagged.

## Pre-flight Check

Check for audit before proceeding:

```bash
ls .planning/v*-MILESTONE-AUDIT.md 2>/dev/null
```

**Route by audit status:**

- **No audit found:**
  ```
  No milestone audit found. Run /kata:audit-milestone first to verify
  requirements coverage, cross-phase integration, and E2E flows.
  ```

- **Audit has gaps:**
  ```
  Milestone audit found gaps. Run /kata:plan-milestone-gaps to create
  phases that close the gaps, or proceed anyway to accept as tech debt.
  ```

- **Audit passed:**
  ```
  Milestone audit passed. Proceeding with completion.
  ```

## Step 1: Verify Readiness

Check all phases have completed plans:

```bash
cat .planning/ROADMAP.md
ls .planning/phases/*/SUMMARY.md 2>/dev/null | wc -l
```

Present milestone scope:

```
Milestone: v[X.Y] [Name]

Includes:
- Phase 1: Foundation (2/2 plans complete)
- Phase 2: Authentication (2/2 plans complete)
- Phase 3: Core Features (3/3 plans complete)

Total: 3 phases, 7 plans, all complete
```

Wait for confirmation: "Ready to mark this milestone as shipped?"

## Step 2: Gather Stats

Calculate milestone statistics:

```bash
# Git range
git log --oneline --grep="feat(" | head -20

# Files modified
git diff --stat FIRST_COMMIT..LAST_COMMIT | tail -1

# LOC
find . -name "*.ts" -o -name "*.py" | xargs wc -l 2>/dev/null

# Timeline
git log --format="%ai" FIRST_COMMIT | tail -1  # Start
git log --format="%ai" LAST_COMMIT | head -1   # End
```

Present:
```
Milestone Stats:
- Phases: 1-3
- Plans: 7 total
- Tasks: 21 total (estimated)
- Files modified: 45
- Lines of code: 3,200 TypeScript
- Timeline: 12 days (Jan 7 -> Jan 19)
```

## Step 3: Extract Accomplishments

Read all phase SUMMARY.md files:

```bash
cat .planning/phases/01-*/01-*-SUMMARY.md
cat .planning/phases/02-*/02-*-SUMMARY.md
# etc.
```

Extract 4-6 key accomplishments:

```
Key accomplishments:
1. [Achievement from phase 1]
2. [Achievement from phase 2]
3. [Achievement from phase 3]
4. [Achievement from phase 4]
```

## Step 4: Archive Roadmap

Create archive file: `.planning/milestones/v[X.Y]-ROADMAP.md`

**Extract from current ROADMAP.md:**
- All phases in this milestone
- Full phase details (goals, plans, dependencies)
- Plan lists with completion status

**Archive format:**
```markdown
# Roadmap Archive: v[X.Y] [Milestone Name]

**Archived:** [DATE]
**Status:** SHIPPED
**Phases:** [X-Y] ([N] plans total)

---

[Full phase details from ROADMAP.md]

---

## Milestone Summary

**Decisions:** [From PROJECT.md Key Decisions]
**Issues Resolved:** [From phase summaries]

---
*Archived: [DATE]*
```

**After creating archive:**
```bash
rm .planning/ROADMAP.md
```

## Step 5: Archive Requirements

Create archive: `.planning/milestones/v[X.Y]-REQUIREMENTS.md`

**Transform for archive:**
- Mark all v1 requirements as `[x]` complete
- Add outcome notes (validated, adjusted, dropped)
- Update traceability status to "Complete"

**Archive format:**
```markdown
# Requirements Archive: v[X.Y] [Milestone Name]

**Archived:** [DATE]
**Status:** SHIPPED

---

[Full REQUIREMENTS.md with checkboxes marked complete]

---

## Milestone Summary

**Shipped:** [X] of [Y] v1 requirements
**Adjusted:** [list any that changed]
**Dropped:** [list any removed and why]

---
*Archived: [DATE]*
```

**After creating archive:**
```bash
rm .planning/REQUIREMENTS.md
```

## Step 6: Update PROJECT.md

Perform full evolution review:

**1. "What This Is" accuracy:**
- Compare description to what was built
- Update if product meaningfully changed

**2. Core Value check:**
- Is stated core value still right priority?
- Update if the ONE thing shifted

**3. Requirements audit:**

*Validated section:*
- Move all shipped Active requirements to Validated
- Format: `- [Requirement] -- v[X.Y]`

*Active section:*
- Remove moved requirements
- Add any new requirements for next milestone

*Out of Scope audit:*
- Review each item
- Remove irrelevant items
- Add any requirements invalidated

**4. Context update:**
- Current codebase state (LOC, tech stack)
- User feedback themes
- Known issues/tech debt

**5. Key Decisions audit:**
- Extract decisions from milestone summaries
- Add to Key Decisions table with outcomes
- Mark: Good, Revisit, or Pending

**6. Update footer:**
```markdown
---
*Last updated: [date] after v[X.Y] milestone*
```

## Step 7: Update STATE.md

**Project Reference:**
```markdown
## Project Reference

See: .planning/PROJECT.md (updated [today])

**Core value:** [Current]
**Current focus:** [Next milestone or "Planning next milestone"]
```

**Current Position:**
```markdown
Phase: [Next] of [Total]
Plan: Not started
Status: Ready to plan
Last activity: [today] - v[X.Y] milestone complete

Progress: [updated progress bar]
```

**Accumulated Context:**
- Clear decisions summary (full log in PROJECT.md)
- Clear resolved blockers
- Keep open blockers for next milestone

## Step 8: Git Tag and Commit

**Create tag:**
```bash
git tag -a v[X.Y] -m "$(cat <<'EOF'
v[X.Y] [Name]

Delivered: [One sentence]

Key accomplishments:
- [Item 1]
- [Item 2]
- [Item 3]

See .planning/MILESTONES.md for details.
EOF
)"
```

**Optional push:**
```bash
git push origin v[X.Y]
```

**Commit milestone completion:**
```bash
git add .planning/milestones/v[X.Y]-ROADMAP.md
git add .planning/milestones/v[X.Y]-REQUIREMENTS.md
git add .planning/MILESTONES.md
git add .planning/PROJECT.md
git add .planning/STATE.md
git add -u .planning/

git commit -m "chore: complete v[X.Y] milestone"
```

## Step 9: Present Completion

```
Milestone v[X.Y] [Name] complete

Shipped:
- [N] phases ([M] plans, [P] tasks)
- [One sentence of what shipped]

Archived:
- milestones/v[X.Y]-ROADMAP.md
- milestones/v[X.Y]-REQUIREMENTS.md

Summary: .planning/MILESTONES.md
Tag: v[X.Y]

---

## Next Up

**Start Next Milestone** -- questioning -> research -> requirements -> roadmap

/kata:new-milestone

<sub>/clear first -- fresh context window</sub>
```

## Success Criteria

- [ ] Audit checked (recommend if missing)
- [ ] All phases verified complete
- [ ] Stats gathered
- [ ] Accomplishments extracted
- [ ] Roadmap archived to milestones/
- [ ] Requirements archived to milestones/
- [ ] Originals deleted (ROADMAP.md, REQUIREMENTS.md)
- [ ] PROJECT.md full evolution complete
- [ ] STATE.md updated
- [ ] Git tag created
- [ ] Milestone commit made
- [ ] User knows next step (/kata:new-milestone)
