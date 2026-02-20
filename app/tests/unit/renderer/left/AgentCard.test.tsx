import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AgentCard } from '../../../../src/renderer/components/left/AgentCard'

const runningAgent = {
  id: 'agent-wave-3',
  name: 'Left Panel Agent',
  role: 'UI Integrator',
  status: 'running' as const,
  model: 'claude-3-7-sonnet',
  tokenUsage: { prompt: 1500, completion: 800, total: 2300 },
  currentTask: 'Reconciling tab API contracts',
  lastUpdated: '2026-02-20T10:00:00.000Z'
}

describe('AgentCard', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders agent identity, status, model, tokens, and current task', () => {
    render(<AgentCard agent={runningAgent} />)

    expect(screen.getByText('Left Panel Agent')).toBeTruthy()
    expect(screen.getByText('UI Integrator')).toBeTruthy()
    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.getByText('Model: claude-3-7-sonnet')).toBeTruthy()
    expect(screen.getByText(`Tokens: ${(2300).toLocaleString()}`)).toBeTruthy()
    expect(screen.getByText('Reconciling tab API contracts')).toBeTruthy()
  })

  it('renders Idle status', () => {
    render(<AgentCard agent={{ ...runningAgent, status: 'idle' }} />)
    expect(screen.getByText('Idle')).toBeTruthy()
  })

  it('renders Blocked status', () => {
    render(<AgentCard agent={{ ...runningAgent, status: 'blocked' }} />)
    expect(screen.getByText('Blocked')).toBeTruthy()
  })

  it('renders Complete status', () => {
    render(<AgentCard agent={{ ...runningAgent, status: 'complete' }} />)
    expect(screen.getByText('Complete')).toBeTruthy()
  })
})
