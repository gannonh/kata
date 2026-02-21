# Cross-Column Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make center and right panels split remaining space equally after the left column, with resizer fine-tuning and double-click reset, plus standardized scroll containment and spacing.

**Architecture:** The CSS Grid template switches from `minmax(420px, 1fr)` center + fixed-pixel right to fully pixel-computed widths for both center and right, derived from `(availableWidth - leftWidth - resizers) / 2 +/- offset`. PanelResizer gains an `onDoubleClick` prop. Scroll areas in left and right panels switch from fragile `calc()` heights to `flex-1 min-h-0` wrappers.

**Tech Stack:** React, Tailwind CSS, Vitest + Testing Library, Playwright (E2E)

---

### Task 1: Add onDoubleClick prop to PanelResizer

**Files:**
- Modify: `src/renderer/components/layout/PanelResizer.tsx`
- Test: `tests/unit/renderer/PanelResizer.test.tsx`

**Step 1: Write the failing test**

Add a new test case in `PanelResizer.test.tsx`:

```tsx
it('fires onDoubleClick when the separator is double-clicked', () => {
  const onDelta = vi.fn()
  const onDoubleClick = vi.fn()

  render(
    <PanelResizer
      label="Resize panel"
      onDelta={onDelta}
      onDoubleClick={onDoubleClick}
    />
  )

  const separator = screen.getByRole('separator', { name: 'Resize panel' })
  fireEvent.doubleClick(separator)

  expect(onDoubleClick).toHaveBeenCalledTimes(1)
  expect(onDelta).not.toHaveBeenCalled()
})
```

**Step 2: Run test to verify it fails**

Run: `npm run -w app test -- --run tests/unit/renderer/PanelResizer.test.tsx`
Expected: FAIL — `onDoubleClick` is not a recognized prop on PanelResizer.

**Step 3: Write minimal implementation**

In `PanelResizer.tsx`, add `onDoubleClick?: () => void` to `PanelResizerProps`. Destructure it in the function signature. Add `onDoubleClick={onDoubleClick}` to the `<button>` element.

