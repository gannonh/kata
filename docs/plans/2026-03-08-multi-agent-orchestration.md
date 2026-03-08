# Multi-Agent Orchestration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build persisted orchestrator and sub-agent chat hierarchy with nested chat-list rendering, direct child-chat messaging, and preserved inline sub-agent activity in the orchestrator transcript.

**Architecture:** Extend session metadata to model a shallow parent-child tree, project child activity into both dedicated child sessions and the existing parent inline activity view, and derive nested list rendering from parent-owned organization rules. Keep workflow status, labels, and filtering parent-owned so orchestrator subtrees always move together.

**Tech Stack:** Bun, TypeScript, Electron, React, Jotai, Bun test, existing session JSONL persistence, existing renderer event processor.

---

### Task 1: Add canonical session hierarchy metadata

**Files:**
- Modify: `packages/core/src/types/session.ts`
- Modify: `packages/core/src/types/index.ts`
- Modify: `packages/shared/src/sessions/types.ts`
- Modify: `packages/shared/src/sessions/jsonl.ts`
- Modify: `packages/shared/src/sessions/storage.ts`
- Modify: `apps/electron/src/shared/types.ts`
- Modify: `apps/electron/src/renderer/atoms/sessions.ts`
- Create: `packages/shared/src/sessions/__tests__/hierarchy.test.ts`

**Step 1: Write the failing storage and metadata tests**

```ts
import { test, expect } from 'bun:test'
import { createSessionHeader, readSessionJsonl, writeSessionJsonl } from '../jsonl.ts'

test('session header preserves orchestrator hierarchy metadata', () => {
  const session = {
    id: '260308-parent',
    workspaceRootPath: '/tmp/workspace',
    createdAt: 1,
    lastUsedAt: 1,
    messages: [],
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, contextTokens: 0, costUsd: 0 },
    sessionKind: 'subagent',
    parentSessionId: '260308-root',
    orchestratorSessionId: '260308-root',
    agentRole: 'Explore',
    delegatedBySessionId: '260308-root',
    delegationLabel: 'Explore workspace sources',
    subagentStatus: 'running',
  }

  const header = createSessionHeader(session)

  expect(header.sessionKind).toBe('subagent')
  expect(header.parentSessionId).toBe('260308-root')
  expect(header.orchestratorSessionId).toBe('260308-root')
  expect(header.subagentStatus).toBe('running')
})
```

**Step 2: Run test to verify it fails**

Run:
```bash
bun test packages/shared/src/sessions/__tests__/hierarchy.test.ts -v
```

Expected: FAIL with missing session hierarchy fields on `SessionHeader`, `StoredSession`, or JSONL helpers.

**Step 3: Write minimal implementation**

Add the hierarchy fields to the canonical session types and thread them through JSONL header creation and metadata conversion:

```ts
export type SessionKind = 'orchestrator' | 'subagent'
export type SubagentStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface SessionConfig {
  // existing fields...
  sessionKind?: SessionKind
  parentSessionId?: string
  orchestratorSessionId?: string
  agentRole?: string
  delegatedBySessionId?: string
  delegationLabel?: string
  subagentStatus?: SubagentStatus
}
```

```ts
export function createSessionHeader(session: StoredSession): SessionHeader {
  return {
    // existing fields...
    sessionKind: session.sessionKind,
    parentSessionId: session.parentSessionId,
    orchestratorSessionId: session.orchestratorSessionId,
    agentRole: session.agentRole,
    delegatedBySessionId: session.delegatedBySessionId,
    delegationLabel: session.delegationLabel,
    subagentStatus: session.subagentStatus,
  }
}
```

**Step 4: Run tests to verify they pass**

Run:
```bash
bun test packages/shared/src/sessions/__tests__/hierarchy.test.ts -v
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/core/src/types/session.ts packages/core/src/types/index.ts packages/shared/src/sessions/types.ts packages/shared/src/sessions/jsonl.ts packages/shared/src/sessions/storage.ts apps/electron/src/shared/types.ts apps/electron/src/renderer/atoms/sessions.ts packages/shared/src/sessions/__tests__/hierarchy.test.ts
git commit -m "feat(sessions): add orchestrator hierarchy metadata"
```

