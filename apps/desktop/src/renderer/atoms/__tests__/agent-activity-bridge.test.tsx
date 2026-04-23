// @vitest-environment jsdom

import { Provider, createStore } from 'jotai'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import type { AgentActivitySnapshotResponse, AgentActivityUpdate } from '@shared/types'
import { agentActivitySnapshotAtom, useAgentActivityBridge } from '../agent-activity'

function BridgeHarness() {
  useAgentActivityBridge()
  return null
}

describe('useAgentActivityBridge', () => {
  test('hydrates snapshot even when a push update arrives before snapshot resolves', async () => {
    const store = createStore()
    let updateListener: ((update: AgentActivityUpdate) => void) | null = null
    let resolveSnapshot: ((value: AgentActivitySnapshotResponse) => void) | null = null

    const snapshotPromise = new Promise<AgentActivitySnapshotResponse>((resolve) => {
      resolveSnapshot = resolve
    })

    ;(window as any).api = {
      agentActivity: {
        onUpdate: (listener: (update: AgentActivityUpdate) => void) => {
          updateListener = listener
          return () => {
            updateListener = null
          }
        },
        getSnapshot: vi.fn(async () => snapshotPromise),
        setPinnedEvent: vi.fn(async () => ({
          success: true,
          eventId: 'evt-live',
          pinned: true,
          snapshot: {
            generatedAt: '2026-04-23T16:20:01.000Z',
            events: [],
            verbose: [],
            pinnedEvents: [],
          },
        })),
      },
    }

    render(
      <Provider store={store}>
        <BridgeHarness />
      </Provider>,
    )

    if (!updateListener) {
      throw new Error('expected update listener to be registered')
    }

    ;(updateListener as (update: AgentActivityUpdate) => void)({
      generatedAt: '2026-04-23T16:20:01.000Z',
      appendedEvents: [
        {
          id: 'evt-live',
          timestamp: '2026-04-23T16:20:01.000Z',
          stream: 'events',
          source: 'worker',
          severity: 'info',
          kind: 'worker.state_changed',
          message: 'live update',
        },
      ],
    })

    if (!resolveSnapshot) {
      throw new Error('expected snapshot resolver to be initialized')
    }

    ;(resolveSnapshot as (value: AgentActivitySnapshotResponse) => void)({
      success: true,
      snapshot: {
        generatedAt: '2026-04-23T16:20:00.000Z',
        events: [
          {
            id: 'evt-hydrated',
            timestamp: '2026-04-23T16:20:00.000Z',
            stream: 'events',
            source: 'runtime',
            severity: 'info',
            kind: 'runtime.phase_changed',
            message: 'hydrated snapshot',
          },
        ],
        verbose: [],
        pinnedEvents: [],
      },
    })

    await waitFor(() => {
      const eventIds = store.get(agentActivitySnapshotAtom).events.map((event) => event.id)
      expect(eventIds).toEqual(['evt-hydrated', 'evt-live'])
    })
  })
})
