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

  it('renders paragraph blocks, heading size variants, and language-free code fences', () => {
    render(
      <MarkdownRenderer
        content={[
          '## Milestone',
          '',
          '#### Notes',
          '',
          'The first paragraph line',
          'continues on the next line',
          '',
          '```',
          'plain text block',
          '```'
        ].join('\n')}
      />
    )

    const milestoneHeading = screen.getByRole('heading', { name: 'Milestone', level: 2 })
    const notesHeading = screen.getByRole('heading', { name: 'Notes', level: 4 })
    const paragraph = screen.getByText('The first paragraph line continues on the next line')
    const code = screen.getByText('plain text block')

    expect(milestoneHeading.className).toContain('text-xl')
    expect(notesHeading.className).toContain('text-lg')
    expect(paragraph).toBeTruthy()
    expect(code.closest('code')?.className).toBe('')
  })

  it('handles unterminated fenced code blocks by consuming remaining lines', () => {
    render(
      <MarkdownRenderer
        content={['```bash', 'echo ready', 'echo done'].join('\n')}
      />
    )

    const codeNode = screen.getByText((_, node) => node?.tagName === 'CODE' && node.textContent === 'echo ready\necho done')
    expect(codeNode).toBeTruthy()
  })
})