### Task 2: Add child-session creation and session event contracts

**Files:**
- Modify: `apps/electron/src/main/sessions.ts`
- Modify: `apps/electron/src/shared/types.ts`
- Modify: `apps/electron/src/preload/index.ts`
- Create: `apps/electron/src/main/__tests__/session-event-contract.test.ts`

**Step 1: Write the failing session-event contract tests**

```ts
import { test, expect } from 'bun:test'
import type { SessionEvent } from '../../shared/types'

test('subagent_spawned event carries enough data to create a child session', () => {
  const event: SessionEvent = {
    type: 'subagent_spawned',
    sessionId: '260308-root',
    childSessionId: '260308-child-a',
    childSessionName: 'Explore workspace sources',
    agentRole: 'Explore',
    delegationLabel: 'Explore workspace sources',
    parentSessionId: '260308-root',
    orchestratorSessionId: '260308-root',
  }

  expect(event.childSessionId).toBe('260308-child-a')
})
```

**Step 2: Run test to verify it fails**

Run:
```bash
bun test apps/electron/src/main/__tests__/session-event-contract.test.ts -v
```

Expected: FAIL because `subagent_spawned` is not part of `SessionEvent`.

**Step 3: Write minimal implementation**

Introduce explicit child-session events in the shared renderer contract and wire them through the main session manager:

```ts
export type SessionEvent =
  | {
      type: 'subagent_spawned'
      sessionId: string
      childSessionId: string
      childSessionName: string
      agentRole: string
      delegationLabel: string
      parentSessionId: string
      orchestratorSessionId: string
    }
  | {
      type: 'subagent_status_changed'
      sessionId: string
      childSessionId: string
      subagentStatus: 'queued' | 'running' | 'completed' | 'failed'
    }
  // existing variants...
```

When a Task tool starts for a delegated child, create or hydrate a child session and emit `subagent_spawned` once, then emit `subagent_status_changed` on lifecycle changes.

**Step 4: Run tests to verify they pass**

Run:
```bash
bun test apps/electron/src/main/__tests__/session-event-contract.test.ts -v
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/electron/src/main/sessions.ts apps/electron/src/shared/types.ts apps/electron/src/preload/index.ts apps/electron/src/main/__tests__/session-event-contract.test.ts
git commit -m "feat(events): add subagent session lifecycle events"
```

### Task 3: Teach the renderer event processor to build child sessions

**Files:**
- Modify: `apps/electron/src/renderer/event-processor/types.ts`
- Modify: `apps/electron/src/renderer/event-processor/processor.ts`
- Modify: `apps/electron/src/renderer/event-processor/handlers/session.ts`
- Modify: `apps/electron/src/renderer/event-processor/useEventProcessor.ts`
- Modify: `apps/electron/src/renderer/App.tsx`
- Create: `apps/electron/src/renderer/event-processor/__tests__/subagent-tree.test.ts`

**Step 1: Write the failing event-processor tests**

```ts
import { test, expect } from 'bun:test'
import { processEvent } from '../processor'

test('subagent_spawned creates a child session without disturbing parent transcript', () => {
  const parent = createEmptySession('260308-root', 'workspace-1')
  const result = processEvent(
    { session: parent, streaming: null },
    {
      type: 'subagent_spawned',
      sessionId: '260308-root',
      childSessionId: '260308-child-a',
      childSessionName: 'Explore workspace sources',
      agentRole: 'Explore',
      delegationLabel: 'Explore workspace sources',
      parentSessionId: '260308-root',
      orchestratorSessionId: '260308-root',
    }
  )

  expect(result.effects).toContainEqual({
    type: 'child_session_created',
    sessionId: '260308-child-a',
  })
})
```

**Step 2: Run test to verify it fails**

Run:
```bash
bun test apps/electron/src/renderer/event-processor/__tests__/subagent-tree.test.ts -v
```

Expected: FAIL with unknown event type or missing effect.

