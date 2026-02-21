import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AgentCard } from '../../../../src/renderer/components/left/AgentCard'

const runningAgent = {
  id: 'agent-wave-3',
  name: 'Left Panel Agent',
  role: 'UI Integrator',
  status: 'running' as const,
  model: 'claude-3-7-sonnet',
  tokenUsage: { prompt: 1500, completion: 800, total: 2300 },
  currentTask: 'Reconciling tab API contracts',
  delegatedBy: 'MVP Planning Coordinator',
  lastUpdated: '2026-02-20T10:00:00.000Z'
}

describe('AgentCard', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('renders compact identity and task rows', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-20T10:12:00.000Z'))

    render(<AgentCard agent={runningAgent} />)

    expect(screen.getByText('Left Panel Agent')).toBeTruthy()
    expect(screen.getByText('Reconciling tab API contracts')).toBeTruthy()
    expect(screen.getByText('12m')).toBeTruthy()
  })

  it('renders hour-based relative time labels', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-20T12:15:00.000Z'))

    render(
      <AgentCard
        agent={{
          ...runningAgent,
          lastUpdated: '2026-02-20T10:00:00.000Z'
        }}
      />
    )

    expect(screen.getByText('2h')).toBeTruthy()
  })

  it('omits timestamp label when lastUpdated is invalid', () => {
    render(
      <AgentCard
        agent={{
          ...runningAgent,
          lastUpdated: 'not-a-date'
        }}
      />
    )

    expect(screen.queryByText(/^\d+[mhd]$/)).toBeNull()
  })

  it('hides model and token metadata in compact view', () => {
    render(<AgentCard agent={runningAgent} />)

    expect(screen.queryByText(/Model:/)).toBeNull()
    expect(screen.queryByText(/Tokens:/)).toBeNull()
  })

  it('renders delegated attribution when present', () => {
    render(<AgentCard agent={runningAgent} />)

    expect(screen.getByText('Delegated by MVP Planning Coordinator')).toBeTruthy()
  })

  it('renders status dot for all statuses', () => {
    const { rerender } = render(<AgentCard agent={{ ...runningAgent, status: 'idle' }} />)

    expect(within(screen.getByTestId('agent-row-status-dot')).getByText('Idle')).toBeTruthy()

    rerender(<AgentCard agent={{ ...runningAgent, status: 'running' }} />)
    expect(within(screen.getByTestId('agent-row-status-dot')).getByText('Running')).toBeTruthy()

    rerender(<AgentCard agent={{ ...runningAgent, status: 'blocked' }} />)
    expect(within(screen.getByTestId('agent-row-status-dot')).getByText('Blocked')).toBeTruthy()

    rerender(<AgentCard agent={{ ...runningAgent, status: 'complete' }} />)
    expect(within(screen.getByTestId('agent-row-status-dot')).getByText('Complete')).toBeTruthy()
  })
})
