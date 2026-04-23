// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import {
  agentActivitySnapshotAtom,
  agentActivityUnseenCountAtom,
} from '@/atoms/agent-activity'
import { AgentActivityPane } from '../AgentActivityPane'

function renderWithStore(store = createStore()) {
  return render(
    <Provider store={store}>
      <AgentActivityPane />
    </Provider>,
  )
}

describe('AgentActivityPane', () => {
  beforeEach(() => {
    ;(window as unknown as { api: any }).api = {
      agentActivity: {
        setPinnedEvent: vi.fn(async (_eventId: string, _pinned: boolean) => ({
          success: true,
          eventId: 'evt-1',
          pinned: false,
          snapshot: {
            generatedAt: new Date().toISOString(),
            events: [],
            verbose: [],
            pinnedEvents: [],
          },
        })),
      },
    }
  })

  test('switches between events and verbose timeline modes', async () => {
    const store = createStore()
    store.set(agentActivitySnapshotAtom, {
      generatedAt: new Date().toISOString(),
      events: [
        {
          id: 'evt-1',
          timestamp: new Date().toISOString(),
          stream: 'events',
          source: 'runtime',
          severity: 'info',
          kind: 'runtime.phase_changed',
          message: 'Events row',
        },
      ],
      verbose: [
        {
          id: 'verb-1',
          timestamp: new Date().toISOString(),
          stream: 'verbose',
          source: 'system',
          severity: 'warning',
          kind: 'system.trace',
          message: 'Verbose row',
        },
      ],
      pinnedEvents: [],
    })

    renderWithStore(store)

    expect(screen.getByText('Events row')).toBeTruthy()
    fireEvent.click(screen.getByTestId('agent-activity-mode-verbose'))
    await waitFor(() => expect(screen.getByText('Verbose row')).toBeTruthy())
  })

  test('renders pinned events and unpins them', async () => {
    const setPinnedEventSpy = vi.fn(async () => ({
      success: true,
      eventId: 'evt-1',
      pinned: false,
      snapshot: {
        generatedAt: new Date().toISOString(),
        events: [],
        verbose: [],
        pinnedEvents: [],
      },
    }))
    ;(window as unknown as { api: any }).api.agentActivity.setPinnedEvent = setPinnedEventSpy

    const store = createStore()
    store.set(agentActivitySnapshotAtom, {
      generatedAt: new Date().toISOString(),
      events: [],
      verbose: [],
      pinnedEvents: [
        {
          eventId: 'evt-1',
          pinnedAt: new Date().toISOString(),
          automatic: true,
          timestamp: new Date().toISOString(),
          source: 'system',
          kind: 'system.error',
          message: 'Pinned error row',
          severity: 'error',
        },
      ],
    })

    renderWithStore(store)

    expect(screen.getByText('Pinned error row')).toBeTruthy()
    fireEvent.click(screen.getByTestId('agent-activity-dismiss-evt-1'))
    await waitFor(() => expect(setPinnedEventSpy).toHaveBeenCalledWith('evt-1', false))
  })

  test('shows jump-to-latest button when unseen events are present', () => {
    const store = createStore()
    store.set(agentActivityUnseenCountAtom, 3)

    renderWithStore(store)

    expect(screen.getByTestId('agent-activity-jump-latest')).toBeTruthy()
  })

  test('pins an event from the timeline', async () => {
    const setPinnedEventSpy = vi.fn(async () => ({
      success: true,
      eventId: 'evt-1',
      pinned: true,
      snapshot: {
        generatedAt: new Date().toISOString(),
        events: [],
        verbose: [],
        pinnedEvents: [],
      },
    }))
    ;(window as unknown as { api: any }).api.agentActivity.setPinnedEvent = setPinnedEventSpy

    const store = createStore()
    store.set(agentActivitySnapshotAtom, {
      generatedAt: new Date().toISOString(),
      events: [
        {
          id: 'evt-1',
          timestamp: new Date().toISOString(),
          stream: 'events',
          source: 'worker',
          severity: 'info',
          kind: 'cli.tool_start',
          message: 'Tool started',
        },
      ],
      verbose: [],
      pinnedEvents: [],
    })

    renderWithStore(store)
    fireEvent.click(screen.getByTestId('agent-activity-pin-evt-1'))
    await waitFor(() => expect(setPinnedEventSpy).toHaveBeenCalledWith('evt-1', true))
  })
})
