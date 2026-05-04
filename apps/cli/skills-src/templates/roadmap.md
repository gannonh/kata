# Roadmap Artifact Template

Use this as the content shape for milestone-scoped `roadmap` artifacts.

```markdown
# Roadmap: [Milestone Name]

## Overview

[One paragraph describing the path from current state to milestone completion.]

## Slices / Phases

### Phase 1: [Name]

**Goal:** [What this phase delivers]
**Backend Slice:** [None until created / S001]
**Depends on:** [None / S001, S002 after backend slice IDs exist / named dependency before IDs exist]
**Requirements:** [REQ-01, REQ-02]

**Success Criteria:**

1. [Observable behavior]
2. [Observable behavior]

**Planned Slices:**

| Planned Slice | Backend Slice ID | Blocked By | Requirements |
|---|---|---|---|
| Planned Slice 1: [Slice title] | None | None | REQ-01 |

## Traceability

| Requirement | Phase/Planned Slice | Backend Slice ID | Blocked By | Status |
|---|---|---|---|---|
| REQ-01 | Phase 1 / Planned Slice 1 | None | None | Pending |

## Progress

| Phase | Status | Requirements | Planned Slices |
|---|---|---|---|
| 1 | Pending | REQ-01 | Planned Slice 1 |
```

## Guidance

- Derive phases from requirements; do not impose arbitrary structure.
- Every active requirement should map to exactly one primary phase/slice.
- Do not preassign backend slice IDs such as `S001` in milestone roadmaps. Backend slice IDs are global and are only known after `slice.create` returns them. Once a backend slice ID exists, record it using an explicit keyworded format such as `Backend Slice: S001`, `Slice ID: S001`, or a table column named `Backend Slice ID`; avoid bare forms like `S001:`.
- Record dependency metadata in a machine-readable form. Preferred table columns are `Backend Slice ID` and `Blocked By`; use `None` or an empty cell when there are no dependencies.
- Inline dependency form is also valid: `Backend Slice: S003; Depends on: S001, S002`.
- Use canonical backend slice IDs such as `S001` in dependency fields only after those slices exist. Before backend IDs exist, keep named roadmap dependencies descriptive and resolve them during `kata-plan-phase`.
- Success criteria must be observable from the user or system boundary.
