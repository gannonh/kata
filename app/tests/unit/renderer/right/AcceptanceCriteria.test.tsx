import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AcceptanceCriteria } from '../../../../src/renderer/components/right/AcceptanceCriteria'
import type { AcceptanceCriterion } from '../../../../src/renderer/types/project'

const criteria: AcceptanceCriterion[] = [
  { id: 'criterion-1', text: 'Right panel supports tabs', met: true },
  { id: 'criterion-2', text: 'Notes persist across tab switches', met: false }
]

describe('AcceptanceCriteria', () => {
  it('renders criteria and completion summary', () => {
    render(<AcceptanceCriteria criteria={criteria} />)

    expect(screen.getByText('1 of 2 met')).toBeTruthy()
    expect(screen.getByText('Right panel supports tabs')).toBeTruthy()
    expect(screen.getByText('Notes persist across tab switches')).toBeTruthy()
    expect(screen.getByText('Met')).toBeTruthy()
    expect(screen.getByText('Open')).toBeTruthy()
  })
})
