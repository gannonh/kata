# Roadmap Creation Reference

Detailed guidance on creating ROADMAP.md with phase breakdown and success criteria.

## Roadmap Purpose

ROADMAP.md serves as the execution plan that:
- Maps every v1 requirement to exactly one phase
- Provides observable success criteria per phase
- Establishes dependency ordering
- Enables progress tracking

## Template Structure

```markdown
# Roadmap: [Project Name]

## Overview

[One paragraph describing the journey from start to finish]

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: [Name]** - [One-line description]
- [ ] **Phase 2: [Name]** - [One-line description]
- [ ] **Phase 3: [Name]** - [One-line description]

## Phase Details

### Phase 1: [Name]
**Goal**: [What this phase delivers]
**Depends on**: Nothing (first phase)
**Requirements**: [REQ-01, REQ-02, REQ-03]
**Success Criteria** (what must be TRUE):
  1. [Observable behavior from user perspective]
  2. [Observable behavior from user perspective]
  3. [Observable behavior from user perspective]
**Plans**: [Number of plans or TBD]

### Phase 2: [Name]
**Goal**: [What this phase delivers]
**Depends on**: Phase 1
**Requirements**: [REQ-04, REQ-05]
**Success Criteria** (what must be TRUE):
  1. [Observable behavior from user perspective]
  2. [Observable behavior from user perspective]
**Plans**: [Number of plans]

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. [Name] | 0/3 | Not started | - |
| 2. [Name] | 0/2 | Not started | - |
```

## Phase Identification

### Step 1: Group by Category

Requirements already have categories (AUTH, CONTENT, SOCIAL, etc.). Start by examining these natural groupings.

### Step 2: Identify Dependencies

