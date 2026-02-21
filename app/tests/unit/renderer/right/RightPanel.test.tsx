import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { RightPanel } from '../../../../src/renderer/components/layout/RightPanel'
import { mockProject } from '../../../../src/renderer/mock/project'
import type { ProjectSpec } from '../../../../src/renderer/types/project'

afterEach(() => {
  cleanup()
})

describe('RightPanel', () => {
  it('shows spec content by default and supports notes editing across tab switches', () => {
    render(<RightPanel project={mockProject} />)

    expect(screen.getByRole('tablist', { name: 'Right panel tabs' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Goal' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Architecture' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Acceptance Criteria' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Non-Goals' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Assumptions' })).toBeTruthy()

    const notesTab = screen.getByRole('tab', { name: 'Notes' })
    fireEvent.mouseDown(notesTab, { button: 0 })

    const notesInput = screen.getByLabelText('Project notes')
    fireEvent.change(notesInput, { target: { value: 'Capture review follow-up items.' } })

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Spec' }), { button: 0 })
    fireEvent.mouseDown(notesTab, { button: 0 })

    expect(screen.getByDisplayValue('Capture review follow-up items.')).toBeTruthy()
  })

  it('resets notes when the selected project changes', () => {
    const nextProject: ProjectSpec = {
      ...mockProject,
      id: 'phase-2',
      name: 'Kata Desktop App - Phase 2',
      notes: 'Fresh project notes from the next phase.'
    }

    const { rerender } = render(<RightPanel project={mockProject} />)

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Notes' }), { button: 0 })
    fireEvent.change(screen.getByLabelText('Project notes'), { target: { value: 'Edited old project notes.' } })

    rerender(<RightPanel project={nextProject} />)

    expect(screen.getByDisplayValue('Fresh project notes from the next phase.')).toBeTruthy()
  })

  it('toggles right column collapse state', () => {
    render(<RightPanel project={mockProject} />)

    const collapseButton = screen.getByRole('button', { name: 'Collapse right column' })
    const specHeading = screen.getByRole('heading', { name: 'Spec', level: 2 })
    const content = specHeading.parentElement

    expect(content).toBeTruthy()
    expect(content?.className).toContain('opacity-100')

    fireEvent.click(collapseButton)

    expect(screen.getByRole('button', { name: 'Expand right column' })).toBeTruthy()
    expect(content?.className).toContain('opacity-0')
    expect(content?.className).toContain('pointer-events-none')

    fireEvent.click(screen.getByRole('button', { name: 'Expand right column' }))

    expect(screen.getByRole('button', { name: 'Collapse right column' })).toBeTruthy()
    expect(content?.className).toContain('opacity-100')
  })
})
