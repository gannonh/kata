# Requirements: v1.5.0 Phase Management

## Phase Organization

- [x] **PHASE-01**: Phase directories are organized under `pending/`, `active/`, `completed/` subdirectories
- [x] **PHASE-05**: Phase completion validates PLAN.md and SUMMARY.md exist; non-gap phases require VERIFICATION.md

## Phase Movement

- [x] **PHASE-02**: User can move a phase to a different milestone via `/kata:kata-move-phase`
- [x] **PHASE-03**: User can reorder phases within a milestone with automatic renumbering
- [x] **PHASE-04**: Each milestone starts phase numbering at 1 (not cumulative across milestones)

## Roadmap

- [ ] **ROAD-01**: ROADMAP.md displays future planned milestones (not just current)
- [ ] **ROAD-02**: Phase and milestone hierarchy is visually clear with consistent formatting and scannable progress indicators

## Future Requirements

None deferred — all phase management features included in this milestone.

## Out of Scope

- Phase dependencies (blocking relationships between phases) — later milestone
- Phase templates (reusable phase patterns) — later milestone
- Cross-project phase sharing — not building

## Traceability

| Requirement | Phase | Plan(s) | Status |
| ----------- | ----- | ------- | ------ |
| PHASE-01    | 1     | 01, 02  | Complete |
| PHASE-05    | 1     | 01, 02  | Complete |
| PHASE-02    | 2     | 01, 02  | Complete |
| PHASE-03    | 2     | 02      | Complete |
| PHASE-04    | 2     | 01      | Complete |
| ROAD-01     | 3     | —       | —      |
| ROAD-02     | 3     | —       | —      |

---
*Created: 2026-02-03 for milestone v1.5.0*
