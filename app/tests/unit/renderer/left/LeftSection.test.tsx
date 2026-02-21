import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LeftSection } from '../../../../src/renderer/components/left/LeftSection'

describe('LeftSection', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders section title, subtitle, and disabled add action by default', () => {
    render(
      <LeftSection
        title="Agents"
        description="Agents write code, maintain notes, and coordinate tasks."
        addActionLabel="Add agent"
      >
        <div>Body content</div>
      </LeftSection>
    )

    expect(screen.getByRole('heading', { name: 'Agents' })).toBeTruthy()
    expect(screen.getByText('Agents write code, maintain notes, and coordinate tasks.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add agent' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Body content')).toBeTruthy()
  })

  it('runs add action callback when provided', () => {
    const onAddAction = vi.fn()

    render(
      <LeftSection
        title="Agents"
        description="Agents write code, maintain notes, and coordinate tasks."
        addActionLabel="Add agent"
        onAddAction={onAddAction}
      >
        <div>Body content</div>
      </LeftSection>
    )

    const addActionButton = screen.getByRole('button', { name: 'Add agent' })
    expect(addActionButton.hasAttribute('disabled')).toBe(false)

    fireEvent.click(addActionButton)

    expect(onAddAction).toHaveBeenCalledTimes(1)
  })
})
