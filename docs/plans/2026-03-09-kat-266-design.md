# Agent/Sub-Agent State Indicators in Center Panel

**Issue:** KAT-266
**Date:** 2026-03-09
**Design reference:** `pencil/agent-states.pen` (D3: Grouped Inline)

## Overview

Implement the D3 "Grouped Inline" design for agent and sub-agent state visualization in the center panel's session list. Orchestrator parents display sub-agent counts with collapse/expand. Sub-agents render as compact chips with colored status dots.

## Approach

Augment `SessionItem` with chip rendering for children and collapse state on parents. Reuse the existing tree projection from `session-tree.ts` unchanged. Collapse filtering happens at the render level in `SessionList`.

## Parent Orchestrator Row Changes

When `sessionKind === 'orchestrator'` and the session has children:

- **State icon:** No change. Existing todo-state icons already match the D3 design (checkmark circle, empty circle, orange ring, X circle).
- **Subtitle:** Replace timestamp-only with `{n} sub-agents · {time}`.
- **Collapse badge:** Count + chevron at right end of row (`3 ▾` collapsed, `3 ▴` expanded). Click toggles child visibility.

`SessionList` computes a `childCountByParent: Map<string, number>` from the items list and passes it to each `SessionItem`.

## Sub-Agent Chip Rendering

Replace the current child row rendering (arrow icon + mini row) with chips:

- **Layout:** Colored status dot + agent name, pill shape on `#27272A` background.
- **Status dot colors** from `subagentStatus`:
  - `completed` → green `#22c55e`
  - `running` → blue `#3b82f6`
  - `queued` → gray `#71717a`
  - `failed` → orange `#f97316`
- **Container:** Vertical stack beneath parent, indented ~36px to align with parent title. Subtle left border.
- **Interaction:** Click selects the session (navigates to transcript). No todo-state popover, no dropdown menu, no context menu.
- **Separators:** Suppressed between chip children.

## Collapse/Expand State

- `SessionList` holds `useState<Set<string>>` of expanded parent IDs.
- Default: all parents start expanded.
- Children of collapsed parents are filtered from the render list.
- `session-tree.ts` projection is untouched.

Edge cases:
- 0 children: no badge, no collapse affordance, normal row.
- New sub-agent while collapsed: count updates, chips stay hidden.
- All children deleted: badge disappears, parent reverts to normal row.

## Implementation Boundaries

**Files to modify:**
- `apps/electron/src/renderer/components/app-shell/SessionList.tsx`

**Out of scope:**
- No changes to `session-tree.ts`, `sessions.ts` atoms, `todo-states.tsx`, or core types.
- No new component files (chip rendering lives in `SessionItem`'s `isNestedChild` branch).
- No new Jotai atoms (local component state for collapse).
- No collapse/expand animation.

**Testing:**
- Add cases to existing `SessionList.test.tsx`: chip rendering for subagent kind, collapse/expand toggle, child count on orchestrator parents.
