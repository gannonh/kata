import { describe, expect, test } from 'vitest'
import type { WorkflowBoardSnapshot } from '@shared/types'
import {
  WORKFLOW_COLUMN_ORDER,
  countWorkflowCards,
  flattenWorkflowTasks,
  normalizeWorkflowColumns,
} from '../workflow-board'

const snapshotFixture: WorkflowBoardSnapshot = {
  backend: 'linear',
  fetchedAt: '2026-04-04T00:00:00.000Z',
  status: 'fresh',
  source: {
    projectId: 'project-1',
    activeMilestoneId: 'milestone-1',
  },
  activeMilestone: {
    id: 'milestone-1',
    name: '[M003] Workflow Kanban',
  },
  columns: [
    {
      id: 'todo',
      title: 'Todo',
      cards: [
        {
          id: 'slice-1',
          identifier: 'KAT-1',
          title: 'First slice',
          columnId: 'todo',
          stateName: 'Todo',
          stateType: 'unstarted',
          milestoneId: 'milestone-1',
          milestoneName: '[M003] Workflow Kanban',
          taskCounts: { total: 2, done: 1 },
          tasks: [
            {
              id: 'task-1',
              title: 'First task',
              identifier: 'KAT-2',
              columnId: 'in_progress',
              stateName: 'In Progress',
              stateType: 'started',
            },
            {
              id: 'task-2',
              title: 'Second task',
              identifier: 'KAT-3',
              columnId: 'done',
              stateName: 'Done',
              stateType: 'completed',
            },
          ],
        },
      ],
    },
  ],
  poll: {
    status: 'success',
    backend: 'linear',
    lastAttemptAt: '2026-04-04T00:00:00.000Z',
  },
}

describe('workflow-board renderer helpers', () => {
  test('normalizes columns into canonical workflow order', () => {
    const columns = normalizeWorkflowColumns(snapshotFixture)

    expect(columns.map((column) => column.id)).toEqual(WORKFLOW_COLUMN_ORDER)
    expect(columns.find((column) => column.id === 'todo')?.cards).toHaveLength(1)
    expect(columns.find((column) => column.id === 'backlog')?.cards).toHaveLength(0)
  })

  test('counts cards across all columns', () => {
    expect(countWorkflowCards(snapshotFixture)).toBe(1)
  })

  test('flattens task rows across all slice cards', () => {
    const tasks = flattenWorkflowTasks(snapshotFixture)
    expect(tasks.map((task) => task.id)).toEqual(['task-1', 'task-2'])
  })
})
