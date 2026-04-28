# Roadmap Artifact Template

Use this as the content shape for milestone-scoped `roadmap` artifacts.

```markdown
# Roadmap: [Milestone Name]

## Overview

[One paragraph describing the path from current state to milestone completion.]

## Slices / Phases

### Phase 1: [Name]

**Goal:** [What this phase delivers]
**Depends on:** [Nothing / prior phase / external dependency]
**Requirements:** [REQ-01, REQ-02]

**Success Criteria:**

1. [Observable behavior]
2. [Observable behavior]

**Planned Slices:**

- [ ] S001: [Slice title]

## Traceability

| Requirement | Phase/Slice | Status |
|---|---|---|
| REQ-01 | Phase 1 / S001 | Pending |

## Progress

| Phase | Status | Requirements | Slices |
|---|---|---|---|
| 1 | Pending | REQ-01 | S001 |
```

## Guidance

- Derive phases from requirements; do not impose arbitrary structure.
- Every active requirement should map to exactly one primary phase/slice.
- Success criteria must be observable from the user or system boundary.