```tsx
type PanelResizerProps = {
  label: string
  testId?: string
  onDelta: (deltaX: number) => void
  onDoubleClick?: () => void
  lineAt?: 'start' | 'center' | 'end'
}

export function PanelResizer({ label, testId, onDelta, onDoubleClick, lineAt = 'center' }: PanelResizerProps) {
  // ... existing handlers unchanged ...

  return (
    <button
      type="button"
      aria-label={label}
      role="separator"
      aria-orientation="vertical"
      data-testid={testId}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      onDoubleClick={onDoubleClick}
      className="relative h-full w-[10px] cursor-col-resize bg-transparent px-0 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* ... spans unchanged ... */}
    </button>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `npm run -w app test -- --run tests/unit/renderer/PanelResizer.test.tsx`
Expected: PASS — all 3 tests green.

**Step 5: Commit**

```bash
git add src/renderer/components/layout/PanelResizer.tsx tests/unit/renderer/PanelResizer.test.tsx
git commit -m "feat(app): add onDoubleClick prop to PanelResizer"
```

---

### Task 2: Change AppShell grid to equal center/right split

**Files:**
- Modify: `src/renderer/components/layout/AppShell.tsx`
- Test: `tests/unit/renderer/AppShell.test.tsx`

**Context:** This is the core change. The grid template switches from `${leftPx}px ${RESIZER}px minmax(${CENTER_MIN}px, 1fr) ${RESIZER}px ${rightPx}px` to `${leftPx}px ${RESIZER}px ${centerPx}px ${RESIZER}px ${rightPx}px` where center and right are computed from `(remaining / 2) +/- rightOffset`.

**Step 1: Update the failing test assertions**

The existing test `renders columns and supports keyboard panel resizing with window resize fallback` asserts specific grid template strings. At `clientWidth=1600`:

- `leftWidth=320, resizers=20, remaining=1260, half=630`
- Default grid: `320px 10px 630px 10px 630px`
- After left ArrowRight (+12): left=332, remaining=1248, half=624 → `332px 10px 624px 10px 624px`
- After right ArrowLeft (deltaX=-12, offset += 12): center=612, right=636 → `332px 10px 612px 10px 636px`
- After 10x left ArrowLeft+Shift (left clamped to 260): remaining=1320, half=660 → `260px 10px 648px 10px 672px` (offset still 12)
- After collapse (left=56): remaining=1524, half=762 → `56px 10px 750px 10px 774px`
- After ArrowRight on left (+12, uncollapse, left=272): remaining=1308, half=654 → `272px 10px 642px 10px 666px`

Update the test `renders columns and supports keyboard panel resizing with window resize fallback`:

```tsx
it('renders columns and supports keyboard panel resizing with window resize fallback', () => {
  const restoreClientWidth = mockClientWidth(1600)
  globalThis.ResizeObserver = undefined

  const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
  const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

  const { getByTestId, unmount } = render(<AppShell />)

  const grid = getByTestId('app-shell-grid')
  const leftResizer = screen.getByLabelText('Resize left panel')
  const rightResizer = screen.getByLabelText('Resize right panel')
  const leftTabList = screen.getByRole('tablist', { name: 'Left panel modules' })

  expect(screen.getByRole('heading', { name: 'Agents' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Orchestrator Chat' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Spec' })).toBeTruthy()
  expect(leftTabList).toBeTruthy()

  // Default: equal split → 320 + 10 + 630 + 10 + 630
  expect(grid.style.gridTemplateColumns).toBe('320px 10px 630px 10px 630px')

  fireEvent.keyDown(leftResizer, { key: 'ArrowRight' })
  // left=332, remaining=1248, half=624
  expect(grid.style.gridTemplateColumns).toBe('332px 10px 624px 10px 624px')

  fireEvent.keyDown(rightResizer, { key: 'ArrowLeft' })
  // offset=12, center=612, right=636
  expect(grid.style.gridTemplateColumns).toBe('332px 10px 612px 10px 636px')

  for (let index = 0; index < 10; index += 1) {
    fireEvent.keyDown(leftResizer, { key: 'ArrowLeft', shiftKey: true })
  }
  // left clamped to 260, remaining=1320, half=660, offset=12
  expect(grid.style.gridTemplateColumns).toBe('260px 10px 648px 10px 672px')

  fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar navigation' }))
  expect(screen.getByRole('button', { name: 'Expand sidebar navigation' })).toBeTruthy()
  // left=56, remaining=1524, half=762, offset=12
  expect(grid.style.gridTemplateColumns).toBe('56px 10px 750px 10px 774px')

  fireEvent.keyDown(leftResizer, { key: 'ArrowRight' })
  expect(screen.getByRole('button', { name: 'Collapse sidebar navigation' })).toBeTruthy()
  // uncollapse, left=272, remaining=1308, half=654, offset=12
  expect(grid.style.gridTemplateColumns).toBe('272px 10px 642px 10px 666px')

  window.dispatchEvent(new Event('resize'))

  unmount()

  expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function))
  expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function))

  restoreClientWidth()
})
```

Update the test `uses ResizeObserver when available and cleans it up on unmount`:

At `clientWidth=1500`: left=320, remaining=1160, half=580 → `320px 10px 580px 10px 580px`

After `observerCallback?.([{ contentRect: { width: 1700 } }])` and left ArrowRight+Shift (+48):
left=368, remaining=1312, half=656 → `368px 10px 656px 10px 656px`

After right ArrowRight (deltaX=+12, offset = 0 - 12 = -12): center=668, right=644 → `368px 10px 668px 10px 644px`

```tsx
it('uses ResizeObserver when available and cleans it up on unmount', () => {
  const restoreClientWidth = mockClientWidth(1500)
  // ... MockResizeObserver setup unchanged ...

  const { getByTestId, unmount } = render(<AppShell />)

  const grid = getByTestId('app-shell-grid')
  const leftResizer = screen.getByLabelText('Resize left panel')
  const rightResizer = screen.getByLabelText('Resize right panel')

  expect(observeSpy).toHaveBeenCalledWith(grid)

  observerCallback?.([{ contentRect: { width: 1700 } }])
  fireEvent.keyDown(leftResizer, { key: 'ArrowRight', shiftKey: true })
  expect(grid.style.gridTemplateColumns).toBe('368px 10px 656px 10px 656px')

  observerCallback?.([])
  fireEvent.keyDown(rightResizer, { key: 'ArrowRight' })
  expect(grid.style.gridTemplateColumns).toBe('368px 10px 668px 10px 644px')

  unmount()

  expect(disconnectSpy).toHaveBeenCalledTimes(1)

  restoreClientWidth()
})
```

**Step 2: Run tests to verify they fail**

Run: `npm run -w app test -- --run tests/unit/renderer/AppShell.test.tsx`
Expected: FAIL — grid template strings don't match (old format still in source).

**Step 3: Implement the grid template change in AppShell.tsx**

Replace `rightWidth` state with `rightOffset` state. Change `CENTER_MIN` from 420 to 300.

Key changes to `AppShell.tsx`:

1. Replace state:
   ```tsx
   // Remove:
   const rightWidthRef = useRef(360)
   const [rightWidth, setRightWidth] = useState(360)
   // Add:
   const rightOffsetRef = useRef(0)
   const [rightOffset, setRightOffset] = useState(0)
   ```

2. Replace the rightWidth ref sync effect:
   ```tsx
   useEffect(() => {
     rightOffsetRef.current = rightOffset
   }, [rightOffset])
   ```

3. Compute grid columns:
   ```tsx
   const gridTemplateColumns = useMemo(() => {
     const remaining = availableWidth - effectiveLeftWidth - RESIZER_WIDTH * 2
     const half = remaining / 2
     const centerWidth = half - rightOffset
     const rightWidth = half + rightOffset
     return `${effectiveLeftWidth}px ${RESIZER_WIDTH}px ${centerWidth}px ${RESIZER_WIDTH}px ${rightWidth}px`
   }, [effectiveLeftWidth, rightOffset, availableWidth])
   ```

4. Update the left resizer `onDelta` — the max calculation changes since `rightWidth` is no longer a stored value:
   ```tsx
   onDelta={(deltaX) => {
     setLeftWidth((current) => {
       const maxLeft = Math.max(
         LEFT_MIN,
         availableWidth - CENTER_MIN * 2 - RESIZER_WIDTH * 2
       )
       const next = clamp(current + deltaX, LEFT_MIN, maxLeft)
       if (leftCollapsed) {
         setLeftCollapsed(false)
       }
       return next
     })
   }}
   ```

   Note: The max left width ensures both center and right can still fit `CENTER_MIN` (300px each). This replaces the old calculation that used `rightWidthRef.current`.

5. Update the right resizer:
   ```tsx
   <PanelResizer
     label="Resize right panel"
     testId="right-resizer"
     lineAt="start"
     onDelta={(deltaX) => {
       setRightOffset((current) => {
         const remaining = availableWidth - (leftCollapsed ? LEFT_COLLAPSED : leftWidthRef.current) - RESIZER_WIDTH * 2
         const half = remaining / 2
         const maxOffset = half - CENTER_MIN
         return clamp(current - deltaX, -maxOffset, maxOffset)
       })
     }}
     onDoubleClick={() => setRightOffset(0)}
   />
   ```

   The offset is clamped so neither center nor right goes below `CENTER_MIN` (300px). `clamp(offset, -maxOffset, maxOffset)` ensures `half - offset >= CENTER_MIN` and `half + offset >= CENTER_MIN`.

**Step 4: Run tests to verify they pass**

Run: `npm run -w app test -- --run tests/unit/renderer/AppShell.test.tsx`
Expected: PASS — all 4 tests green.

**Step 5: Add a test for double-click reset**

Add a new test case in `AppShell.test.tsx`:

```tsx
it('resets right panel offset to equal split on double-click', () => {
  const restoreClientWidth = mockClientWidth(1600)
  globalThis.ResizeObserver = undefined

  const { getByTestId, unmount } = render(<AppShell />)
  const grid = getByTestId('app-shell-grid')
  const rightResizer = screen.getByLabelText('Resize right panel')

  // Default: equal split
  expect(grid.style.gridTemplateColumns).toBe('320px 10px 630px 10px 630px')

  // Drag right resizer to create offset
  fireEvent.keyDown(rightResizer, { key: 'ArrowLeft' })
  expect(grid.style.gridTemplateColumns).toBe('320px 10px 618px 10px 642px')

  // Double-click resets to equal
  fireEvent.doubleClick(rightResizer)
  expect(grid.style.gridTemplateColumns).toBe('320px 10px 630px 10px 630px')

  unmount()
  restoreClientWidth()
})
```

**Step 6: Run tests to verify they pass**

Run: `npm run -w app test -- --run tests/unit/renderer/AppShell.test.tsx`
Expected: PASS — all 5 tests green.

**Step 7: Commit**

```bash
git add src/renderer/components/layout/AppShell.tsx tests/unit/renderer/AppShell.test.tsx
git commit -m "feat(app): equal center/right split with offset-based resizing"
```

---

### Task 3: Fix LeftPanel scroll containment

**Files:**
- Modify: `src/renderer/components/layout/LeftPanel.tsx`
- Test: `tests/unit/renderer/left/LeftPanel.test.tsx`

**Step 1: Verify existing tests pass before refactor**

Run: `npm run -w app test -- --run tests/unit/renderer/left/LeftPanel.test.tsx`
Expected: PASS — all 4 tests green. This is a structural refactor, not behavior change.

**Step 2: Replace calc() with flex fill**

In `LeftPanel.tsx`, change the scroll content area from:

```tsx
<ScrollArea className="h-[calc(100%-3.5rem)] p-4">
```

to a flex-fill wrapper:

```tsx
<div className="min-h-0 flex-1 overflow-hidden">
  <ScrollArea className="h-full px-4 pb-4">
