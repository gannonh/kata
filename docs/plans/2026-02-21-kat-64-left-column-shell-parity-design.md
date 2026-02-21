# KAT-64 Design: Left Column Shell Parity

Date: 2026-02-21
Issue: KAT-64

## Goal
Bring the left column shell closer to design parity using a hybrid of existing SHADCN primitives and mock visual hierarchy.

Principle: keep SHADCN building blocks and current one-tab-at-a-time behavior, but increase visual density and hierarchy parity.

## Scope
- In scope:
  - Left rail behavior remains unchanged (icon rail, one active section at a time).
  - Shared section header treatment across `Agents`, `Context`, `Changes`, `Files`.
  - Deep redesign of `Agents` rows/cards.
  - New expandable background-agent group in `Agents`.
  - Baseline parity pass on `Context`, `Changes`, and `Files`.
- Out of scope:
  - Top chip/tab bar migration.
  - New-tab dropdown behavior.
  - Conversation panel changes.
  - Backend/state pipeline changes beyond mock/UI shape updates needed for rendering.

## References
- `app/_plans/design/mocks/03-coordinator-new-tab-dropdown.png`
- `app/_plans/design/mocks/20-wave1-architecture-decisions.png`
- Linear KAT-64 attached variants:
  - simple state
  - agents-only state
  - full state

## Information Architecture
The left panel keeps the existing navigation model (vertical icon rail + single content view), but each tab view adopts a unified section rhythm:
- Section label-style header (not page-title style)
- Subtitle/body guidance line
- Optional right-aligned plus action button
- Compact content blocks with reduced vertical spacing

This creates consistent cross-tab hierarchy while preserving the current app-shell interaction model.

## Component Design

### 1. Shared section headers (all 4 tabs)
- Convert major headings from prominent page-heading styling to section-label styling:
  - `text-sm`, medium weight, uppercase, wider tracking, muted foreground.
- Add a muted subtitle line under the header label.
- Add a right-aligned `+` ghost icon button in the header row.

### 2. Agents tab (deep implementation)
- Replace heavy card treatment with compact row-first layout.
- Coordinator row:
  - Small status dot.
  - Agent name (`text-sm font-medium`).
  - Right-aligned muted timestamp.
  - Secondary line with truncated current task (`text-xs text-muted-foreground`).
- Remove model and token usage from this view.

### 3. Background running group (new)
- Add collapsible summary row when delegated/background agents exist:
  - Small status-indicator squares (one per sub-agent).
  - Label: `N / M background agents running`.
  - Chevron expand/collapse control.
- Expanded state shows indented sub-agent rows using same compact row pattern.
- Each sub-agent row includes delegated attribution line (`Delegated by ...`) in muted `text-xs`.

### 4. Context tab (baseline)
- Apply shared header + subtitle:
  - `Context about the task, shared with all agents on demand.`
- Keep existing checkbox task list.
- Remove `Open project spec` button from this view.

### 5. Changes tab (baseline)
- Apply shared header + subtitle:
  - `View and accept file changes.`
- Keep staged/unstaged card grouping pattern and existing commit action.
- Tighten spacing to align with compact shell rhythm.

### 6. Files tab (baseline)
- Apply shared header + subtitle including repo-path context.
- Keep current search input and file tree interactions.

## Data Shape Changes (UI-level)
Extend `AgentSummary` for left-panel rendering needs:
- `delegatedBy?: string`
- `children?: AgentSummary[]`

Update mock agent data to represent:
- top-level coordinator
- delegated background agents under a parent/group structure

No IPC or backend data-contract changes are required in this ticket.

## Interaction and State
- Preserve existing left-panel tab behavior and collapse behavior.
- Add local expand/collapse state for background group in the `Agents` tab.
- No cross-panel state coupling is introduced.

## Error Handling and Edge Cases
- If no `children` exist, hide background-group summary row.
- If timestamps/metadata are missing, render layout without placeholder noise.
- If a delegated row has no attribution, omit delegated line cleanly.

## Testing Strategy

### Unit tests
- Update `LeftPanel` tests for revised copy/heading treatment where needed.
- Add/adjust `AgentsTab` and/or `AgentCard` tests to verify:
  - compact row rendering
  - removed model/token fields
  - background group summary text and indicator rendering
  - expand/collapse behavior
  - delegated attribution rendering
- Update `ContextTab` test coverage for subtitle and removed spec button.
- Keep `ChangesTab` and `FilesTab` behavior tests, updating expectations for new header structure.

### E2E smoke
- Existing left-tab switching test remains valid (single section visible at a time).
- Validate `Agents`, `Context`, `Changes`, `Files` still render expected anchor content after styling changes.

## Acceptance Criteria
- Left column hierarchy and spacing read consistently across all four sections.
- Agents section includes compact coordinator row + expandable background-group behavior.
- Context/Changes/Files receive baseline visual parity treatment without feature regression.
- Navigation model remains left icon rail and one-section-at-a-time.
