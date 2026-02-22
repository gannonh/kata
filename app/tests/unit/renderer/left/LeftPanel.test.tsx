import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { LeftPanel } from '../../../../src/renderer/components/layout/LeftPanel'
import { LEFT_STATUS_SCENARIO_KEY } from '../../../../src/renderer/mock/project'

describe('LeftPanel', () => {
  afterEach(() => {
    window.localStorage.removeItem(LEFT_STATUS_SCENARIO_KEY)
    cleanup()
  })

  it('shows the agents tab by default with agent summaries', () => {
    render(<LeftPanel />)

    expect(screen.getByRole('tablist', { name: 'Left panel modules' })).toBeTruthy()
    expect(screen.getByLabelText('Left panel status')).toBeTruthy()
    expect(screen.getByText('Tasks ready to go.')).toBeTruthy()
    expect(screen.getByText('Agents write code, maintain notes, and coordinate tasks.')).toBeTruthy()
    expect(screen.getByText('MVP Planning Coordinator')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Collapse sidebar navigation' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Agents' })).toBeTruthy()
    expect(screen.queryByText('Model: gpt-5')).toBeNull()
    expect(screen.queryByText('Tokens: 5,356')).toBeNull()
  })

  it('renders status section above tab content', () => {
    render(<LeftPanel />)

    const statusSection = screen.getByLabelText('Left panel status')
    const agentsHeading = screen.getByRole('heading', { name: 'Agents' })

    expect(
      statusSection.compareDocumentPosition(agentsHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('supports overflow state scenario with rollup chips', () => {
    window.localStorage.setItem(LEFT_STATUS_SCENARIO_KEY, 'overflow')
    render(<LeftPanel />)

    expect(screen.getAllByText('25 done')).toHaveLength(2)
    expect(screen.getByText('50 of 60 complete.')).toBeTruthy()
  })

  it('toggles to busy preview when clicking the status section', () => {
    render(<LeftPanel />)

    const cyclePreviewStateButton = screen.getByRole('button', { name: 'Cycle status preview state' })
    const statusSection = screen.getByLabelText('Left panel status')

    expect(screen.getByText('Tasks ready to go.')).toBeTruthy()
    fireEvent.click(cyclePreviewStateButton)
    expect(screen.getByText('2 of 5 complete.')).toBeTruthy()
    fireEvent.click(cyclePreviewStateButton)
    expect(screen.getByText('3 of 5 complete.')).toBeTruthy()
    fireEvent.click(cyclePreviewStateButton)
    expect(screen.getByText('4 of 5 complete.')).toBeTruthy()
    expect(statusSection.querySelectorAll('[data-segment-status="done"]')).toHaveLength(4)
    expect(statusSection.querySelectorAll('[data-segment-status="in_progress"]')).toHaveLength(1)
    fireEvent.click(cyclePreviewStateButton)
    expect(screen.getByText('Tasks ready to go.')).toBeTruthy()
  })

  it('supports direct preview selection using the 0-1-2-3 controls', () => {
    render(<LeftPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Show preview state 2' }))

    expect(screen.getByText('3 of 5 complete.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show preview state 0' }))
    expect(screen.getByText('Tasks ready to go.')).toBeTruthy()
  })

  it('keeps the context tab count aligned to the context tab content when preview is active', () => {
    render(<LeftPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Cycle status preview state' }))
    const contextTab = screen.getByRole('tab', { name: 'Context' })

    expect(contextTab.getAttribute('title')).toBe('Context (6)')
  })

  it('switches to the context tab and renders the baseline context hierarchy', () => {
    render(<LeftPanel />)

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Context' }), { button: 0 })

    expect(screen.getByRole('heading', { name: 'Context' })).toBeTruthy()
    expect(screen.getByText('Project specs, tasks, and notes are stored as markdown files in')).toBeTruthy()
    const notesPath = screen.getByText('./notes')
    expect(notesPath.tagName).toBe('CODE')
    expect(notesPath.closest('p')?.textContent).toContain('in ./notes')
    expect(screen.getByTestId('context-spec-section')).toBeTruthy()
    expect(screen.queryByText('/tui-app/.workspace.')).toBeNull()
    expect(screen.getByText('Spec')).toBeTruthy()
    expect(screen.getByText('Create contracts and shared baseline components')).toBeTruthy()
    expect(screen.getByText('Implement left panel tabs')).toBeTruthy()
  })

  it('feeds the preview cycle into the context tab states', () => {
    render(<LeftPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Cycle status preview state' }))

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Context' }), { button: 0 })
    expect(screen.getByText('Notes')).toBeTruthy()
    expect(screen.getByText('Team Brainstorm - 2/22/26')).toBeTruthy()
    expect(screen.getByText('Scratchpad')).toBeTruthy()
    const teamNoteRow = screen.getByTestId('context-note-row-team-brainstorm-2-22-26')
    const scratchpadRow = screen.getByTestId('context-note-row-scratchpad')
    expect(teamNoteRow.querySelector('svg')).toBeNull()
    expect(scratchpadRow.querySelector('svg')).toBeNull()
  })

  it('switches to changes and files tabs', () => {
    render(<LeftPanel />)

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Changes' }), { button: 0 })
    expect(screen.getByRole('heading', { name: 'Changes' })).toBeTruthy()
    expect(screen.getByText('View and accept file changes.')).toBeTruthy()
    expect(screen.getByText('Your code lives in:')).toBeTruthy()
    expect(screen.getByText('UNSTAGED / NEW')).toBeTruthy()

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Files' }), { button: 0 })
    expect(screen.getByRole('heading', { name: 'Files' })).toBeTruthy()
    expect(screen.getByText(/Your copy of the repo lives in/)).toBeTruthy()
    expect(screen.getByLabelText('Search files')).toBeTruthy()
  })

  it('feeds the preview cycle into the changes tab click-through states', () => {
    render(<LeftPanel />)

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Changes' }), { button: 0 })
    expect(screen.getByText('No changes yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Archive and start new space' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Show preview state 1' }))
    expect(screen.getByText('PULL REQUESTS')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create PR' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Show preview state 2' }))
    expect(screen.getByText('3 files changed in Space')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Unstage all' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show preview state 3' }))
    expect(screen.getByText('3 files changed in Space')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Unstage all' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Show preview state 0' }))
    expect(screen.getByText('No changes yet')).toBeTruthy()
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