```

The parent `<div data-testid="left-panel-content">` already has `overflow-hidden`. The new wrapper becomes the flex-1 child. The `p-4` on ScrollArea becomes `px-4 pb-4` (no top padding since header provides visual separation).

**Step 3: Run tests to verify they still pass**

Run: `npm run -w app test -- --run tests/unit/renderer/left/LeftPanel.test.tsx`
Expected: PASS — all 4 tests still green. No behavior change, only structural CSS.

**Step 4: Commit**

```bash
git add src/renderer/components/layout/LeftPanel.tsx
git commit -m "fix(app): replace fragile calc() scroll height with flex fill in LeftPanel"
```

---

### Task 4: Fix RightPanel scroll containment and spacing

**Files:**
- Modify: `src/renderer/components/layout/RightPanel.tsx`
- Test: `tests/unit/renderer/right/RightPanel.test.tsx`

**Step 1: Verify existing tests pass before refactor**

Run: `npm run -w app test -- --run tests/unit/renderer/right/RightPanel.test.tsx`
Expected: PASS — all 3 tests green.

**Step 2: Replace calc() with flex fill and remove pr-2**

In `RightPanel.tsx`, change the collapsible content area from:

```tsx
<ScrollArea className="mt-4 h-[calc(100%-7.5rem)] pr-2">{activeContent}</ScrollArea>
```

to a flex-fill wrapper:

```tsx
<div className="mt-4 min-h-0 flex-1 overflow-hidden">
  <ScrollArea className="h-full px-0">{activeContent}</ScrollArea>
