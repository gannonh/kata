# KAT-64 Left Column Shell Parity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement left-column shell parity for KAT-64 by applying consistent section hierarchy across all left tabs and delivering deeper Agents-tab fidelity with expandable background-agent grouping.

**Architecture:** Keep the existing `LeftPanel` interaction model (left icon rail, one active section at a time) and introduce a shared left-section presentation primitive used by `Agents`, `Context`, `Changes`, and `Files`. Rework agent rendering from card-heavy to compact rows, and add a local UI-only collapsible background-group block sourced from extended mock agent data. Preserve existing tab behavior and renderer-safe boundaries.

**Tech Stack:** React 19 + TypeScript, SHADCN/Radix UI primitives, Tailwind utility classes, Vitest + Testing Library, Playwright E2E.

---

### Task 1: Create shared left-section scaffold

**Files:**
- Create: `app/src/renderer/components/left/LeftSection.tsx`
- Test: `app/tests/unit/renderer/left/LeftSection.test.tsx`

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LeftSection } from '../../../../src/renderer/components/left/LeftSection'

describe('LeftSection', () => {
  it('renders section title, subtitle, and add action', () => {
    render(
      <LeftSection
        title="Agents"
        description="Agents write code, maintain notes, and coordinate tasks."
        addActionLabel="Add agent"
      >
        <div>Body content</div>
      </LeftSection>
    )

    expect(screen.getByRole('heading', { name: 'Agents' })).toBeTruthy()
    expect(screen.getByText('Agents write code, maintain notes, and coordinate tasks.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add agent' })).toBeTruthy()
    expect(screen.getByText('Body content')).toBeTruthy()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run -w app test -- tests/unit/renderer/left/LeftSection.test.tsx`
Expected: FAIL with module/file-not-found for `LeftSection`.

**Step 3: Write minimal implementation**

```tsx
import { Plus } from 'lucide-react'

import { Button } from '../ui/button'

type LeftSectionProps = {
  title: string
  description: string
  addActionLabel: string
  children: React.ReactNode
}

export function LeftSection({ title, description, addActionLabel, children }: LeftSectionProps) {
  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={addActionLabel}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `npm run -w app test -- tests/unit/renderer/left/LeftSection.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add app/src/renderer/components/left/LeftSection.tsx app/tests/unit/renderer/left/LeftSection.test.tsx
git commit -m "test(app): add shared left-section scaffold component"
```

### Task 2: Extend agent type + mock data for delegation groups

**Files:**
- Modify: `app/src/renderer/types/agent.ts`
- Modify: `app/src/renderer/mock/agents.ts`
- Create: `app/tests/unit/renderer/left/AgentsTab.test.tsx`

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AgentsTab } from '../../../../src/renderer/components/left/AgentsTab'
import { mockAgents } from '../../../../src/renderer/mock/agents'

describe('AgentsTab', () => {
  it('shows background agent summary when coordinator has children', () => {
    render(<AgentsTab agents={mockAgents} />)

    expect(screen.getByText(/background agents running/i)).toBeTruthy()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run -w app test -- tests/unit/renderer/left/AgentsTab.test.tsx`
Expected: FAIL because summary text does not exist yet.

**Step 3: Write minimal implementation/data shape**

```ts
export type AgentSummary = {
  id: string
  name: string
  role: string
  status: AgentStatus
  model: string
  tokenUsage: AgentTokenUsage
  currentTask: string
  lastUpdated: string
  delegatedBy?: string
  children?: AgentSummary[]
}
```

Update `mockAgents` so coordinator includes `children` entries representing delegated/background agents with varied statuses.

**Step 4: Run test to verify it passes (still red for UI behavior, green for data visibility when wired)**

Run: `npm run -w app test -- tests/unit/renderer/left/AgentsTab.test.tsx`
Expected: Initially still FAIL until Task 3 wiring is done.

**Step 5: Commit**

```bash
git add app/src/renderer/types/agent.ts app/src/renderer/mock/agents.ts app/tests/unit/renderer/left/AgentsTab.test.tsx
git commit -m "test(app): model delegated background agents for left-panel parity"
```

### Task 3: Rebuild Agents tab into compact rows + expandable background group

**Files:**
- Modify: `app/src/renderer/components/left/AgentCard.tsx`
- Modify: `app/src/renderer/components/left/AgentsTab.tsx`
- Modify: `app/tests/unit/renderer/left/AgentCard.test.tsx`
- Modify: `app/tests/unit/renderer/left/AgentsTab.test.tsx`

**Step 1: Write/extend failing tests**

```tsx
it('hides model and token metadata in compact view', () => {
  render(<AgentCard agent={runningAgent} />)

  expect(screen.queryByText(/Model:/)).toBeNull()
  expect(screen.queryByText(/Tokens:/)).toBeNull()
})

it('expands and collapses background agent rows', () => {
  render(<AgentsTab agents={mockAgents} />)

  const toggle = screen.getByRole('button', { name: /background agents running/i })
  toggle.click()
  expect(screen.getByText(/Delegated by/i)).toBeTruthy()

  toggle.click()
  expect(screen.queryByText(/Delegated by/i)).toBeNull()
})
```

**Step 2: Run tests to verify they fail**

Run: `npm run -w app test -- tests/unit/renderer/left/AgentCard.test.tsx tests/unit/renderer/left/AgentsTab.test.tsx`
Expected: FAIL due current card metadata and no group expand/collapse behavior.

**Step 3: Write minimal implementation**

- Refactor `AgentCard` to compact row layout:
  - status dot
  - name + right-aligned relative/minute timestamp
  - task line
  - optional delegated attribution line
- Add background-group summary in `AgentsTab`:
  - indicator squares for child statuses
  - `N / M background agents running` label
  - collapse state with chevron
  - indented child row render on expand

**Step 4: Run tests to verify they pass**

Run: `npm run -w app test -- tests/unit/renderer/left/AgentCard.test.tsx tests/unit/renderer/left/AgentsTab.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add app/src/renderer/components/left/AgentCard.tsx app/src/renderer/components/left/AgentsTab.tsx app/tests/unit/renderer/left/AgentCard.test.tsx app/tests/unit/renderer/left/AgentsTab.test.tsx
git commit -m "feat(app): add compact agents rows and background-group expansion"
```

### Task 4: Apply shared header parity to Context tab

**Files:**
- Modify: `app/src/renderer/components/left/ContextTab.tsx`
- Create: `app/tests/unit/renderer/left/ContextTab.test.tsx`

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ContextTab } from '../../../../src/renderer/components/left/ContextTab'
import { mockProject } from '../../../../src/renderer/mock/project'

describe('ContextTab', () => {
  it('renders subtitle and does not show Open project spec action', () => {
    render(<ContextTab project={mockProject} />)

    expect(screen.getByText('Context about the task, shared with all agents on demand.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Open project spec' })).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run -w app test -- tests/unit/renderer/left/ContextTab.test.tsx`
Expected: FAIL because subtitle text and link removal are not implemented.

**Step 3: Write minimal implementation**

- Replace custom heading block with `LeftSection` wrapper.
- Use required subtitle copy.
- Remove `Open project spec` button/link.
- Keep existing checklist rendering.

**Step 4: Run test to verify it passes**

Run: `npm run -w app test -- tests/unit/renderer/left/ContextTab.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add app/src/renderer/components/left/ContextTab.tsx app/tests/unit/renderer/left/ContextTab.test.tsx
git commit -m "feat(app): align context-tab shell hierarchy with left-column parity"
```

### Task 5: Apply shared header parity to Changes and Files tabs

**Files:**
- Modify: `app/src/renderer/components/left/ChangesTab.tsx`
- Modify: `app/src/renderer/components/left/FilesTab.tsx`
- Modify: `app/tests/unit/renderer/left/ChangesTab.test.tsx`
- Modify: `app/tests/unit/renderer/left/FilesTab.test.tsx`

**Step 1: Write/extend failing tests**

```tsx
// ChangesTab.test.tsx
expect(screen.getByText('View and accept file changes.')).toBeTruthy()

// FilesTab.test.tsx
expect(screen.getByText(/Your copy of the repo lives in/i)).toBeTruthy()
```

**Step 2: Run tests to verify they fail**

Run: `npm run -w app test -- tests/unit/renderer/left/ChangesTab.test.tsx tests/unit/renderer/left/FilesTab.test.tsx`
Expected: FAIL due missing subtitle/header parity text.

**Step 3: Write minimal implementation**

- Wrap `ChangesTab` and `FilesTab` content in `LeftSection`.
- Keep staged/unstaged cards, commit button, search input, and file tree behavior unchanged.
- Tighten spacing classes to compact shell rhythm.

**Step 4: Run tests to verify they pass**

Run: `npm run -w app test -- tests/unit/renderer/left/ChangesTab.test.tsx tests/unit/renderer/left/FilesTab.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add app/src/renderer/components/left/ChangesTab.tsx app/src/renderer/components/left/FilesTab.tsx app/tests/unit/renderer/left/ChangesTab.test.tsx app/tests/unit/renderer/left/FilesTab.test.tsx
git commit -m "feat(app): apply shared shell hierarchy to changes and files tabs"
```

### Task 6: Update left panel integration tests and run verification suite

**Files:**
- Modify: `app/tests/unit/renderer/left/LeftPanel.test.tsx`
- Optional (if text-based assertions require updates): `app/tests/e2e/navigation.spec.ts`

**Step 1: Write/adjust failing assertions for new shell copy**

```tsx
expect(screen.getByText('Agents write code, maintain notes, and coordinate tasks.')).toBeTruthy()
expect(screen.getByText('View and accept file changes.')).toBeTruthy()
```

**Step 2: Run tests to verify failures**

Run: `npm run -w app test -- tests/unit/renderer/left/LeftPanel.test.tsx`
Expected: FAIL until updated copy is wired through all tabs.

**Step 3: Apply minimal test/markup fixes**

- Update stale heading/copy assertions.
- Preserve tablist accessibility names so existing E2E tab switching still works.

**Step 4: Run verification commands**

Run:
- `npm run -w app test -- tests/unit/renderer/left/LeftSection.test.tsx tests/unit/renderer/left/AgentsTab.test.tsx tests/unit/renderer/left/AgentCard.test.tsx tests/unit/renderer/left/ContextTab.test.tsx tests/unit/renderer/left/ChangesTab.test.tsx tests/unit/renderer/left/FilesTab.test.tsx tests/unit/renderer/left/LeftPanel.test.tsx`
- `npm run test:app`
- `npm run test:app:e2e:quality-gate`

Expected:
- All targeted/unit tests PASS.
- Desktop unit suite PASS.
- Quality-gate E2E subset PASS.

**Step 5: Commit**

```bash
git add app/tests/unit/renderer/left/LeftPanel.test.tsx app/tests/e2e/navigation.spec.ts
git commit -m "test(app): align left-panel integration coverage with KAT-64 parity"
```

## Execution notes
- Apply `@test-driven-development` on every task before implementation edits.
- Apply `@verification-before-completion` before claiming KAT-64 done.
- Keep commits small and task-scoped as above.
- Do not change left-rail interaction model in this issue.
