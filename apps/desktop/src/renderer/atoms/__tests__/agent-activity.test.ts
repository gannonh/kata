import { describe, expect, test } from 'vitest'
import { createStore } from 'jotai'
import { AGENT_ACTIVITY_EVENT_CAP } from '@shared/types'
import {
  agentActivitySnapshotAtom,
  agentActivityUnseenCountAtom,
  applyAgentActivityUpdateAtom,
  filteredAgentActivityEventsAtom,
  setAgentActivityAutoFollowAtom,
  setAgentActivityModeAtom,
  agentActivitySourceFilterAtom,
  agentActivitySeverityFilterAtom,
  setPinnedEventAtom,
} from '../agent-activity'

describe('agent-activity atoms', () => {
  test('applies incremental updates by appending events and verbose entries', () => {
    const store = createStore()

    store.set(applyAgentActivityUpdateAtom, {
      generatedAt: '2026-04-23T16:00:00.000Z',
      appendedEvents: [
        {
          id: 'evt-1',
          timestamp: '2026-04-23T16:00:00.000Z',
          stream: 'events',
          source: 'runtime',
          severity: 'info',
          kind: 'runtime.phase_changed',
          message: 'Runtime ready.',
        },
      ],
      appendedVerbose: [
        {
          id: 'verb-1',
          timestamp: '2026-04-23T16:00:00.000Z',
          stream: 'verbose',
          source: 'runtime',
          severity: 'info',
          kind: 'runtime.diagnostics_updated',
          message: 'Diagnostics updated.',
        },
      ],
    })

    const snapshot = store.get(agentActivitySnapshotAtom)
    expect(snapshot.events).toHaveLength(1)
    expect(snapshot.verbose).toHaveLength(1)
  })

  test('upserts and removes pinned events through update deltas', () => {
    const store = createStore()

    store.set(applyAgentActivityUpdateAtom, {
      generatedAt: '2026-04-23T16:01:00.000Z',
      upsertedPinnedEvents: [
        {
          eventId: 'evt-err-1',
          pinnedAt: '2026-04-23T16:01:05.000Z',
          automatic: true,
          timestamp: '2026-04-23T16:01:00.000Z',
          source: 'runtime',
          kind: 'runtime.error',
          message: 'Runtime crashed.',
          severity: 'error',
        },
      ],
    })

    expect(store.get(agentActivitySnapshotAtom).pinnedEvents).toHaveLength(1)

    store.set(applyAgentActivityUpdateAtom, {
      generatedAt: '2026-04-23T16:02:00.000Z',
      removedPinnedEventIds: ['evt-err-1'],
    })

    expect(store.get(agentActivitySnapshotAtom).pinnedEvents).toHaveLength(0)
  })

  test('increments unseen count only when auto-follow is paused', () => {
    const store = createStore()

    store.set(setAgentActivityAutoFollowAtom, false)
    store.set(applyAgentActivityUpdateAtom, {
      generatedAt: '2026-04-23T16:03:00.000Z',
      appendedEvents: [
        {
          id: 'evt-2',
          timestamp: '2026-04-23T16:03:00.000Z',
          stream: 'events',
          source: 'worker',
          severity: 'info',
          kind: 'worker.state_changed',
          message: 'Worker moved.',
        },
        {
          id: 'evt-3',
          timestamp: '2026-04-23T16:03:01.000Z',
          stream: 'events',
          source: 'worker',
          severity: 'info',
          kind: 'worker.tool_changed',
          message: 'Tool switched.',
        },
      ],
      appendedVerbose: [
        {
          id: 'verb-2',
          timestamp: '2026-04-23T16:03:00.000Z',
          stream: 'verbose',
          source: 'worker',
          severity: 'info',
          kind: 'worker.trace',
          message: 'trace',
        },
      ],
    })
    expect(store.get(agentActivityUnseenCountAtom)).toBe(2)

    store.set(setAgentActivityModeAtom, 'verbose')
    store.set(setAgentActivityAutoFollowAtom, false)
    store.set(applyAgentActivityUpdateAtom, {
      generatedAt: '2026-04-23T16:04:00.000Z',
      appendedVerbose: [
        {
          id: 'verb-3',
          timestamp: '2026-04-23T16:04:00.000Z',
          stream: 'verbose',
          source: 'system',
          severity: 'warning',
          kind: 'system.warning',
          message: 'warning',
        },
      ],
    })
    expect(store.get(agentActivityUnseenCountAtom)).toBe(1)

    store.set(setAgentActivityAutoFollowAtom, true)
    expect(store.get(agentActivityUnseenCountAtom)).toBe(0)
  })

  test('filters rendered stream by source and severity', () => {
    const store = createStore()

    store.set(applyAgentActivityUpdateAtom, {
      generatedAt: '2026-04-23T16:05:00.000Z',
      appendedEvents: [
        {
          id: 'evt-4',
          timestamp: '2026-04-23T16:05:00.000Z',
          stream: 'events',
          source: 'runtime',
          severity: 'error',
          kind: 'runtime.error',
          message: 'Runtime error.',
        },
        {
          id: 'evt-5',
          timestamp: '2026-04-23T16:05:01.000Z',
          stream: 'events',
          source: 'worker',
          severity: 'info',
          kind: 'worker.state_changed',
          message: 'Worker info.',
        },
      ],
    })

    store.set(agentActivitySourceFilterAtom, 'runtime')
    store.set(agentActivitySeverityFilterAtom, 'error')

    const filtered = store.get(filteredAgentActivityEventsAtom)
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.id).toBe('evt-4')
  })

  test('applies event ring-buffer cap when incremental updates append beyond retention', () => {
    const store = createStore()
    const existingEvents = Array.from({ length: AGENT_ACTIVITY_EVENT_CAP }, (_, index) => ({
      id: `evt-${index + 1}`,
      timestamp: `2026-04-23T16:00:${String(index % 60).padStart(2, '0')}.000Z`,
      stream: 'events' as const,
      source: 'worker' as const,
      severity: 'info' as const,
      kind: 'worker.trace',
      message: `existing-${index + 1}`,
    }))

    store.set(agentActivitySnapshotAtom, {
      generatedAt: '2026-04-23T16:10:00.000Z',
      events: existingEvents,
      verbose: [],
      pinnedEvents: [],
    })

    store.set(applyAgentActivityUpdateAtom, {
      generatedAt: '2026-04-23T16:11:00.000Z',
      appendedEvents: [
        {
          id: 'evt-new',
          timestamp: '2026-04-23T16:11:00.000Z',
          stream: 'events',
          source: 'runtime',
          severity: 'info',
          kind: 'runtime.phase_changed',
          message: 'newest',
        },
      ],
    })

    const events = store.get(agentActivitySnapshotAtom).events
    expect(events).toHaveLength(AGENT_ACTIVITY_EVENT_CAP)
    expect(events[0]?.id).toBe('evt-2')
    expect(events.at(-1)?.id).toBe('evt-new')
  })

  test('preserves local snapshot when pin update request fails', async () => {
    const store = createStore()
    const existingSnapshot = {
      generatedAt: '2026-04-23T16:12:00.000Z',
      events: [
        {
          id: 'evt-1',
          timestamp: '2026-04-23T16:12:00.000Z',
          stream: 'events' as const,
          source: 'runtime' as const,
          severity: 'error' as const,
          kind: 'runtime.error',
          message: 'failure',
        },
      ],
      verbose: [],
      pinnedEvents: [
        {
          eventId: 'evt-1',
          pinnedAt: '2026-04-23T16:12:01.000Z',
          automatic: true,
          timestamp: '2026-04-23T16:12:00.000Z',
          source: 'runtime' as const,
          severity: 'error' as const,
          kind: 'runtime.error',
          message: 'failure',
        },
      ],
    }

    store.set(agentActivitySnapshotAtom, existingSnapshot)
    ;(globalThis as unknown as { window: any }).window = {
      api: {
        agentActivity: {
          setPinnedEvent: async () => ({
            success: false,
            eventId: 'evt-1',
            pinned: false,
            snapshot: {
              generatedAt: '2026-04-23T16:13:00.000Z',
              events: [],
              verbose: [],
              pinnedEvents: [],
            },
          }),
        },
      },
    }

    await store.set(setPinnedEventAtom, { eventId: 'evt-1', pinned: false })

    expect(store.get(agentActivitySnapshotAtom)).toEqual(existingSnapshot)
  })
})
