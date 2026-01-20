# Summary Creation Reference

Detailed guidance for creating SUMMARY.md files after plan execution.

## File Location

```
.planning/phases/{phase-dir}/{phase}-{plan}-SUMMARY.md
```

Example: `.planning/phases/01-foundation/01-03-SUMMARY.md`

## When to Create

Create SUMMARY.md immediately after:
1. All tasks in the plan are executed
2. Each task is committed individually
3. Verification criteria are met
4. Done criteria are confirmed

SUMMARY.md is a required output of every plan execution.

## Frontmatter Fields

All frontmatter fields must be populated during summary creation.

```yaml
---
phase: XX-name           # From PLAN.md frontmatter
plan: YY                 # From PLAN.md frontmatter
subsystem: [category]    # auth, payments, ui, api, database, infra, testing
tags: [tech keywords]    # jwt, stripe, react, postgres, prisma

# Dependency graph
requires:
  - phase: [prior phase]
    provides: [what it built that this uses]
provides:
  - [what this plan delivered]
affects: [phases that will need this context]

# Tech tracking
tech-stack:
  added: [new libraries installed]
  patterns: [architectural patterns established]

key-files:
  created: [important files created]
  modified: [important files modified]

key-decisions:
  - "Decision 1 with rationale"
  - "Decision 2 with rationale"

patterns-established:
  - "Pattern 1: description"

# Metrics
duration: Xmin
completed: YYYY-MM-DD
---
```

### Field Population Guide

**subsystem:** Primary categorization based on what the plan builds:
- `auth` - Authentication, authorization, sessions
- `api` - API endpoints, routes, middleware
- `database` - Schema, migrations, models
- `ui` - Components, pages, styling
- `infra` - Deployment, CI/CD, configuration
- `testing` - Test infrastructure, test utilities

**requires:** Look at PLAN.md `<context>` section for referenced prior summaries or phases.

**provides:** Extract from accomplishments - what was actually delivered.

**affects:** Infer from phase description what future work might depend on this.

**tech-stack.added:** Check package.json diff or explicit dependency installation.

**patterns-established:** Document conventions future phases should maintain.

## One-Liner Requirement

The one-liner after the title MUST be substantive - it tells someone what actually shipped.

**Good examples:**
- "JWT auth with refresh rotation using jose library"
- "Prisma schema with User, Session, and Product models"
- "Dashboard with real-time metrics via Server-Sent Events"
- "Skills installer with kata-* filtering and local/global modes"

**Bad examples (never use):**
- "Phase complete"
- "Authentication implemented"
- "Foundation finished"
- "All tasks done"
- "Implementation finished"

## Required Sections

### Performance

```markdown
## Performance

- **Duration:** [time in minutes]
- **Started:** [ISO timestamp]
- **Completed:** [ISO timestamp]
- **Tasks:** [count completed]
- **Files modified:** [count]
```

Calculate duration from execution start to completion.

### Accomplishments

List 2-4 key outcomes, most important first:

```markdown
## Accomplishments
- [Most important outcome]
- [Second key accomplishment]
- [Third if applicable]
```

### Task Commits

Document each task's atomic commit:

```markdown
## Task Commits

Each task was committed atomically:

1. **Task 1: [task name]** - `abc123f` (feat/fix/test/refactor)
2. **Task 2: [task name]** - `def456g` (feat/fix/test/refactor)

**Plan metadata:** `hij789k` (docs: complete plan)
```

The commit hash must be recorded during task execution.

### Files Created/Modified

```markdown
## Files Created/Modified
- `path/to/file.ts` - Brief description
- `path/to/another.ts` - Brief description
```

### Decisions Made

```markdown
## Decisions Made
- [Decision with brief rationale]
- [Another decision with why]
```

If no decisions were made: "None - followed plan as specified"

### Deviations from Plan

If no deviations: "None - plan executed exactly as written"

If deviations occurred, document each:

```markdown
## Deviations from Plan

### Auto-fixed Issues

**1. [Rule N - Category] Brief description**
- **Found during:** Task [N] ([task name])
- **Issue:** [What was wrong]
- **Fix:** [What was done]
- **Files modified:** [file paths]
- **Verification:** [How verified]
- **Committed in:** [hash]

---

**Total deviations:** [N] auto-fixed ([breakdown by rule])
**Impact on plan:** [Brief assessment]
```

### Next Phase Readiness

```markdown
## Next Phase Readiness
- [What's ready for next phase]
- [Any blockers or concerns]
```

## Complete Example

```markdown
---
phase: 01-foundation
plan: 02
subsystem: auth
tags: [jwt, jose, bcrypt, middleware]

requires:
  - phase: 01-foundation
    provides: User model with email field
provides:
  - Login endpoint with JWT
  - Protected route middleware
  - Refresh token rotation
affects: [02-features, 03-dashboard]

tech-stack:
  added: [jose, bcrypt]
  patterns: [httpOnly JWT cookies, middleware auth check]

key-files:
  created: [src/app/api/auth/login/route.ts, src/middleware.ts]
  modified: [src/lib/auth.ts]

key-decisions:
  - "Used jose instead of jsonwebtoken (ESM-native, Edge-compatible)"
  - "15-min access tokens with 7-day refresh tokens"

duration: 12min
completed: 2025-01-15
---

# Phase 01 Plan 02: Auth Login Summary

**JWT auth with refresh rotation using jose library and httpOnly cookies**

## Performance

- **Duration:** 12 min
- **Started:** 2025-01-15T14:22:10Z
- **Completed:** 2025-01-15T14:34:33Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Login endpoint accepting email/password credentials
- JWT token generation with 15-minute expiry
- httpOnly cookie storage for security
- Protected route middleware checking token validity

## Task Commits

Each task was committed atomically:

1. **Task 1: Create login endpoint** - `abc123f` (feat)
2. **Task 2: Add protected middleware** - `def456g` (feat)

**Plan metadata:** `hij789k` (docs: complete 01-02 plan)

## Files Created/Modified
- `src/app/api/auth/login/route.ts` - Login endpoint
- `src/middleware.ts` - Protected route checks
- `src/lib/auth.ts` - JWT helpers using jose
- `package.json` - Added jose dependency

## Decisions Made
- Used jose instead of jsonwebtoken (ESM-native, Edge-compatible)
- 15-min access tokens for security with refresh capability

## Deviations from Plan
None - plan executed exactly as written

## Next Phase Readiness
- Auth foundation complete
- Ready for logout endpoint in next plan
```

## Post-Creation Steps

After SUMMARY.md is created:

1. **Update STATE.md** - Current position, progress bar, session continuity
2. **Commit metadata** - Stage SUMMARY.md and STATE.md, commit with docs prefix
3. **Report completion** - Include SUMMARY path and all commit hashes
