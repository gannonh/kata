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

  it('renders right slot content and supports default closed state', () => {
    render(
      <CollapsibleSection
        title="Agent Notes"
        defaultOpen={false}
        rightSlot={<span>2 items</span>}
      >
        <p>Collapsed by default</p>
      </CollapsibleSection>
    )

    const toggle = screen.getByRole('button', { name: 'Agent Notes' })

    expect(screen.getByText('2 items')).toBeTruthy()
    expect(screen.queryByText('Collapsed by default')).toBeNull()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(toggle)

    expect(screen.getByText('Collapsed by default')).toBeTruthy()
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })
})
