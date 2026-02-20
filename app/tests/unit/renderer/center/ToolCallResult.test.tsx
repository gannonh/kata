import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ToolCallResult } from '../../../../src/renderer/components/center/ToolCallResult'

describe('ToolCallResult', () => {
  it('renders collapsible tool metadata and formatted arguments/output', () => {
    render(
      <ToolCallResult
        toolCall={{
          id: 'tool-1',
          name: 'read_file',
          args: { path: '.planning/STATE.md' },
          output: 'Current phase: 2'
        }}
      />
    )

    const toggle = screen.getByRole('button', { name: 'Tool: read_file' })
    expect(toggle).toBeTruthy()
    expect(screen.queryByText('"path": ".planning/STATE.md"')).toBeNull()

    fireEvent.click(toggle)

    const argumentsCode = screen.getByText(
      (_, node) =>
        node?.tagName === 'CODE' &&
        node.className.includes('language-json') &&
        node.textContent?.includes('"path": ".planning/STATE.md"') === true
    )

    expect(argumentsCode).toBeTruthy()
    expect(screen.getByText('Current phase: 2')).toBeTruthy()
    expect(screen.getByText((_, node) => node?.tagName === 'CODE' && node.textContent?.includes('Current phase: 2') === true).className).toContain('language-text')
  })
})
