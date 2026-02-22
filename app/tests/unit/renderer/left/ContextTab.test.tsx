import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  ContextTab,
  NOTES_SECTION_SIZE,
  getContextTabCount
} from '../../../../src/renderer/components/left/ContextTab'
import { mockProject } from '../../../../src/renderer/mock/project'
import type { ProjectSpec } from '../../../../src/renderer/types/project'

const projectWithVariedTaskStates: ProjectSpec = {
  ...mockProject,
  tasks: [
    { id: 'ctx-task-done', title: 'Ship window chrome baseline', status: 'done' },
    { id: 'ctx-task-active', title: 'Implement context tab state model', status: 'in_progress' },
    { id: 'ctx-task-blocked', title: 'Resolve IPC preload dependency', status: 'blocked' },
    { id: 'ctx-task-todo', title: 'Finalize docs and screenshots', status: 'todo' }
  ]
}

describe('ContextTab', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the baseline state from project tasks', () => {
    render(<ContextTab project={mockProject} />)

    expect(screen.getByRole('heading', { name: 'Context' })).toBeTruthy()
    expect(screen.getByText('Project specs, tasks, and notes are stored as markdown files in')).toBeTruthy()
    const notesPath = screen.getByText('./notes')
    expect(notesPath.tagName).toBe('CODE')
    expect(notesPath.closest('p')?.textContent).toContain('in ./notes')
    expect(screen.getByTestId('context-spec-section')).toBeTruthy()
    expect(screen.getByText('Spec')).toBeTruthy()
    expect(screen.getByText(mockProject.tasks[0].title)).toBeTruthy()
    expect(screen.getByText(mockProject.tasks[1].title)).toBeTruthy()
    expect(screen.queryByText('Scaffold Rust project with dependencies')).toBeNull()
    expect(screen.queryByText('/tui-app/.workspace.')).toBeNull()
    expect(screen.queryByText('Notes')).toBeNull()
    expect(screen.queryByText('Add context')).toBeNull()
  })

  it('falls back to state 0 count when preview state is out of range', () => {
    const invalidPreviewState = 99 as unknown as 0 | 1 | 2 | 3
    expect(getContextTabCount(invalidPreviewState, mockProject.tasks.length)).toBe(1 + mockProject.tasks.length)
  })

  it('uses a shared notes section size constant when notes are visible', () => {
    expect(getContextTabCount(1, mockProject.tasks.length)).toBe(1 + mockProject.tasks.length + NOTES_SECTION_SIZE)
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
    const teamNoteRow = screen.getByTestId('context-note-row-team-brainstorm-2-22-26')
    const scratchpadRow = screen.getByTestId('context-note-row-scratchpad')
    expect(teamNoteRow.querySelector('svg')).toBeNull()
    expect(scratchpadRow.querySelector('svg')).toBeNull()
  })

  it('renders project task states and mapped badge tones', () => {
    render(
      <ContextTab
        project={projectWithVariedTaskStates}
        previewState={2}
      />
    )

    expect(screen.getByText('Ship window chrome baseline')).toBeTruthy()
    expect(screen.getByText('Implement context tab state model')).toBeTruthy()
    expect(screen.getByText('Resolve IPC preload dependency')).toBeTruthy()
    expect(screen.getByText('Finalize docs and screenshots')).toBeTruthy()
    expect(screen.queryByText('Notes')).toBeNull()

    const section = screen.getByTestId('context-tab')
    expect(section.querySelectorAll('[data-context-task-status="done"]')).toHaveLength(1)
    expect(section.querySelectorAll('[data-context-task-status="in_progress"]')).toHaveLength(1)
    expect(section.querySelectorAll('[data-context-task-status="blocked"]')).toHaveLength(1)
    expect(section.querySelectorAll('[data-context-task-status="todo"]')).toHaveLength(1)

    const blockedTaskRow = screen.getByText('Resolve IPC preload dependency').closest('p')
    const blockedBadge = blockedTaskRow?.querySelector('[data-context-task-badge]')
    expect(blockedBadge?.className).toContain('bg-amber-300/95')
    expect(blockedBadge?.className).toContain('text-amber-950')
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
