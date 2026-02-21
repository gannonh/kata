import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AgentsTab } from '../../../../src/renderer/components/left/AgentsTab'
import { mockAgents } from '../../../../src/renderer/mock/agents'

describe('AgentsTab', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('shows a background-agent summary row', () => {
    render(<AgentsTab agents={mockAgents} />)

    expect(screen.getByRole('button', { name: /background agents running/i })).toBeTruthy()
    expect(screen.getByText(/background agents running/i)).toBeTruthy()
  })

  it('renders empty state structure when no agents are available', () => {
    render(<AgentsTab agents={[]} />)

    expect(screen.getByRole('heading', { name: 'Agents' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /background agents running/i })).toBeNull()
  })

  it('expands and collapses delegated background agents', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-20T15:15:00.000Z'))

    render(<AgentsTab agents={mockAgents} />)

    const toggle = screen.getByRole('button', { name: /background agents running/i })

    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Task Block Parser')).toBeTruthy()
    expect(screen.getAllByText(/Delegated by MVP Planning Coordinator/).length).toBeGreaterThan(0)

    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Task Block Parser')).toBeNull()
  })

  it('omits background summary when coordinator has no children or siblings', () => {
    const coordinatorOnly = {
      ...mockAgents[0],
      children: undefined
    }

    render(<AgentsTab agents={[coordinatorOnly]} />)

    expect(screen.queryByRole('button', { name: /background agents running/i })).toBeNull()
    expect(screen.queryByText('Task Block Parser')).toBeNull()
  })
})
