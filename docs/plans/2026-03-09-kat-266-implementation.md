# Agent/Sub-Agent State Indicators Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the D3 "Grouped Inline" design for agent and sub-agent state visualization in the center panel's session list.

**Architecture:** Modify `SessionItem` to render sub-agents as compact chips with colored status dots. Add collapse/expand state to `SessionList` for orchestrator parents. No new files, no data layer changes.

**Tech Stack:** React, Tailwind CSS, lucide-react (ChevronDown/ChevronUp), Bun test runner

---

### Task 1: Add lucide-react imports and subagent status color map

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/SessionList.tsx:4` (imports)

**Step 1: Add ChevronDown and ChevronUp to the lucide-react import**

In SessionList.tsx line 4, add `ChevronDown, ChevronUp` to the existing lucide-react import:

```typescript
import { MoreHorizontal, Flag, Search, X, Copy, Link2Off, CloudUpload, Globe, RefreshCw, Inbox, Hash, MessageCircle, Radio, CornerDownRight, ChevronDown, ChevronUp } from "lucide-react"
```

**Step 2: Add the subagent status color map constant**

After the `INDENT_STEP_PX` constant (line 60), add:

```typescript
/** Sub-agent status → dot color mapping for chip rendering */
const SUBAGENT_STATUS_COLORS: Record<string, string> = {
  completed: '#22c55e',
  running: '#3b82f6',
  queued: '#71717a',
  failed: '#f97316',
}
```

**Step 3: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/SessionList.tsx
git commit -m "feat(session-list): add subagent status color map and chevron imports"
```

---

### Task 2: Add collapse/expand state and child count computation to SessionList

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/SessionList.tsx` (SessionList component, around line 759)

**Step 1: Add expanded state and child count map**

Inside the `SessionList` function, after the existing `useState` declarations (around line 791-794), add:

```typescript
// Collapse/expand state for orchestrator parents — tracks which are expanded
// Default: all parents start expanded
const [expandedParents, setExpandedParents] = useState<Set<string>>(() => {
  const parentIds = new Set<string>()
  for (const item of items) {
    if (item.depth > 0 && item.rootSessionId) {
      parentIds.add(item.rootSessionId)
    }
  }
  return parentIds
})
```

**Step 2: Add child count computation**

After the expandedParents state, add a `useMemo` to compute child counts:

```typescript
// Compute child count per parent for badge display
const childCountByParent = useMemo(() => {
  const counts = new Map<string, number>()
  for (const item of items) {
    const parentId = item.parentSessionId ?? item.delegatedBySessionId ?? item.orchestratorSessionId
    if (parentId && item.depth > 0) {
      counts.set(parentId, (counts.get(parentId) ?? 0) + 1)
    }
  }
  return counts
}, [items])
```

**Step 3: Add toggle handler**

After the child count computation:

```typescript
const toggleParentExpanded = useCallback((parentId: string) => {
  setExpandedParents(prev => {
    const next = new Set(prev)
    if (next.has(parentId)) {
      next.delete(parentId)
    } else {
      next.add(parentId)
    }
    return next
  })
}, [])
```

**Step 4: Ensure new parents auto-expand**

Add an effect to auto-expand newly appearing parents:

```typescript
// Auto-expand newly appearing orchestrator parents
useEffect(() => {
  const currentParentIds = new Set<string>()
  for (const item of items) {
    if (item.depth > 0) {
      const parentId = item.parentSessionId ?? item.delegatedBySessionId ?? item.orchestratorSessionId
      if (parentId) currentParentIds.add(parentId)
    }
  }
  setExpandedParents(prev => {
    let changed = false
    const next = new Set(prev)
    for (const id of currentParentIds) {
      if (!next.has(id)) {
        next.add(id)
        changed = true
      }
    }
    return changed ? next : prev
  })
}, [items])
```

**Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/SessionList.tsx
git commit -m "feat(session-list): add collapse/expand state and child count computation"
```

---

### Task 3: Filter collapsed children and pass new props to SessionItem

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/SessionList.tsx` (SessionItemProps interface and rendering loop)

**Step 1: Add new props to SessionItemProps**

In the `SessionItemProps` interface (around line 198), add these fields:

```typescript
/** Number of sub-agent children (0 = no children) */
childCount: number
/** Whether this parent's children are expanded */
isExpanded: boolean
/** Toggle expand/collapse for this parent */
onToggleExpanded: () => void
```

**Step 2: Filter collapsed children from the display list**

Find the section where `items` are processed for display (look for `displayLimit` usage and `groupSessionsByDate`). Before items are grouped by date, filter out collapsed children. The exact location is where `paginatedItems` or the display slice is computed.

Add filtering logic:

```typescript
// Filter out children of collapsed parents
const expandedItems = useMemo(() => {
  return items.filter(item => {
    if (item.depth === 0) return true
    const parentId = item.parentSessionId ?? item.delegatedBySessionId ?? item.orchestratorSessionId
    return parentId ? expandedParents.has(parentId) : true
  })
}, [items, expandedParents])
```

Then use `expandedItems` instead of `items` in the subsequent pagination/grouping logic.

**Step 3: Pass new props to SessionItem in the render loop**

Find where `<SessionItem>` is rendered (inside the groupSessionsByDate loop). Add the new props:

```typescript
childCount={childCountByParent.get(item.id) ?? 0}
isExpanded={expandedParents.has(item.id)}
onToggleExpanded={() => toggleParentExpanded(item.id)}
```

**Step 4: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/SessionList.tsx
git commit -m "feat(session-list): filter collapsed children and pass expand props to SessionItem"
```

