import { createStore } from 'jotai'
import { describe, expect, test } from 'vitest'
import type { SessionListItem } from '@shared/types'
import {
  archiveSessionAtom,
  archivedSessionsAtom,
  currentSessionIdAtom,
  sessionListAtom,
  unarchiveSessionAtom,
  visibleSessionListAtom,
  workingDirectoryAtom,
} from '../session'

function createSession(overrides: Partial<SessionListItem>): SessionListItem {
  const now = new Date().toISOString()

  return {
    id: 'session-id',
    path: '/tmp/session.jsonl',
    name: null,
    title: 'Session title',
    model: null,
    provider: null,
    created: now,
    modified: now,
    messageCount: 0,
    firstMessagePreview: null,
    ...overrides,
  }
}

describe('session archive atoms', () => {
  test('archives a session for the active workspace and hides it from the sidebar list', async () => {
    const store = createStore()
    store.set(archivedSessionsAtom, [])
    const first = createSession({ id: 's1', title: 'First session' })
    const second = createSession({ id: 's2', title: 'Second session' })

    store.set(workingDirectoryAtom, '/workspace/alpha')
    store.set(sessionListAtom, [first, second])
    store.set(currentSessionIdAtom, first.id)

    await store.set(archiveSessionAtom, second)

    const archived = store.get(archivedSessionsAtom)
    expect(archived).toHaveLength(1)
    expect(archived[0]).toMatchObject({
      sessionId: second.id,
      title: second.title,
      projectDir: '/workspace/alpha',
    })

    const visible = store.get(visibleSessionListAtom)
    expect(visible.map((item) => item.id)).toEqual([first.id])
  })

  test('unarchive restores a hidden session to the visible sidebar list', async () => {
    const store = createStore()
    store.set(archivedSessionsAtom, [])
    const archivedSession = createSession({ id: 's-archived', title: 'Archived session' })

    store.set(workingDirectoryAtom, '/workspace/alpha')
    store.set(sessionListAtom, [archivedSession])

    await store.set(archiveSessionAtom, archivedSession)
    expect(store.get(visibleSessionListAtom)).toHaveLength(0)

    store.set(unarchiveSessionAtom, {
      sessionId: archivedSession.id,
      projectDir: '/workspace/alpha',
    })

    const visible = store.get(visibleSessionListAtom)
    expect(visible.map((item) => item.id)).toEqual([archivedSession.id])
  })

  test('archiving the current session with no remaining visible sessions clears selection', async () => {
    const store = createStore()
    store.set(archivedSessionsAtom, [])
    const onlySession = createSession({ id: 'only', title: 'Only session' })

    store.set(workingDirectoryAtom, '/workspace/solo')
    store.set(sessionListAtom, [onlySession])
    store.set(currentSessionIdAtom, onlySession.id)

    await store.set(archiveSessionAtom, onlySession)

    expect(store.get(currentSessionIdAtom)).toBeNull()
    expect(store.get(visibleSessionListAtom)).toHaveLength(0)
  })
})
