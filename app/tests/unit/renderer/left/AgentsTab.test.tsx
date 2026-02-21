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

  it('expands and collapses delegated background agents', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-20T15:15:00.000Z'))

    render(<AgentsTab agents={mockAgents} />)

    const toggle = screen.getByRole('button', { name: /background agents running/i })

    fireEvent.click(toggle)

    expect(screen.getByText('Task Block Parser')).toBeTruthy()
    expect(screen.getAllByText(/Delegated by MVP Planning Coordinator/).length).toBeGreaterThan(0)

    fireEvent.click(toggle)

    expect(screen.queryByText('Task Block Parser')).toBeNull()
  })
})