**Step 3: Write minimal implementation**

Add child-session effects instead of trying to mutate multiple sessions inside the pure processor:

```ts
type Effect =
  | {
      type: 'child_session_created'
      sessionId: string
      parentSessionId: string
      orchestratorSessionId: string
      name: string
      agentRole: string
      delegationLabel: string
    }
  | {
      type: 'child_session_status_changed'
      sessionId: string
      subagentStatus: 'queued' | 'running' | 'completed' | 'failed'
    }
  // existing effects...
```

Handle those effects in `App.tsx` by updating the relevant `sessionAtomFamily` entries and `sessionMetaMapAtom`.

**Step 4: Run tests to verify they pass**

Run:
```bash
bun test apps/electron/src/renderer/event-processor/__tests__/subagent-tree.test.ts -v
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/electron/src/renderer/event-processor/types.ts apps/electron/src/renderer/event-processor/processor.ts apps/electron/src/renderer/event-processor/handlers/session.ts apps/electron/src/renderer/event-processor/useEventProcessor.ts apps/electron/src/renderer/App.tsx apps/electron/src/renderer/event-processor/__tests__/subagent-tree.test.ts
git commit -m "feat(renderer): build child sessions from orchestration events"
```

### Task 4: Add pure helpers for subtree filtering and nested list projection

**Files:**
- Create: `apps/electron/src/renderer/utils/session-tree.ts`
- Create: `apps/electron/src/renderer/utils/__tests__/session-tree.test.ts`
- Modify: `apps/electron/src/renderer/contexts/NavigationContext.tsx`
- Modify: `apps/electron/src/renderer/atoms/sessions.ts`

**Step 1: Write the failing tree-projection tests**

```ts
import { test, expect } from 'bun:test'
import { buildSessionTree, filterTreeForChatFilter } from '../session-tree'

test('children render only when their orchestrator matches the active filter', () => {
  const sessions = [
    { id: 'root', workspaceId: 'w1', todoState: 'needs-review', sessionKind: 'orchestrator' },
    { id: 'child-a', workspaceId: 'w1', parentSessionId: 'root', orchestratorSessionId: 'root', sessionKind: 'subagent' },
  ]

  const tree = buildSessionTree(sessions)
  const visible = filterTreeForChatFilter(tree, { kind: 'state', stateId: 'needs-review' })

  expect(visible).toHaveLength(1)
  expect(visible[0]?.children.map(child => child.id)).toEqual(['child-a'])
})
```

**Step 2: Run test to verify it fails**

Run:
```bash
bun test apps/electron/src/renderer/utils/__tests__/session-tree.test.ts -v
```

Expected: FAIL because the helper module does not exist.

**Step 3: Write minimal implementation**

Create a pure helper module that owns hierarchy rules:

```ts
export interface SessionTreeNode {
  session: SessionMeta
  children: SessionMeta[]
}

export function buildSessionTree(sessionMetas: SessionMeta[]): SessionTreeNode[] {
  const parents = sessionMetas.filter(s => s.sessionKind !== 'subagent')
  const childrenByParent = new Map<string, SessionMeta[]>()

  for (const meta of sessionMetas) {
    if (!meta.parentSessionId) continue
    const list = childrenByParent.get(meta.parentSessionId) ?? []
    list.push(meta)
    childrenByParent.set(meta.parentSessionId, list)
  }

  return parents.map(session => ({
    session,
    children: childrenByParent.get(session.id) ?? [],
  }))
}
```

Use these helpers in `NavigationContext` so slice filtering remains parent-owned.

**Step 4: Run tests to verify they pass**

Run:
```bash
bun test apps/electron/src/renderer/utils/__tests__/session-tree.test.ts -v
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/electron/src/renderer/utils/session-tree.ts apps/electron/src/renderer/utils/__tests__/session-tree.test.ts apps/electron/src/renderer/contexts/NavigationContext.tsx apps/electron/src/renderer/atoms/sessions.ts
git commit -m "feat(navigation): derive orchestrator subtree filtering"
```

