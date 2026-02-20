import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CollapsibleSection } from '../../../../src/renderer/components/shared/CollapsibleSection'

describe('CollapsibleSection', () => {
  it('toggles section visibility from header button', () => {
    render(
      <CollapsibleSection title="Workspace Context">
        <p>Spec and task links</p>
      </CollapsibleSection>
    )

    const toggle = screen.getByRole('button', { name: 'Workspace Context' })

    expect(screen.getByText('Spec and task links')).toBeTruthy()

    fireEvent.click(toggle)
    expect(screen.queryByText('Spec and task links')).toBeNull()

    fireEvent.click(toggle)
    expect(screen.getByText('Spec and task links')).toBeTruthy()
  })
})
