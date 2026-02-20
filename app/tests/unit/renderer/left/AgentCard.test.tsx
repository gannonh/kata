import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AgentCard } from '../../../../src/renderer/components/left/AgentCard'

describe('AgentCard', () => {
  it('renders agent identity, status, model, tokens, and current task', () => {
    render(
      <AgentCard
        agent={{
          id: 'agent-wave-3',
          name: 'Left Panel Agent',
          role: 'UI Integrator',
          status: 'running',
          model: 'claude-3-7-sonnet',
          tokenUsage: {
            prompt: 1500,
            completion: 800,
            total: 2300
          },
          currentTask: 'Reconciling tab API contracts',
          lastUpdated: '2026-02-20T10:00:00.000Z'
        }}
      />
    )

    expect(screen.getByText('Left Panel Agent')).toBeTruthy()
    expect(screen.getByText('UI Integrator')).toBeTruthy()
    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.getByText('Model: claude-3-7-sonnet')).toBeTruthy()
    expect(screen.getByText('Tokens: 2,300')).toBeTruthy()
    expect(screen.getByText('Reconciling tab API contracts')).toBeTruthy()
  })
})
