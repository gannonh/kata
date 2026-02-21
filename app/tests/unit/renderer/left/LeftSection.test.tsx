import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { LeftSection } from '../../../../src/renderer/components/left/LeftSection'

describe('LeftSection', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders section title, subtitle, and add action', () => {
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
    expect(screen.getByRole('button', { name: 'Add agent' })).toBeTruthy()
    expect(screen.getByText('Body content')).toBeTruthy()
  })
})
