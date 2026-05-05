# Roadmap Artifact Template

Use this as the content shape for milestone-scoped `roadmap` artifacts.

```markdown
# Roadmap: [Milestone Name]

## Overview

[One paragraph describing the path from current state to milestone completion.]

## Slice Map

Use this table as the quick lookup between roadmap-local slice labels and backend slice IDs. Keep roadmap labels stable for planning and fill in backend IDs after `slice.create` returns canonical IDs.

| Roadmap Slice | Backend Slice ID | Title | Status |
|---|---|---|---|
| Planned Slice 1 | None | [Slice title] | Pending |

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

## Dependency Graph

| Slice | Backend Slice ID | Depends On | Blocks | Requirements |
|---|---|---|---|---|
| Planned Slice 1: [Slice title] | None | None | Planned Slice 2 | REQ-01 |

## Implementation Waves

Waves show sequencing and parallelization opportunities. Execute waves in order by default; slices within the same wave can be planned or executed in parallel when their dependencies are satisfied. Slices can be selected out of wave order when there is no dependency collision.

| Wave | Parallel Slices | Ready When | Notes |
|---|---|---|---|
| Wave 1 | Planned Slice 1 | No blockers | Can start first |
| Wave 2 | Planned Slice 2, Planned Slice 3 | Planned Slice 1 complete | Planned Slice 2 and Planned Slice 3 can run in parallel |

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
- Maintain `## Slice Map` as the human-facing alias table. Roadmap labels such as `Planned Slice 1` stay stable; backend IDs such as `S009` are added after backend slices exist.
- Inline dependency form is also valid: `Backend Slice: S003; Depends on: S001, S002`.
- Use canonical backend slice IDs such as `S001` in dependency fields only after those slices exist. Before backend IDs exist, keep named roadmap dependencies descriptive and resolve them during `kata-plan-phase`.
- In implementation waves and readiness notes, show both IDs when a backend slice exists, such as `S009 / Planned Slice 1`, so operators can connect sequencing guidance to backend work.
- Derive the dependency graph from the planned slice table and traceability table. `Depends On` is the direct blocker set. `Blocks` is the inverse set.
- Derive implementation waves from the dependency graph using topological layering: Wave 1 contains slices with no blockers; each later wave contains slices whose blockers are in prior waves. Put independent slices in the same wave.
- Waves are planning guidance. Waves normally run in sequence, while slices in the same wave can run in parallel. A later slice can be selected out of wave order when its blockers are satisfied and there is no dependency collision.
- Success criteria must be observable from the user or system boundary.
