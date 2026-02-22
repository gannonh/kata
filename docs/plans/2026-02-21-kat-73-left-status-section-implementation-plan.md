# KAT-73 Left Status Section Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the always-visible left-panel status section for KAT-73 with dynamic task-based segmented progress and baseline parity simple/progress states.

**Architecture:** Add a new `LeftStatusSection` renderer component above existing left-tab content and drive all visual state from `ProjectSpec.tasks`. Use a pure progress-layout utility to compute live rows and rollup chips (`N done`) with a hard row cap of 25 segments. Add a test-only localStorage scenario override so E2E can deterministically assert simple/progress/overflow states without introducing any user-facing toggle behavior.

**Tech Stack:** React 19 + TypeScript, SHADCN UI primitives, Tailwind utility classes, Vitest + Testing Library, Playwright Electron E2E.

---

### Task 1: Add progress-layout utility for dynamic rows and rollup chips

**Files:**
- Create: `app/src/renderer/components/left/left-status-progress.ts`
- Test: `app/tests/unit/renderer/left/left-status-progress.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'

import { buildLeftStatusProgress } from '../../../../src/renderer/components/left/left-status-progress'

describe('buildLeftStatusProgress', () => {
  it('returns simple mode when no tasks are complete', () => {
    const result = buildLeftStatusProgress([
      { id: 't1', title: 'Task 1', status: 'todo' },
      { id: 't2', title: 'Task 2', status: 'in_progress' }
    ])

    expect(result.mode).toBe('simple')
    expect(result.message).toBe('Tasks ready to go.')
  })

  it('rolls completed full rows into N done chips with 25-per-row cap', () => {
    const tasks = Array.from({ length: 60 }, (_, index) => ({
      id: `t-${index}`,
      title: `Task ${index}`,
      status: index < 50 ? ('done' as const) : ('todo' as const)
    }))

    const result = buildLeftStatusProgress(tasks)

    expect(result.mode).toBe('progress')
    expect(result.rollups).toEqual([{ label: '25 done' }, { label: '25 done' }])
    expect(result.liveSegments).toHaveLength(10)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run -w app test -- tests/unit/renderer/left/left-status-progress.test.ts`
Expected: FAIL with module-not-found for `left-status-progress`.

**Step 3: Write minimal implementation**

```ts
import type { ProjectTask } from '../../types/project'

export const LEFT_STATUS_ROW_CAP = 25

export type LeftStatusMode = 'simple' | 'progress'
export type LeftStatusMessage = 'Tasks ready to go.' | 'Making progress.' | 'All tasks complete.'
export type SegmentTone = 'todo' | 'in_progress' | 'done' | 'blocked'

export type LeftStatusProgressView = {
  mode: LeftStatusMode
  message: LeftStatusMessage
  rollups: Array<{ label: string }>
  liveSegments: SegmentTone[]
}

export function buildLeftStatusProgress(tasks: ProjectTask[]): LeftStatusProgressView {
  const total = tasks.length
  const doneCount = tasks.filter((task) => task.status === 'done').length
  const hasInProgress = tasks.some((task) => task.status === 'in_progress')

  if (doneCount === 0) {
    return {
      mode: 'simple',
      message: 'Tasks ready to go.',
      rollups: [],
      liveSegments: tasks.slice(0, LEFT_STATUS_ROW_CAP).map((task) => task.status)
    }
  }

  const completeRows = Math.floor(doneCount / LEFT_STATUS_ROW_CAP)
  const rollups = Array.from({ length: completeRows }, () => ({ label: `${LEFT_STATUS_ROW_CAP} done` }))

  const liveStart = completeRows * LEFT_STATUS_ROW_CAP
  const liveSegments = tasks.slice(liveStart, liveStart + LEFT_STATUS_ROW_CAP).map((task) => task.status)

  const message: LeftStatusMessage =
    total > 0 && doneCount === total ? 'All tasks complete.' : hasInProgress || doneCount > 0 ? 'Making progress.' : 'Tasks ready to go.'

  return {
    mode: 'progress',
    message,
    rollups,
    liveSegments
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm run -w app test -- tests/unit/renderer/left/left-status-progress.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add app/src/renderer/components/left/left-status-progress.ts app/tests/unit/renderer/left/left-status-progress.test.ts
git commit -m "test(app): add left status progress row/rollup computation"
```

