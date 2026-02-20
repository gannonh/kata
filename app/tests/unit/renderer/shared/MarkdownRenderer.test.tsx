import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MarkdownRenderer } from '../../../../src/renderer/components/shared/MarkdownRenderer'

describe('MarkdownRenderer', () => {
  it('renders headings, bullet lists, and fenced code', () => {
    render(
      <MarkdownRenderer
        content={[
          '# Project Goal',
          '',
          '- First item',
          '- Second item',
          '',
          '```ts',
          'const ready = true',
          '```'
        ].join('\n')}
      />
    )

    expect(screen.getByRole('heading', { name: 'Project Goal', level: 1 })).toBeTruthy()
    expect(screen.getByText('First item')).toBeTruthy()
    expect(screen.getByText('Second item')).toBeTruthy()
    expect(screen.getByText('const ready = true')).toBeTruthy()
  })
})
