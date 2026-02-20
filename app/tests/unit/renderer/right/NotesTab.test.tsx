import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NotesTab } from '../../../../src/renderer/components/right/NotesTab'

describe('NotesTab', () => {
  it('renders a controlled textarea and reports updates', () => {
    const onNotesChange = vi.fn()

    render(
      <NotesTab
        notes="Initial notes"
        onNotesChange={onNotesChange}
      />
    )

    const input = screen.getByLabelText('Project notes')
    expect(screen.getByDisplayValue('Initial notes')).toBeTruthy()

    fireEvent.change(input, { target: { value: 'Updated notes value' } })

    expect(onNotesChange).toHaveBeenCalledWith('Updated notes value')
  })
})
