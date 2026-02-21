import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StatusBadge } from '../../../../src/renderer/components/shared/StatusBadge'

describe('StatusBadge', () => {
  it('renders label with tone styling', () => {
    render(
      <StatusBadge
        label="Running"
        tone="success"
      />
    )

    const badge = screen.getByText('Running')

    expect(badge).toBeTruthy()
    expect(badge.className).toContain('bg-primary')
  })
})
