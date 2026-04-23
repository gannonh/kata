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
        dismissPinnedError: vi.fn(async () => ({
          success: true,
          incidentId: 'incident-1',
          snapshot: {
            generatedAt: new Date().toISOString(),
            events: [],
            verbose: [],
            pinnedErrors: [],
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
      pinnedErrors: [],
    })

    renderWithStore(store)

    expect(screen.getByText('Events row')).toBeTruthy()
    fireEvent.click(screen.getByTestId('agent-activity-mode-verbose'))
    await waitFor(() => expect(screen.getByText('Verbose row')).toBeTruthy())
  })

  test('renders pinned incidents and dismisses them', async () => {
    const dismissSpy = vi.fn(async () => ({
      success: true,
      incidentId: 'incident-1',
      snapshot: {
        generatedAt: new Date().toISOString(),
        events: [],
        verbose: [],
        pinnedErrors: [],
      },
    }))
    ;(window as unknown as { api: any }).api.agentActivity.dismissPinnedError = dismissSpy

    const store = createStore()
    store.set(agentActivitySnapshotAtom, {
      generatedAt: new Date().toISOString(),
      events: [],
      verbose: [],
      pinnedErrors: [
        {
          incidentId: 'incident-1',
          fingerprint: 'system|error',
          source: 'system',
          kind: 'system.error',
          message: 'Pinned error row',
          severity: 'error',
          firstSeenAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          occurrences: 1,
          lastEventId: 'evt-1',
        },
      ],
    })

    renderWithStore(store)

    expect(screen.getByText('Pinned error row')).toBeTruthy()
    fireEvent.click(screen.getByTestId('agent-activity-dismiss-incident-1'))
    await waitFor(() => expect(dismissSpy).toHaveBeenCalledWith('incident-1'))
  })

  test('shows jump-to-latest button when unseen events are present', () => {
    const store = createStore()
    store.set(agentActivityUnseenCountAtom, 3)

    renderWithStore(store)

    expect(screen.getByTestId('agent-activity-jump-latest')).toBeTruthy()
  })
})
