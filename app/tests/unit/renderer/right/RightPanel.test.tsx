import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RightPanel } from '../../../../src/renderer/components/layout/RightPanel'
import { mockProject } from '../../../../src/renderer/mock/project'

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
    fireEvent.click(notesTab)

    const notesInput = screen.getByLabelText('Project notes')
    fireEvent.change(notesInput, { target: { value: 'Capture review follow-up items.' } })

    fireEvent.click(screen.getByRole('tab', { name: 'Spec' }))
    fireEvent.click(notesTab)

    expect(screen.getByDisplayValue('Capture review follow-up items.')).toBeTruthy()
  })
})