### Task 2: Build LeftStatusSection component with parity copy and overflow affordance

**Files:**
- Create: `app/src/renderer/components/left/LeftStatusSection.tsx`
- Test: `app/tests/unit/renderer/left/LeftStatusSection.test.tsx`

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LeftStatusSection } from '../../../../src/renderer/components/left/LeftStatusSection'

describe('LeftStatusSection', () => {
  it('renders title/subtitle, progress segments, and status message', () => {
    render(
      <LeftStatusSection
        title="Build Kata Cloud MVP"
        subtitle="gannonh/kata-cloud"
        tasks={[
          { id: 't1', title: 'Task 1', status: 'done' },
          { id: 't2', title: 'Task 2', status: 'in_progress' }
        ]}
      />
    )

    expect(screen.getByText('Build Kata Cloud MVP')).toBeTruthy()
    expect(screen.getByText('gannonh/kata-cloud')).toBeTruthy()
    expect(screen.getByText('Making progress.')).toBeTruthy()
    expect(screen.getByLabelText('Status section options')).toBeTruthy()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run -w app test -- tests/unit/renderer/left/LeftStatusSection.test.tsx`
Expected: FAIL with component-not-found.

**Step 3: Write minimal implementation**

```tsx
import { MoreVertical } from 'lucide-react'

import type { ProjectTask } from '../../types/project'
import { Button } from '../ui/button'
import { buildLeftStatusProgress } from './left-status-progress'

type LeftStatusSectionProps = {
  title: string
  subtitle: string
  tasks: ProjectTask[]
}

export function LeftStatusSection({ title, subtitle, tasks }: LeftStatusSectionProps) {
  const progress = buildLeftStatusProgress(tasks)

  return (
    <section
      aria-label="Left panel status"
      className="border-b border-border px-4 pb-3 pt-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-[1.625rem] font-semibold leading-tight">{title}</h2>
          <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Status section options"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-3 grid gap-2">
        {progress.rollups.map((rollup) => (
          <span
            key={rollup.label}
            className="inline-flex w-fit rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
          >
            {rollup.label}
          </span>
        ))}
        <div className="grid grid-cols-25 gap-1">
          {progress.liveSegments.map((segment, index) => (
            <span
              key={`${segment}-${index}`}
              data-segment-status={segment}
              className="h-2 rounded-sm bg-muted"
            />
          ))}
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{progress.message}</p>
    </section>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `npm run -w app test -- tests/unit/renderer/left/LeftStatusSection.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add app/src/renderer/components/left/LeftStatusSection.tsx app/tests/unit/renderer/left/LeftStatusSection.test.tsx
git commit -m "feat(app): add left-panel status section baseline component"
```

### Task 3: Wire status section into LeftPanel and add deterministic test scenarios

**Files:**
- Modify: `app/src/renderer/types/project.ts`
- Modify: `app/src/renderer/mock/project.ts`
- Modify: `app/src/renderer/components/layout/LeftPanel.tsx`
- Modify: `app/tests/unit/renderer/left/LeftPanel.test.tsx`

**Step 1: Write failing integration tests**

```tsx
it('renders status section above tab content', () => {
  render(<LeftPanel />)

  expect(screen.getByLabelText('Left panel status')).toBeTruthy()
  expect(screen.getByText('Tasks ready to go.')).toBeTruthy()
})

it('supports overflow state scenario with rollup chips', () => {
  window.localStorage.setItem('kata-left-status-scenario', 'overflow')
  render(<LeftPanel />)

  expect(screen.getByText('25 done')).toBeTruthy()
})
```

**Step 2: Run tests to verify they fail**

Run: `npm run -w app test -- tests/unit/renderer/left/LeftPanel.test.tsx`
Expected: FAIL because `LeftStatusSection` is not wired and scenario override does not exist.

**Step 3: Write minimal implementation**

```ts
// in project type
export type ProjectSpec = {
  // existing fields...
  sessionTitle?: string
  repositorySubtitle?: string
}
```

```ts
// in mock/project.ts
const LEFT_STATUS_SCENARIO_KEY = 'kata-left-status-scenario'
type LeftStatusScenario = 'default' | 'simple' | 'progress' | 'overflow'

export function getMockProject(): ProjectSpec {
  const scenario = (globalThis.localStorage?.getItem(LEFT_STATUS_SCENARIO_KEY) ?? 'default') as LeftStatusScenario
  // return base project plus scenario-specific task arrays
}
```

```tsx
// in LeftPanel.tsx
const project = useMemo(() => getMockProject(), [])

<LeftStatusSection
  title={project.sessionTitle ?? 'Build Kata Cloud MVP'}
  subtitle={project.repositorySubtitle ?? 'gannonh/kata-cloud'}
  tasks={project.tasks}
/>
```

**Step 4: Run tests to verify they pass**

Run: `npm run -w app test -- tests/unit/renderer/left/LeftPanel.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add app/src/renderer/types/project.ts app/src/renderer/mock/project.ts app/src/renderer/components/layout/LeftPanel.tsx app/tests/unit/renderer/left/LeftPanel.test.tsx
git commit -m "feat(app): wire left status section with scenario-driven task states"
```

### Task 4: Add mandatory E2E coverage for status visibility and state variants

**Files:**
- Modify: `app/tests/e2e/navigation.spec.ts`

**Step 1: Write failing E2E tests**

```ts
test('keeps left status visible while switching tabs @uat @ci @quality-gate', async ({ appWindow }) => {
  await expect(appWindow.getByLabel('Left panel status')).toBeVisible()

  const tabs = appWindow.getByRole('tablist', { name: /Left panel (tabs|modules)/ })
  await tabs.getByRole('tab', { name: 'Context' }).click()
  await expect(appWindow.getByLabel('Left panel status')).toBeVisible()
  await tabs.getByRole('tab', { name: 'Changes' }).click()
  await expect(appWindow.getByLabel('Left panel status')).toBeVisible()
})

test('renders simple and overflow progress scenarios via localStorage override @uat @ci', async ({ appWindow }) => {
  await appWindow.evaluate(() => window.localStorage.setItem('kata-left-status-scenario', 'simple'))
  await appWindow.reload()
  await expect(appWindow.getByText('Tasks ready to go.')).toBeVisible()

  await appWindow.evaluate(() => window.localStorage.setItem('kata-left-status-scenario', 'overflow'))
  await appWindow.reload()
  await expect(appWindow.getByText('25 done')).toBeVisible()
  await expect(appWindow.getByText('Making progress.')).toBeVisible()
})
```

**Step 2: Run test to verify it fails**

Run: `npm run -w app test:e2e -- tests/e2e/navigation.spec.ts`
Expected: FAIL before wiring due missing status section/scenario behavior.

**Step 3: Implement minimal E2E-safe cleanup**

```ts
test.afterEach(async ({ appWindow }) => {
  await appWindow.evaluate(() => window.localStorage.removeItem('kata-left-status-scenario'))
})
```

Ensure the app defaults to baseline scenario when key is missing.

**Step 4: Run test to verify it passes**

Run: `npm run -w app test:e2e -- tests/e2e/navigation.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add app/tests/e2e/navigation.spec.ts
git commit -m "test(app): add e2e coverage for left status section states"
```

### Task 5: Run verification gates and capture evidence

**Files:**
- Modify: `docs/plans/2026-02-21-kat-73-left-status-section-design.md` (optional evidence notes only if needed)

**Step 1: Run focused unit suite**

Run: `npm run -w app test -- tests/unit/renderer/left/left-status-progress.test.ts tests/unit/renderer/left/LeftStatusSection.test.tsx tests/unit/renderer/left/LeftPanel.test.tsx`
Expected: PASS.

**Step 2: Run focused E2E suite**

Run: `npm run -w app test:e2e -- tests/e2e/navigation.spec.ts`
Expected: PASS for new status checks.

**Step 3: Run desktop quality gate**

Run: `npm run test:app:quality-gate`
Expected: PASS (lint + coverage + tagged E2E subset).

**Step 4: Commit final verification notes (if any file updated)**

```bash
git add <only-if-modified>
git commit -m "chore(app): finalize KAT-73 status-section verification"
```

**Step 5: Prepare PR summary**

Include:
- Unit test evidence for row-rollup logic and state transitions.
- E2E evidence for always-visible status block and scenario variants.
- Confirmation that left-tab navigation behavior is unchanged.

## Implementation Notes
- Use `@test-driven-development` before each implementation step.
- Use `@verification-before-completion` before declaring KAT-73 complete.
- Keep row-cap constant (`25`) centralized in `left-status-progress.ts`.
- Do not introduce backend or preload IPC changes in this ticket.
