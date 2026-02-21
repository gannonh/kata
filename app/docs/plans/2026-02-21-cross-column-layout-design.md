# Cross-Column Layout, Sizing, and Scroll Behavior Parity

**Issue:** KAT-69
**Date:** 2026-02-21

## Objective

Lock the three-column shell proportions and behavior to match the target design language.

## Design Decisions

### Grid Template and Proportions

Left column has a static default width (320px), adjustable via the left resizer. Center and right columns split the remaining space equally by default.

The grid template becomes fully pixel-computed:

```
${leftPx}px ${RESIZER}px ${centerPx}px ${RESIZER}px ${rightPx}px
```

Center and right widths are derived from available space:

```typescript
const remaining = availableWidth - effectiveLeftWidth - RESIZER_WIDTH * 2
const half = remaining / 2
const centerWidth = half - rightOffset
const rightWidth = half + rightOffset
```

`rightOffset` starts at 0 (equal split). Dragging the right resizer changes the offset. Double-clicking the right resizer resets the offset to 0.

Constants:
- `LEFT_DEFAULT = 320` (unchanged)
- `LEFT_MIN = 260` (unchanged)
- `LEFT_COLLAPSED = 56` (unchanged)
- `CENTER_MIN = 300` (reduced from 420)
- `RIGHT_MIN = 300` (unchanged)
- `RESIZER_WIDTH = 10` (unchanged)

### Scroll Containment

Each column scrolls independently with headers pinned at top.

Replace fragile `calc()` heights with flexbox fill:

```
<panel className="flex h-full flex-col">
  <header className="shrink-0">
  <div className="min-h-0 flex-1 overflow-hidden">
    <ScrollArea className="h-full">
```

Applied to all three panels. The center panel already uses this pattern. Left and right panels switch from `h-[calc(...)]` on ScrollArea to `flex-1 min-h-0` on the scroll wrapper.

### Edge Spacing

Standardize horizontal padding across all panels:
- Headers: `px-4` (16px, already consistent)
- Scroll content: `px-4 pb-4`
- Remove the `pr-2` outlier on the right panel ScrollArea

### Panel Borders and Resizers

No changes. The full-width header rule (`absolute inset-x-0 top-14 h-px bg-border`) and resizer visual treatment (10px hit target, 1px visual line) already match the mocks.

## Files to Modify

| File | Change |
|------|--------|
| `AppShell.tsx` | Grid template computation, right resizer offset state, double-click reset |
| `LeftPanel.tsx` | ScrollArea wrapper: calc() to flex-1 min-h-0 |
| `RightPanel.tsx` | ScrollArea wrapper: calc() to flex-1 min-h-0, remove pr-2 |
| `PanelResizer.tsx` | Add double-click handler (onDoubleClick prop) |
| Existing tests | Update resize assertions for new proportional behavior |

## Acceptance Criteria

Three-column shell feels proportionally and behaviorally aligned to the target design language:
- Center and right panels share remaining space equally by default
- Right resizer adjusts the split; double-click resets to 50/50
- Each column scrolls independently with pinned headers
- Consistent 16px horizontal padding across all panel content
