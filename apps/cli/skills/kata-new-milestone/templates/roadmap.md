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

- [ ] Planned Slice 1: [Slice title]

## Traceability

| Requirement | Phase/Planned Slice | Status |
|---|---|---|
| REQ-01 | Phase 1 / Planned Slice 1 | Pending |

## Progress

| Phase | Status | Requirements | Planned Slices |
|---|---|---|---|
| 1 | Pending | REQ-01 | Planned Slice 1 |
```

## Guidance

- Derive phases from requirements; do not impose arbitrary structure.
- Every active requirement should map to exactly one primary phase/slice.
- Do not preassign backend slice IDs such as `S001` in milestone roadmaps. Backend slice IDs are global and are only known after `slice.create` returns them.
- Success criteria must be observable from the user or system boundary.
