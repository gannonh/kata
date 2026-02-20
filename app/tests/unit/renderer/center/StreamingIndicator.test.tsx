import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StreamingIndicator } from '../../../../src/renderer/components/center/StreamingIndicator'

describe('StreamingIndicator', () => {
  it('renders pulsing streaming state copy', () => {
    const { getByTestId } = render(<StreamingIndicator />)

    expect(screen.getByText('Kata is streaming a response...')).toBeTruthy()
    expect(getByTestId('streaming-indicator').className).toContain('animate-pulse')
  })
})