Which categories depend on others?
- SOCIAL needs CONTENT (can't share what doesn't exist)
- CONTENT needs AUTH (can't own content without users)
- Everything needs SETUP (foundation)

### Step 3: Create Delivery Boundaries

Each phase delivers a coherent, verifiable capability.

**Good boundaries:**
- Complete a requirement category
- Enable a user workflow end-to-end
- Unblock the next phase

**Bad boundaries:**
- Arbitrary technical layers (all models, then all APIs)
- Partial features (half of auth)
- Artificial splits to hit a number

### Step 4: Assign Requirements

Map every v1 requirement to exactly one phase. Track coverage as you go.

## Goal-Backward Success Criteria

For each phase, derive observable truths from the phase goal.

### Derivation Process

1. **State the Phase Goal**
   - Good: "Users can securely access their accounts" (outcome)
   - Bad: "Build authentication" (task)

2. **Derive Observable Truths (2-5 per phase)**
   List what users can observe/do when the phase completes.

   For "Users can securely access their accounts":
   - User can create account with email/password
   - User can log in and stay logged in across sessions
   - User can log out from any page
   - User can reset forgotten password

3. **Cross-Check Against Requirements**
   - Each criterion should have supporting requirement(s)
   - Each requirement should contribute to criterion

4. **Resolve Gaps**
   - Criterion with no requirement? Add requirement or mark out of scope
   - Requirement with no criterion? Question if it belongs in this phase

### Example Gap Resolution

```
Phase 2: Authentication
Goal: Users can securely access their accounts

Success Criteria:
1. User can create account ← AUTH-01 ✓
2. User can log in ← AUTH-02 ✓
3. User can log out ← AUTH-03 ✓
4. User can reset password ← ??? GAP

Requirements: AUTH-01, AUTH-02, AUTH-03

Gap: Criterion 4 has no requirement.

Options:
1. Add AUTH-04: "User can reset password via email link"
2. Remove criterion 4 (defer to v2)
```

## Depth Calibration

Read depth from config.json. Depth controls compression tolerance.

| Depth | Typical Phases | What It Means |
|-------|----------------|---------------|
| Quick | 3-5 | Combine aggressively, critical path only |
| Standard | 5-8 | Balanced grouping |
| Comprehensive | 8-12 | Let natural boundaries stand |

**Key:** Derive phases from work, then apply depth as compression guidance. Don't pad small projects or compress complex ones.

## Coverage Validation

### 100% Requirement Coverage

After phase identification, verify every v1 requirement is mapped.

**Build coverage map:**

```
AUTH-01 → Phase 2
AUTH-02 → Phase 2
AUTH-03 → Phase 2
PROF-01 → Phase 3
PROF-02 → Phase 3
...

Mapped: 12/12 ✓
```

**If orphaned requirements found:**

```
Orphaned requirements (no phase):
- NOTF-01: User receives in-app notifications
- NOTF-02: User receives email for followers

Options:
1. Create Phase 6: Notifications
2. Add to existing Phase 5
3. Defer to v2 (update REQUIREMENTS.md)
```

**Do not proceed until coverage = 100%.**

### Traceability Update

After roadmap creation, REQUIREMENTS.md gets updated with phase mappings:

```markdown
## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 2 | Pending |
| AUTH-02 | Phase 2 | Pending |
| PROF-01 | Phase 3 | Pending |
```

## STATE.md Initialization

Create STATE.md alongside ROADMAP.md:

```markdown
# Project State

## Project Reference

See: .planning/PROJECT.md (updated [date])

**Core value:** [One-liner from Core Value section]
**Current focus:** [Phase 1 name]

## Current Position

Milestone: v1.0 [Milestone name]
Phase: 1 of [N]
Plan: Not started
Status: Ready for planning
Last activity: [date] - Project initialized

Progress: [========............] [X]%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: -

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: [date]
Stopped at: Project initialized
Resume file: None
```

## Good Phase Patterns

### Foundation → Features → Enhancement

```
Phase 1: Setup (project scaffolding, CI/CD)
Phase 2: Auth (user accounts)
Phase 3: Core Content (main features)
Phase 4: Social (sharing, following)
Phase 5: Polish (performance, edge cases)
```

### Vertical Slices (Independent Features)

```
Phase 1: Setup
Phase 2: User Profiles (complete feature)
Phase 3: Content Creation (complete feature)
Phase 4: Discovery (complete feature)
```

### Anti-Pattern: Horizontal Layers

```
Phase 1: All database models ← Too coupled
Phase 2: All API endpoints ← Can't verify independently
Phase 3: All UI components ← Nothing works until end
```

## Milestone Organization

After first milestone ships, reorganize with milestone groupings:

```markdown
## Milestones

- ✅ **v1.0 MVP** - Phases 1-4 (shipped YYYY-MM-DD)
- 🚧 **v1.1 [Name]** - Phases 5-6 (in progress)
- 📋 **v2.0 [Name]** - Phases 7-10 (planned)
```

Completed milestones collapse in `<details>` tags for readability.

## Status Values

| Status | Meaning |
|--------|---------|
| Not started | Haven't begun |
| In progress | Currently working |
| Complete | Done (add completion date) |
| Deferred | Pushed to later (with reason) |

## What Not to Do

**Don't impose arbitrary structure:**
- Bad: "All projects need 5-7 phases"
- Good: Derive phases from requirements

**Don't use horizontal layers:**
- Bad: Phase 1: Models, Phase 2: APIs, Phase 3: UI
- Good: Phase 1: Complete Auth, Phase 2: Complete Content

**Don't skip coverage validation:**
- Bad: "Looks like we covered everything"
- Good: Explicit mapping of every requirement

**Don't write vague success criteria:**
- Bad: "Authentication works"
- Good: "User can log in and stay logged in across sessions"

**Don't add project management artifacts:**
- Bad: Time estimates, Gantt charts, resource allocation
- Good: Phases, goals, requirements, success criteria

**Don't duplicate requirements across phases:**
- Bad: AUTH-01 in Phase 2 AND Phase 3
- Good: AUTH-01 in Phase 2 only
