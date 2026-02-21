import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { LeftPanel } from '../../../../src/renderer/components/layout/LeftPanel'

describe('LeftPanel', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows the agents tab by default with agent summaries', () => {
    render(<LeftPanel />)

    expect(screen.getByRole('tablist', { name: 'Left panel modules' })).toBeTruthy()
    expect(screen.getByText('Agents write code, maintain notes, and coordinate tasks.')).toBeTruthy()
    expect(screen.getByText('MVP Planning Coordinator')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Collapse sidebar navigation' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Agents' })).toBeTruthy()
    expect(screen.queryByText('Model: gpt-5')).toBeNull()
    expect(screen.queryByText('Tokens: 5,356')).toBeNull()
  })

  it('switches to the context tab and renders the shared workspace checklist', () => {
    render(<LeftPanel />)

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Context' }), { button: 0 })

    expect(screen.getByRole('heading', { name: 'Context' })).toBeTruthy()
    expect(screen.getByText('Context about the task, shared with all agents on demand.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Open project spec' })).toBeNull()
    expect(screen.getByLabelText('Create contracts and shared baseline components')).toBeTruthy()
    expect(screen.getByLabelText('Implement left panel tabs')).toBeTruthy()
  })

  it('switches to changes and files tabs', () => {
    render(<LeftPanel />)

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Changes' }), { button: 0 })
    expect(screen.getByRole('heading', { name: 'Changes' })).toBeTruthy()
    expect(screen.getByText('View and accept file changes.')).toBeTruthy()
    expect(screen.getByText('Branch: feat/wave-2A-contracts')).toBeTruthy()

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Files' }), { button: 0 })
    expect(screen.getByRole('heading', { name: 'Files' })).toBeTruthy()
    expect(screen.getByText(/Your copy of the repo lives in/)).toBeTruthy()
    expect(screen.getByLabelText('Search files')).toBeTruthy()
  })

  it('collapses and expands the sidebar content area from the top toggle', () => {
    render(<LeftPanel />)

    const content = screen.getByTestId('left-panel-content')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar navigation' }))

    expect(content.getAttribute('aria-hidden')).toBe('true')
    expect(content.className).toContain('opacity-0')
    expect(screen.getByRole('button', { name: 'Expand sidebar navigation' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar navigation' }))

    expect(content.getAttribute('aria-hidden')).toBe('false')
    expect(content.className).toContain('opacity-100')
  })
})