</div>
```

The parent `<div className="min-h-0 flex-1 overflow-hidden p-4 ...">` already has flex-1. But the internal stacking (h2 + p + TabBar + ScrollArea) needs to also be a flex column. Change the outer content div to include `flex flex-col`:

```tsx
<div
  className={cn(
    'flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 transition-[opacity] duration-200 ease-linear',
    isCollapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
  )}
>
  <h2 className="shrink-0 text-2xl font-semibold tracking-tight">Spec</h2>
  <p className="mt-1 shrink-0 text-sm text-muted-foreground">{project.name}</p>
  <TabBar className="mt-4 shrink-0" ... />
  <div className="mt-4 min-h-0 flex-1 overflow-hidden">
    <ScrollArea className="h-full">{activeContent}</ScrollArea>
  </div>
</div>
```

Note: The outer div changes from `p-4` to `px-4 pb-4` (standardizing padding). The `pr-2` on ScrollArea is removed.

**Step 3: Run tests to verify they still pass**

Run: `npm run -w app test -- --run tests/unit/renderer/right/RightPanel.test.tsx`
Expected: PASS — all 3 tests still green.

**Step 4: Commit**

```bash
git add src/renderer/components/layout/RightPanel.tsx
git commit -m "fix(app): replace fragile calc() scroll height and standardize spacing in RightPanel"
```

---

### Task 5: Update E2E resize test

**Files:**
- Modify: `tests/e2e/wave1-uat.spec.ts`

**Step 1: Review E2E resize assertion**

The test `supports horizontal panel resizing via drag handles` drags the right resizer 120px to the left and asserts `rightPanel.width > rightBefore.width + 40`.

With the new equal-split model at 1440x900:
- Default: left=320, remaining=1100, half=550. Right starts at 550px (was 360px).
- After dragging right resizer 120px left: offset increases by ~120, right ≈ 670px.
- Assertion: `670 > 550 + 40 = 590` → passes.

The left panel resize assertion is unchanged since the left resizer behavior didn't change.

This test should still pass without modification. If it doesn't, the assertion format is flexible enough (`toBeGreaterThan`) to accommodate the new default widths.

**Step 2: Run E2E quality gate to verify**

Run: `npm run -w app test:e2e:quality-gate`
Expected: PASS — all quality-gate tagged E2E tests green.

**Step 3: Commit (only if changes were needed)**

If no changes needed, skip this commit.

---

### Task 6: Run full quality gate

**Step 1: Run unit test coverage**

Run: `npm run test:app:coverage`
Expected: PASS — coverage thresholds met.

**Step 2: Run lint**

Run: `npm run -w app lint`
Expected: PASS — no new lint issues.

**Step 3: Run full CI-local check**

Run: `npm run -w app test:ci:local`
Expected: PASS — all checks green.

**Step 4: Final commit (if any fixups needed)**

Fix and commit anything that broke, then re-run the gate.