---

### Task 4: Render sub-agent chips in SessionItem

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/SessionList.tsx` (SessionItem component)

**Step 1: Destructure new props in SessionItem**

Add `childCount`, `isExpanded`, `onToggleExpanded` to the destructured props of `SessionItem` (around line 252).

**Step 2: Replace child row rendering with chip format**

Find the `isNestedChild` rendering path. Currently it renders with `CornerDownRight` arrow. Replace the entire child rendering branch.

The child chip renders as:
- No separator between chips
- No todo-state popover (keep the current behavior of no popover for nested)
- No context menu, no dropdown menu
- Chip layout: status dot + name, pill on dark background

Replace the child's `<button>` content. The chip should be:

```tsx
{/* Sub-agent chip rendering */}
<button
  {...itemProps}
  data-testid="session-list-item-button"
  data-session-id={item.id}
  className={cn(
    "flex items-center gap-2 w-full text-left outline-none rounded-md px-2 py-1",
    "transition-[background-color] duration-75",
    "hover:bg-foreground/5",
    isSelected && "bg-foreground/5"
  )}
  style={{ marginLeft: 36 }}
  onMouseDown={handleClick}
  onKeyDown={(e) => {
    itemProps.onKeyDown(e)
    onKeyDown(e, item)
  }}
>
  {/* Status dot */}
  <span
    className="shrink-0 w-2 h-2 rounded-full"
    style={{ backgroundColor: SUBAGENT_STATUS_COLORS[item.subagentStatus ?? ''] ?? '#71717a' }}
  />
  {/* Agent name */}
  <span className="text-xs text-foreground/80 truncate">
    {searchQuery ? highlightMatch(getSessionTitle(item), searchQuery) : getSessionTitle(item)}
  </span>
</button>
```

The chip should be wrapped in a container div with dark background:

```tsx
<div
  className="session-item"
  data-selected={isSelected || undefined}
  data-testid="session-list-item"
  data-session-id={item.id}
  data-session-kind="subagent"
  data-session-depth={item.depth}
>
  {/* No separator for chips */}
  <div className="pl-2 mr-2" style={{ paddingLeft: 8 + indentPx }}>
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1 cursor-pointer",
        "transition-[background-color] duration-75",
        isSelected ? "bg-foreground/7" : "hover:bg-foreground/3"
      )}
      style={{ marginLeft: 28, backgroundColor: isSelected ? undefined : 'rgba(39, 39, 42, 0.5)' }}
    >
      <button
        {...itemProps}
        data-testid="session-list-item-button"
        data-session-id={item.id}
        className="flex items-center gap-2 w-full text-left outline-none"
        onMouseDown={handleClick}
        onKeyDown={(e) => {
          itemProps.onKeyDown(e)
          onKeyDown(e, item)
        }}
      >
        <span
          className="shrink-0 w-2 h-2 rounded-full"
          style={{ backgroundColor: SUBAGENT_STATUS_COLORS[item.subagentStatus ?? ''] ?? '#71717a' }}
        />
        <span className="text-xs text-foreground/80 truncate">
          {searchQuery ? highlightMatch(getSessionTitle(item), searchQuery) : getSessionTitle(item)}
        </span>
      </button>
    </div>
  </div>
</div>
```

**Important:** Return early from SessionItem for chip-rendered children. Place the chip rendering before the existing return statement:

```typescript
if (isNestedChild) {
  return (
    // ... chip JSX above
  )
}
```

This replaces the existing `isNestedChild` conditional inside the current return. Remove the old `isNestedChild` branches (arrow icon, smaller sizing) from the main return since they're no longer reachable.

**Step 3: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/SessionList.tsx
git commit -m "feat(session-list): render sub-agent children as compact chips with status dots"
```

---

