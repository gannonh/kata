import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TaskList } from '../../../../src/renderer/components/right/TaskList'
import type { ProjectTask } from '../../../../src/renderer/types/project'

const tasks: ProjectTask[] = [
  { id: 'task-1', title: 'Draft panel structure', status: 'todo' },
  { id: 'task-2', title: 'Implement right panel tabs', status: 'in_progress' },
  { id: 'task-3', title: 'Ship acceptance criteria', status: 'done' },
  { id: 'task-4', title: 'Resolve merge conflicts', status: 'blocked' }
]

describe('TaskList', () => {
  it('renders tasks with status indicators', () => {
    render(<TaskList tasks={tasks} />)

    expect(screen.getByText('Draft panel structure')).toBeTruthy()
    expect(screen.getByText('Implement right panel tabs')).toBeTruthy()
    expect(screen.getByText('Ship acceptance criteria')).toBeTruthy()
    expect(screen.getByText('Resolve merge conflicts')).toBeTruthy()

    expect(screen.getByText('Todo')).toBeTruthy()
    expect(screen.getByText('In Progress')).toBeTruthy()
    expect(screen.getByText('Done')).toBeTruthy()
    expect(screen.getByText('Blocked')).toBeTruthy()
  })
})
