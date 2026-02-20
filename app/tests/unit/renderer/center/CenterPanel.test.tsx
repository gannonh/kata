import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CenterPanel } from '../../../../src/renderer/components/center/CenterPanel'

describe('CenterPanel', () => {
  it('renders full-height chat wrapper with heading and content slot', () => {
    const { getByTestId } = render(
      <CenterPanel>
        <div>chat content</div>
      </CenterPanel>
    )

    expect(screen.getByRole('heading', { name: 'Orchestrator Chat' })).toBeTruthy()
    expect(screen.getByText('chat content')).toBeTruthy()
    expect(getByTestId('center-panel').className).toContain('h-full')
  })
})
