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

  it('uses distinct styles for info and warning tones', () => {
    render(
      <>
        <StatusBadge
          label="Info"
          tone="info"
        />
        <StatusBadge
          label="Warning"
          tone="warning"
        />
      </>
    )

    const infoBadge = screen.getByText('Info')
    const warningBadge = screen.getByText('Warning')

    expect(infoBadge.className).toContain('text-sky-700')
    expect(warningBadge.className).toContain('text-amber-800')
  })
})
