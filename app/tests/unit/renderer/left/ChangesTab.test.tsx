import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ChangesTab } from '../../../../src/renderer/components/left/ChangesTab'
import { mockGit } from '../../../../src/renderer/mock/git'

describe('ChangesTab', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders branch summary and grouped file change lists', () => {
    render(<ChangesTab git={mockGit} />)

    expect(screen.getByRole('heading', { name: 'Changes' })).toBeTruthy()
    expect(screen.getByText('Branch: feat/wave-2A-contracts')).toBeTruthy()
    expect(screen.getByText('↑2 ↓0')).toBeTruthy()
    expect(screen.getByText('Staged (1)')).toBeTruthy()
    expect(screen.getByText('Unstaged (2)')).toBeTruthy()
    expect(screen.getByText('A src/renderer/components/shared/TabBar.tsx')).toBeTruthy()
    expect(screen.getByText('M src/renderer/mock/project.ts')).toBeTruthy()
    expect(screen.getByText('A src/renderer/components/shared/MarkdownRenderer.tsx')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create Commit' }).hasAttribute('disabled')).toBe(false)
  })

  it('disables commit action when no staged files exist', () => {
    render(
      <ChangesTab
        git={{
          ...mockGit,
          staged: []
        }}
      />
    )

    expect(screen.getByRole('button', { name: 'Create Commit' }).hasAttribute('disabled')).toBe(true)
  })
})
