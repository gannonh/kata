import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ChangesTab } from '../../../../src/renderer/components/left/ChangesTab'
import { mockGit } from '../../../../src/renderer/mock/git'

describe('ChangesTab', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders an empty changes state with archive action affordance in preview 0', () => {
    render(
      <ChangesTab
        git={mockGit}
        previewState={0}
      />
    )

    expect(screen.getByRole('heading', { name: 'Changes' })).toBeTruthy()
    expect(screen.getByText('View and accept file changes.')).toBeTruthy()
    expect(screen.getByText('No changes yet')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Stage all' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Archive and start new space' })).toBeTruthy()
    expect(screen.getByText('Continue working on this repo in a fresh workspace')).toBeTruthy()
  })

  it('renders a pull request handoff state in preview 1', () => {
    render(
      <ChangesTab
        git={mockGit}
        previewState={1}
      />
    )

    expect(screen.getByText('No changes yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create PR' })).toBeTruthy()
    expect(screen.getByText('PULL REQUESTS')).toBeTruthy()
    expect(screen.getByText('Please authenticate with Augment first.')).toBeTruthy()
    expect(screen.getByText('Run auggie login in your terminal.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Merge' })).toBeTruthy()
  })

  it('renders an unstaged-heavy preview state in preview 2', () => {
    render(
      <ChangesTab
        git={{
          ...mockGit,
          staged: []
        }}
        previewState={2}
      />
    )

    expect(screen.getByText('UNSTAGED / NEW')).toBeTruthy()
    expect(screen.getByText('STAGED / APPROVED')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stage all' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Unstage all' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Commit' }).hasAttribute('disabled')).toBe(true)
  })

  it('renders timeline-style baseline hierarchy with grouped actions in preview 3', () => {
    render(
      <ChangesTab
        git={mockGit}
        previewState={3}
      />
    )

    expect(screen.getByText('Your code lives in:')).toBeTruthy()
    expect(screen.getByText('and will be merged into:')).toBeTruthy()
    expect(screen.getByText(mockGit.branch)).toBeTruthy()
    expect(screen.getByText('main')).toBeTruthy()
    expect(screen.getByText('3 files changed in Space')).toBeTruthy()
    expect(screen.getByText('UNSTAGED / NEW')).toBeTruthy()
    expect(screen.getByText('STAGED / APPROVED')).toBeTruthy()
    expect(screen.getByText('COMMITS')).toBeTruthy()
    expect(screen.getByText('TabBar.tsx')).toBeTruthy()
    expect(screen.getByText('project.ts')).toBeTruthy()
    expect(screen.getByText('MarkdownRenderer.tsx')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stage all' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Unstage all' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Commit' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Merge' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Connect Remote' })).toBeTruthy()
  })
})