### Task 5: Add collapse/expand badge and subtitle to orchestrator parents

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/SessionList.tsx` (SessionItem component)

**Step 1: Add sub-agent count subtitle**

In the parent row's subtitle section (the `<div>` with `text-xs text-foreground/70`), add the sub-agent count before the timestamp when `childCount > 0`:

```tsx
{childCount > 0 && (
  <>
    <span className="shrink-0 text-foreground/50">
      {childCount} sub-agent{childCount !== 1 ? 's' : ''}
    </span>
    <span className="shrink-0 text-foreground/30">·</span>
  </>
)}
```

Place this right after the spinner/unread badge section and before the scrollable badges container.

**Step 2: Add collapse/expand toggle badge**

In the parent row, add a clickable badge at the end of the subtitle row (after the timestamp). This goes inside the button but positioned at the right:

```tsx
{childCount > 0 && (
  <div
    className="shrink-0 flex items-center gap-0.5 text-foreground/40 hover:text-foreground/60 cursor-pointer ml-1"
    role="button"
    aria-label={isExpanded ? 'Collapse sub-agents' : 'Expand sub-agents'}
    onMouseDown={(e) => {
      e.stopPropagation()
      e.preventDefault()
      onToggleExpanded()
    }}
  >
    <span className="text-[11px]">{childCount}</span>
    {isExpanded
      ? <ChevronUp className="w-3 h-3" />
      : <ChevronDown className="w-3 h-3" />
    }
  </div>
)}
```

Place this after the timestamp tooltip in the subtitle row.

**Step 3: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/SessionList.tsx
git commit -m "feat(session-list): add collapse/expand badge and sub-agent count subtitle"
```

---

### Task 6: Write tests for chip rendering and collapse/expand

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/__tests__/SessionList.test.tsx`

**Step 1: Add ChevronDown and ChevronUp to lucide-react mock**

In the `mock.module('lucide-react', ...)` block (around line 75), add:

```typescript
ChevronDown() { return null },
ChevronUp() { return null },
```

**Step 2: Write test for sub-agent chip rendering**

```typescript
test('SessionList renders subagent children as chips with status dot', async () => {
  const { SessionList } = await import('../SessionList')

  const parent: SessionListItem = {
    id: 'parent-session',
    workspaceId: 'workspace-1',
    name: 'Orchestrator',
    lastMessageAt: 1,
    sessionKind: 'orchestrator',
    depth: 0,
    rootSessionId: 'parent-session',
    rootLastMessageAt: 1,
    treeIndex: 0,
  }

  const child: SessionListItem = {
    id: 'child-session',
    workspaceId: 'workspace-1',
    name: 'Search files',
    lastMessageAt: 1,
    sessionKind: 'subagent',
    parentSessionId: 'parent-session',
    subagentStatus: 'completed',
    depth: 1,
    rootSessionId: 'parent-session',
    rootLastMessageAt: 1,
    treeIndex: 1,
  }

  // Should not throw — verifies chip rendering path works
  expect(() =>
    SessionList({
      items: [parent, child],
      onDelete: async () => true,
      onMarkUnread() {},
    })
  ).not.toThrow()
})
```

**Step 3: Write test for orchestrator with children showing count**

```typescript
test('SessionList renders orchestrator parent with child count', async () => {
  const { SessionList } = await import('../SessionList')

  const parent: SessionListItem = {
    id: 'parent-session',
    workspaceId: 'workspace-1',
    name: 'Orchestrator',
    lastMessageAt: 1,
    sessionKind: 'orchestrator',
    depth: 0,
    rootSessionId: 'parent-session',
    rootLastMessageAt: 1,
    treeIndex: 0,
  }

  const children: SessionListItem[] = [1, 2, 3].map((i) => ({
    id: `child-${i}`,
    workspaceId: 'workspace-1',
    name: `Sub-agent ${i}`,
    lastMessageAt: 1,
    sessionKind: 'subagent' as const,
    parentSessionId: 'parent-session',
    subagentStatus: 'running' as const,
    depth: 1,
    rootSessionId: 'parent-session',
    rootLastMessageAt: 1,
    treeIndex: i,
  }))

  expect(() =>
    SessionList({
      items: [parent, ...children],
      onDelete: async () => true,
      onMarkUnread() {},
    })
  ).not.toThrow()
})
```

**Step 4: Run tests to verify they pass**

Run: `bun test apps/electron/src/renderer/components/app-shell/__tests__/SessionList.test.tsx`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/__tests__/SessionList.test.tsx
git commit -m "test(session-list): add tests for subagent chip rendering and orchestrator child count"
```

---

### Task 7: Visual verification and cleanup

**Step 1: Run typecheck**

Run: `bun run typecheck:all`
Expected: No type errors

**Step 2: Run lint**

Run: `bun run lint:electron`
Expected: No lint errors

**Step 3: Run full test suite**

Run: `bun test apps/electron/src/renderer/components/app-shell/__tests__/SessionList.test.tsx`
Expected: All tests pass

**Step 4: Run dev server for visual verification**

Run: `bun run electron:dev`
Verify against D3 design screenshots:
- Parent rows show correct state icons
- Sub-agent chips display with colored status dots
- Collapse/expand toggle works
- Count badge shows correct number
- Visual parity with D3 mockups

**Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(session-list): visual polish for agent state indicators"
```
