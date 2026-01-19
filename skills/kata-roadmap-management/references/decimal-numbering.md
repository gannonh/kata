# Decimal Phase Numbering

Convention for urgent phase insertions between existing integer phases.

## Overview

Decimal phases allow inserting urgent work without renumbering the entire roadmap.

**Integer phases (1, 2, 3):** Planned milestone work, created via `/kata:add-phase` or during roadmap creation.

**Decimal phases (2.1, 2.2):** Urgent insertions, created via `/kata:insert-phase`, execute between integers.

## When to Use Decimal Phases

Use decimal phases when:
- Urgent work discovered mid-milestone
- Work must complete BEFORE next integer phase
- Can't wait until end of milestone
- Don't want to renumber existing phases

Do NOT use decimal phases for:
- Planned work at end of milestone → use integer
- Work that can wait → add to existing phase or add integer
- Normal roadmap planning → use integer

## Numbering Convention

### Format

```
{two-digit-integer}.{decimal}
```

Examples:
- `02.1` (not `2.1`)
- `07.2` (not `7.2`)
- `12.3` (not `12.3` is already correct)

### Calculation

```bash
# Given target phase N and existing decimals
if no existing decimals after N:
  next = N.1
elif highest decimal is N.1:
  next = N.2
elif highest decimal is N.2:
  next = N.3
...
```

Example sequence:
```
Phase 2 exists
Insert first → 2.1
Insert second → 2.2
Insert third → 2.3
```

## Execution Order

Decimal phases execute immediately after their parent integer:

```
1 → 1.1 → 1.2 → 2 → 2.1 → 2.2 → 2.3 → 3 → 3.1 → 4
```

Real example:
```
Phase 2: Authentication
Phase 2.1: Fix JWT refresh bug (INSERTED)
Phase 2.2: Hotfix login redirect (INSERTED)
Phase 3: Dashboard
Phase 3.1: Performance optimization (INSERTED)
Phase 4: Polish
```

## Directory Naming

### Standard Format

```
.planning/phases/{NN.M}-{slug}/
```

Examples:
```
.planning/phases/
├── 02-authentication/
├── 02.1-fix-jwt-bug/
├── 02.2-hotfix-login/
├── 03-dashboard/
└── 03.1-performance-fix/
```

### Sorting Behavior

Directories sort correctly with version sort (`sort -V`):
```bash
ls -d .planning/phases/*/ | sort -V
```

Output:
```
02-authentication/
02.1-fix-jwt-bug/
02.2-hotfix-login/
03-dashboard/
```

## INSERTED Marker

All decimal phases include `(INSERTED)` in their roadmap heading:

```markdown
### Phase 2.1: Fix JWT Refresh Bug (INSERTED)

**Goal:** [Urgent work - to be planned]
**Depends on:** Phase 2
...
```

### Purpose of Marker

1. **Visual indicator** - Quickly identify urgent insertions
2. **Audit trail** - Know which phases were planned vs inserted
3. **Context** - Helps Claude understand urgency of work

### Removing Marker

Do NOT remove `(INSERTED)` marker:
- It serves as permanent record
- Helps future sessions understand roadmap history
- Removed phases use git history for audit trail

## Plan Files in Decimal Phases

### Naming Pattern

```
{NN.M}-{PP}-PLAN.md
```

Examples:
```
02.1-01-PLAN.md
02.1-02-PLAN.md
02.2-01-PLAN.md
```

### Frontmatter

```yaml
---
phase: 02.1-fix-jwt-bug
plan: 01
wave: 1
depends_on: []
...
---
```

## Dependency Handling

### Default Dependency

Decimal phases depend on their parent integer:
- Phase 2.1 depends on Phase 2
- Phase 2.2 depends on Phase 2.1 (sequential decimals)
- Phase 3 depends on Phase 2.x (last decimal before it)

### Cross-Phase Dependencies

Decimal phases can have dependencies on:
- Their parent integer phase
- Earlier decimal phases under same parent
- Phases from earlier integers (if needed)

Example:
```yaml
# Phase 2.2 depends on both 2.1 and 2
depends_on: ["02.1"]  # Implicitly also depends on 02
```

## Renumbering Decimals

### When Parent Integer Removed

If Phase 2 is removed:
- Phase 2.1 → Phase 1.1
- Phase 2.2 → Phase 1.2
- Phase 3 → Phase 2
- Phase 3.1 → Phase 2.1

### When Decimal Removed

If Phase 2.2 is removed:
- Phase 2.3 → Phase 2.2
- Phase 2.4 → Phase 2.3
- Integer phases unchanged

## Edge Cases

### Multiple Insertions Same Day

If multiple urgent items need insertion after Phase 2:
```
Phase 2: Authentication
Phase 2.1: Fix JWT refresh
Phase 2.2: Hotfix login redirect
Phase 2.3: Security patch
Phase 3: Dashboard
```

Order by dependency, not discovery order.

### Nested Urgency

If urgent work appears during a decimal phase:
- Complete current decimal phase first
- Insert new decimal: 2.1 work discovers issue → insert 2.2
- Don't create 2.1.1 (no nested decimals)

### Deep Decimal Sequences

Avoid more than 3-4 decimals under one integer:
- 2.1, 2.2, 2.3 → acceptable
- 2.1, 2.2, 2.3, 2.4, 2.5 → consider if some should be separate integer

If too many insertions, consider:
- Combining related items into single decimal
- Creating new integer phase for grouped work
- Reviewing scope of parent integer phase

## Anti-Patterns

### Don't Use Decimals for Planned Work

```markdown
# BAD: Using decimal for planned work
### Phase 3.1: Authentication Tests
(This should be part of Phase 3 or new integer)

# GOOD: Decimal for urgent insertion
### Phase 3.1: Fix Critical Auth Bug (INSERTED)
```

### Don't Skip Decimal Numbers

```markdown
# BAD: Skipping 2.2
Phase 2.1: Fix A
Phase 2.3: Fix B

# GOOD: Sequential
Phase 2.1: Fix A
Phase 2.2: Fix B
```

### Don't Create Decimal Before Integer 1

```markdown
# BAD: Phase 0.1 makes no sense
Phase 0.1: Pre-setup

# GOOD: Just use Phase 1
Phase 1: Setup
```

## STATE.md Updates

When inserting decimal phase, add to "Roadmap Evolution":

```markdown
### Roadmap Evolution

- Phase 2.1 inserted after Phase 2: Fix JWT refresh bug (URGENT)
- Phase 3.1 inserted after Phase 3: Performance optimization (URGENT)
```