### Task 5: Render nested child chats and preserve child-focused chat pages

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/SessionList.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/AppShell.tsx`
- Modify: `apps/electron/src/renderer/pages/ChatPage.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/ChatDisplay.tsx`
- Create: `apps/electron/src/renderer/utils/__tests__/child-unread-bubble.test.ts`

**Step 1: Write the failing UI-state tests**

```ts
import { test, expect } from 'bun:test'
import { bubbleUnreadToParent } from '../child-unread-bubble'

test('child unread marks the orchestrator row active', () => {
  const result = bubbleUnreadToParent({
    parent: { id: 'root', hasUnread: false },
    children: [{ id: 'child-a', hasUnread: true }],
  })

  expect(result.parentHasUnread).toBe(true)
})
```

**Step 2: Run test to verify it fails**

Run:
```bash
bun test apps/electron/src/renderer/utils/__tests__/child-unread-bubble.test.ts -v
```

Expected: FAIL because unread bubbling logic does not exist.

**Step 3: Write minimal implementation**

Update `SessionList.tsx` to render nested rows from the tree helper instead of a flat array, and keep `ChatPage.tsx` session-agnostic so child chats reuse the existing chat page and input flow:

```tsx
{tree.map(node => (
  <React.Fragment key={node.session.id}>
    <SessionItem item={node.session} /* existing props */ />
    {isExpanded(node.session.id) && node.children.map(child => (
      <SessionItem
        key={child.id}
        item={child}
        className="pl-6 opacity-90"
        isChild
        /* existing props */
      />
    ))}
  </React.Fragment>
))}
```

Keep the inline delegated activity in `ChatDisplay.tsx` unchanged except for any metadata needed to label the inline group with the new child-session name.

**Step 4: Run tests to verify they pass**

Run:
```bash
bun test apps/electron/src/renderer/utils/__tests__/child-unread-bubble.test.ts -v
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/SessionList.tsx apps/electron/src/renderer/components/app-shell/AppShell.tsx apps/electron/src/renderer/pages/ChatPage.tsx apps/electron/src/renderer/components/app-shell/ChatDisplay.tsx apps/electron/src/renderer/utils/__tests__/child-unread-bubble.test.ts
git commit -m "feat(ui): show nested subagent chats in session list"
```

### Task 6: Verify end-to-end behavior and document follow-up hooks

**Files:**
- Modify: `docs/plans/2026-03-08-multi-agent-orchestration-design.md`
- Modify: `docs/plans/2026-03-08-multi-agent-orchestration.md`

**Step 1: Run targeted tests**

Run:
```bash
bun test packages/shared/src/sessions/__tests__/hierarchy.test.ts -v
bun test apps/electron/src/main/__tests__/session-event-contract.test.ts -v
bun test apps/electron/src/renderer/event-processor/__tests__/subagent-tree.test.ts -v
bun test apps/electron/src/renderer/utils/__tests__/session-tree.test.ts -v
bun test apps/electron/src/renderer/utils/__tests__/child-unread-bubble.test.ts -v
```

Expected: PASS for all five targeted suites.

**Step 2: Run broader verification**

Run:
```bash
bun run test
bun run typecheck:all
bun run lint:electron
```

Expected:
- `bun run test`: PASS
- `bun run typecheck:all`: PASS
- `bun run lint:electron`: PASS

**Step 3: Smoke-check the UI manually**

Run:
```bash
bun run electron:dev
```

Verify:
- spawning a sub-agent creates a nested child row under the orchestrator
- child chat can be selected and messaged
- parent status slice controls child visibility
- orchestrator still shows expandable inline child activity
- child unread bubbles to the parent row

**Step 4: Record any implementation deltas**

If behavior differs from the approved design in a meaningful way, append a short implementation note to:

```md
## Implementation Delta

- Final child-row disclosure behavior differs from the original mock to match existing focus handling.
```

**Step 5: Commit**

```bash
git add docs/plans/2026-03-08-multi-agent-orchestration-design.md docs/plans/2026-03-08-multi-agent-orchestration.md
git commit -m "docs(plans): finalize multi-agent orchestration plan"
```
