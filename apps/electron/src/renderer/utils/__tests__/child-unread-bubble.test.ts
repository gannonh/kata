import { expect, test } from 'bun:test'

import type { SessionMeta } from '@/atoms/sessions'
import { bubbleUnreadToParent } from '../child-unread-bubble'

function createMeta(overrides: Partial<SessionMeta> & Pick<SessionMeta, 'id'>): SessionMeta {
  return {
    id: overrides.id,
    workspaceId: overrides.workspaceId ?? 'workspace-1',
    hasUnread: overrides.hasUnread,
    ...overrides,
  }
}

test('child unread marks the orchestrator row active', () => {
  const result = bubbleUnreadToParent({
    parent: createMeta({ id: 'root', hasUnread: false }),
    children: [createMeta({ id: 'child-a', hasUnread: true })],
  })

  expect(result.parentHasUnread).toBe(true)
})

test('parent unread stays active even when children are read', () => {
  const result = bubbleUnreadToParent({
    parent: createMeta({ id: 'root', hasUnread: true }),
    children: [createMeta({ id: 'child-a', hasUnread: false })],
  })

  expect(result.parentHasUnread).toBe(true)
})
