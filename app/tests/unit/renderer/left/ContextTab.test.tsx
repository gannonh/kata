import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ContextTab } from '../../../../src/renderer/components/left/ContextTab'
import { mockProject } from '../../../../src/renderer/mock/project'

describe('ContextTab', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the baseline spec-only state', () => {
    render(<ContextTab project={mockProject} />)

    expect(screen.getByRole('heading', { name: 'Context' })).toBeTruthy()
    expect(screen.getByText('Project specs, tasks, and notes are stored as markdown files in')).toBeTruthy()
    const notesPath = screen.getByText('./notes')
    expect(notesPath.tagName).toBe('CODE')
    expect(notesPath.className).toContain('font-mono')
    expect(notesPath.className).toContain('whitespace-nowrap')
    expect(notesPath.className).toContain('text-[10px]')
    expect(notesPath.closest('p')?.textContent).toContain('in ./notes')
    const specSection = screen.getByTestId('context-spec-section')
    expect(specSection.className).toContain('pt-2')
    expect(screen.getByText('Spec')).toBeTruthy()
    expect(screen.getByText('Scaffold Rust project with dependencies')).toBeTruthy()
    expect(screen.getByText('Wire everything together in main and test end-to-end')).toBeTruthy()
    expect(screen.queryByText('/tui-app/.workspace.')).toBeNull()
    expect(screen.queryByText('Notes')).toBeNull()
    expect(screen.queryByText('Add context')).toBeNull()
  })

  it('renders the spec + notes state', () => {
    render(
      <ContextTab
        project={mockProject}
        previewState={1}
      />
    )

    expect(screen.getByText('Notes')).toBeTruthy()
    expect(screen.getByText('Team Brainstorm - 2/22/26')).toBeTruthy()
    expect(screen.getByText('Scratchpad')).toBeTruthy()
    expect(screen.getByTestId('context-notes-heading').className).toContain('text-foreground/95')
    const teamNoteRow = screen.getByTestId('context-note-row-team-brainstorm-2-22-26')
    const scratchpadRow = screen.getByTestId('context-note-row-scratchpad')
    expect(teamNoteRow.querySelector('svg')).toBeNull()
    expect(scratchpadRow.querySelector('svg')).toBeNull()
    expect(teamNoteRow.className).toMatch(/\bpy-0\.5\b/)
    expect(scratchpadRow.className).toMatch(/\bpy-0\.5\b/)
    expect(teamNoteRow.className).not.toMatch(/\bpy-1\.5\b/)
  })

  it('renders the selected active-task state with mixed statuses', () => {
    render(
      <ContextTab
        project={mockProject}
        previewState={2}
      />
    )

    expect(screen.queryByText('/following-build-2/.workspace.')).toBeNull()
    expect(screen.queryByText('Add context')).toBeNull()
    expect(screen.getByText('Implement real model provider runtime and authentication')).toBeTruthy()
    expect(screen.queryByText('Notes')).toBeNull()

    const section = screen.getByTestId('context-tab')
    expect(section.querySelectorAll('[data-context-task-status="in_progress"]')).toHaveLength(4)
    expect(section.querySelectorAll('[data-context-task-status="done"]')).toHaveLength(1)
    expect(section.querySelectorAll('[data-context-task-status="todo"]')).toHaveLength(6)
    expect(section.querySelectorAll('[data-context-task-badge]')).toHaveLength(5)
  })

  it('renders the full state with notes shown and no selected note row', () => {
    render(
      <ContextTab
        project={mockProject}
        previewState={3}
      />
    )

    expect(screen.getByText('Notes')).toBeTruthy()
    expect(screen.getByText('Team Brainstorm - 2/22/26')).toBeTruthy()
    expect(screen.getByText('Scratchpad')).toBeTruthy()
    const noteRow = screen.getByTestId('context-note-row-team-brainstorm-2-22-26')
    expect(noteRow.getAttribute('data-context-note-selected')).toBe('false')
  })
})
