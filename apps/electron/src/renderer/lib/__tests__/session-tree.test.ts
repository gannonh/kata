import { expect, test } from 'bun:test'

import type { SessionMeta } from '@/atoms/sessions'
import { getTopLevelSessions, projectSessionTree } from '../session-tree'

function createMeta(overrides: Partial<SessionMeta> & Pick<SessionMeta, 'id'>): SessionMeta {
  return {
    id: overrides.id,
    workspaceId: overrides.workspaceId ?? 'workspace-1',
    name: overrides.name,
    preview: overrides.preview,
    lastMessageAt: overrides.lastMessageAt ?? 1,
    sessionKind: overrides.sessionKind,
    parentSessionId: overrides.parentSessionId,
    orchestratorSessionId: overrides.orchestratorSessionId,
    agentRole: overrides.agentRole,
    delegatedBySessionId: overrides.delegatedBySessionId,
    delegatedToolUseId: overrides.delegatedToolUseId,
    delegationLabel: overrides.delegationLabel,
    subagentStatus: overrides.subagentStatus,
    todoState: overrides.todoState,
    labels: overrides.labels,
  }
}

test('getTopLevelSessions excludes subagents from direct filter ownership', () => {
  const sessions = [
    createMeta({ id: 'root-a', sessionKind: 'orchestrator', todoState: 'needs_review' }),
    createMeta({
      id: 'child-a1',
      sessionKind: 'subagent',
      parentSessionId: 'root-a',
      orchestratorSessionId: 'root-a',
      delegatedBySessionId: 'root-a',
    }),
    createMeta({ id: 'root-b', todoState: 'todo' }),
  ]

  expect(getTopLevelSessions(sessions).map(session => session.id)).toEqual(['root-a', 'root-b'])
})

test('projectSessionTree nests child sessions under visible orchestrators', () => {
  const rootA = createMeta({
    id: 'root-a',
    name: 'Coordinator',
    sessionKind: 'orchestrator',
    todoState: 'needs_review',
    lastMessageAt: 20,
  })
  const childA1 = createMeta({
    id: 'child-a1',
    name: 'Explore workspace sources',
    sessionKind: 'subagent',
    parentSessionId: 'root-a',
    orchestratorSessionId: 'root-a',
    delegatedBySessionId: 'root-a',
    lastMessageAt: 19,
  })
  const childA2 = createMeta({
    id: 'child-a2',
    name: 'Explore workspace skills',
    sessionKind: 'subagent',
    parentSessionId: 'root-a',
    orchestratorSessionId: 'root-a',
    delegatedBySessionId: 'root-a',
    lastMessageAt: 18,
  })
  const rootB = createMeta({
    id: 'root-b',
    name: 'Other chat',
    todoState: 'todo',
    lastMessageAt: 10,
  })

  const projected = projectSessionTree([rootA], [rootA, childA1, childA2, rootB])

  expect(projected.map(item => [item.id, item.depth, item.rootSessionId])).toEqual([
    ['root-a', 0, 'root-a'],
    ['child-a1', 1, 'root-a'],
    ['child-a2', 1, 'root-a'],
  ])
  expect(projected.every(item => item.rootLastMessageAt === rootA.lastMessageAt)).toBe(true)
})

test('projectSessionTree recursively includes descendant subagent sessions', () => {
  const root = createMeta({
    id: 'root-a',
    name: 'Coordinator',
    sessionKind: 'orchestrator',
    lastMessageAt: 30,
  })
  const child = createMeta({
    id: 'child-a1',
    name: 'Inspect workspace',
    sessionKind: 'subagent',
    parentSessionId: 'root-a',
    orchestratorSessionId: 'root-a',
    delegatedBySessionId: 'root-a',
    lastMessageAt: 20,
  })
  const grandchild = createMeta({
    id: 'grandchild-a1',
    name: 'Inspect package.json',
    sessionKind: 'subagent',
    parentSessionId: 'child-a1',
    orchestratorSessionId: 'root-a',
    delegatedBySessionId: 'child-a1',
    lastMessageAt: 10,
  })

  const projected = projectSessionTree([root], [root, child, grandchild])

  expect(projected.map(item => [item.id, item.depth, item.rootSessionId])).toEqual([
    ['root-a', 0, 'root-a'],
    ['child-a1', 1, 'root-a'],
    ['grandchild-a1', 2, 'root-a'],
  ])
})

test('projectSessionTree ignores children whose parent is not visible in the current slice', () => {
  const rootA = createMeta({
    id: 'root-a',
    sessionKind: 'orchestrator',
    todoState: 'needs_review',
    lastMessageAt: 20,
  })
  const hiddenRoot = createMeta({
    id: 'root-hidden',
    sessionKind: 'orchestrator',
    todoState: 'todo',
    lastMessageAt: 10,
  })
  const hiddenChild = createMeta({
    id: 'child-hidden',
    sessionKind: 'subagent',
    parentSessionId: 'root-hidden',
    orchestratorSessionId: 'root-hidden',
    delegatedBySessionId: 'root-hidden',
    lastMessageAt: 9,
  })

  const projected = projectSessionTree([rootA], [rootA, hiddenRoot, hiddenChild])

  expect(projected.map(item => item.id)).toEqual(['root-a'])
})

test('projectSessionTree includes deeper descendant sessions under the correct parent depth', () => {
  const root = createMeta({
    id: 'root-a',
    sessionKind: 'orchestrator',
    lastMessageAt: 30,
  })
  const child = createMeta({
    id: 'child-a1',
    sessionKind: 'subagent',
    parentSessionId: 'root-a',
    orchestratorSessionId: 'root-a',
    delegatedBySessionId: 'root-a',
    delegatedToolUseId: 'toolu-task-a',
    lastMessageAt: 20,
  })
  const grandchild = createMeta({
    id: 'child-a1-1',
    sessionKind: 'subagent',
    parentSessionId: 'child-a1',
    orchestratorSessionId: 'root-a',
    delegatedBySessionId: 'child-a1',
    delegatedToolUseId: 'toolu-task-b',
    lastMessageAt: 10,
  })

  const projected = projectSessionTree([root, child, grandchild], [root, child, grandchild])

  expect(projected.map(item => [item.id, item.depth])).toEqual([
    ['root-a', 0],
    ['child-a1', 1],
    ['child-a1-1', 2],
  ])
})

test('projectSessionTree keeps the ancestor chain when only a descendant matches the filter', () => {
  const root = createMeta({
    id: 'root-a',
    sessionKind: 'orchestrator',
    lastMessageAt: 30,
  })
  const child = createMeta({
    id: 'child-a1',
    sessionKind: 'subagent',
    parentSessionId: 'root-a',
    orchestratorSessionId: 'root-a',
    delegatedBySessionId: 'root-a',
    delegatedToolUseId: 'toolu-task-a',
    lastMessageAt: 20,
  })
  const grandchild = createMeta({
    id: 'child-a1-1',
    sessionKind: 'subagent',
    parentSessionId: 'child-a1',
    orchestratorSessionId: 'root-a',
    delegatedBySessionId: 'child-a1',
    delegatedToolUseId: 'toolu-task-b',
    lastMessageAt: 10,
    todoState: 'needs-review',
  })

  const projected = projectSessionTree([grandchild], [root, child, grandchild])

  expect(projected.map(item => [item.id, item.depth])).toEqual([
    ['root-a', 0],
    ['child-a1', 1],
    ['child-a1-1', 2],
  ])
})
