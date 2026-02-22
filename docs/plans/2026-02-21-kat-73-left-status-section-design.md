# KAT-73 Design: Left Status Section Baseline Parity

Date: 2026-02-21
Issue: KAT-73

## Goal
Implement baseline-parity fidelity for the persistent top status section in the left panel, above `Agents`, `Context`, `Changes`, and `Files`.

## Scope
- In scope:
  - Always-visible top status section in the left panel.
  - Session title + repository subtitle hierarchy.
  - Dynamic segmented progress indicator derived from task state.
  - Status copy line beneath the indicator.
  - Compact overflow affordance visual parity.
  - Placement and spacing cadence above all left-panel tab content.
- Out of scope:
  - Backend/runtime status pipeline changes.
  - New workflow behavior beyond current UI representation.
  - Left-panel tab/navigation model changes.

## Key Decisions
- Build one reusable `LeftStatusSection` component that renders two visual states from data:
  - `simple`: project just started, zero completed tasks.
  - `progress`: work underway with completed and/or active tasks.
- Segment counts are dynamic based on task volume; no fixed 5-slot bar.
- Use row-cap behavior for large task sets:
  - Maximum `25` task segments per live row.
  - Completed full rows collapse into compact summary chips labeled `N done`.
  - Active/current row renders per-task segments.
- Status copy is derived from task state:
  - `Tasks ready to go.` for start state.
  - `Making progress.` while work is underway.
  - `All tasks complete.` when all tasks are done.
- Overflow control is baseline-parity visual treatment only in this ticket.

## Component Architecture
- Add `LeftStatusSection` at top of `LeftPanel`, always visible when left content is expanded.
- Component composition:
  - `StatusTitleBlock` (session title + repo subtitle)
  - `TaskProgressSegments` (dynamic rows + row-rollup chips)
  - `StatusMessageLine` (derived status copy)
  - `OverflowAction` (compact action affordance)
- Keep tab content rendering and collapse/expand behavior unchanged below this section.

## Data Flow
- Source progress from existing `ProjectSpec.tasks` (`todo`, `in_progress`, `done`, `blocked`) in renderer mock/UI state.
- Add UI-only display metadata for status title/subtitle (session + repo) without backend contract changes.
- Segment mapping (v1):
  - `done` -> complete segment tone
  - `in_progress` -> active segment tone
  - `todo` -> muted segment tone
  - `blocked` -> warning/danger segment tone

## Interaction and Edge Handling
- Section is non-collapsible and remains visible while switching left tabs.
- Edge cases:
  - `0` tasks: simple rail + `Tasks ready to go.`
  - `1..25` tasks: one live row, no rollup chip
  - `>25` tasks: completed full rows become `N done` chips, next row starts automatically
  - Missing title/subtitle: use fallback strings to preserve layout stability
  - Unknown task status: coerce to muted segment style

## Testing Strategy

### Unit tests
- Add/update renderer tests to verify:
  - Top status section exists above tab content.
  - Simple vs progress rendering from task state.
  - Dynamic segment logic and `25`-per-row cap.
  - Rollup chip behavior (`N done`) for completed full rows.
  - Message copy transitions for start/progress/complete.

### E2E tests (mandatory for KAT-73)
- Extend left-panel E2E coverage to assert:
  - Status section remains visible while switching `Agents/Context/Changes/Files`.
  - Simple state appears for start/no-complete-task scenario.
  - Progress state appears when tasks are in progress/completed, including >25 segmentation behavior.

## Acceptance Criteria
- Left top status section is always visible above left-panel tab content.
- Visual hierarchy matches baseline parity expectations in both simple and progress states.
- Segmented indicator scales to task count with row-cap + `N done` rollup behavior.
- Existing left-panel navigation behavior remains stable.
- Unit and E2E checks covering this section pass.
