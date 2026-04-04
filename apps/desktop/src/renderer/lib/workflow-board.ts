import type {
  WorkflowBoardColumn,
  WorkflowBoardSliceCard,
  WorkflowBoardSnapshot,
  WorkflowColumnId,
} from '@shared/types'

export const WORKFLOW_COLUMN_ORDER: WorkflowColumnId[] = [
  'backlog',
  'todo',
  'in_progress',
  'agent_review',
  'human_review',
  'merging',
  'done',
]

export function normalizeWorkflowColumns(snapshot: WorkflowBoardSnapshot): WorkflowBoardColumn[] {
  const sourceById = new Map(snapshot.columns.map((column) => [column.id, column]))

  return WORKFLOW_COLUMN_ORDER.map((columnId) => {
    const existing = sourceById.get(columnId)
    if (existing) {
      return existing
    }

    return {
      id: columnId,
      title: toColumnTitle(columnId),
      cards: [],
    }
  })
}

export function countWorkflowCards(snapshot: WorkflowBoardSnapshot): number {
  return snapshot.columns.reduce((count, column) => count + column.cards.length, 0)
}

export function flattenWorkflowTasks(snapshot: WorkflowBoardSnapshot): WorkflowBoardSliceCard['tasks'] {
  return normalizeWorkflowColumns(snapshot).flatMap((column) =>
    column.cards.flatMap((card) => card.tasks),
  )
}

export function toColumnTitle(columnId: WorkflowColumnId): string {
  if (columnId === 'in_progress') {
    return 'In Progress'
  }

  if (columnId === 'agent_review') {
    return 'Agent Review'
  }

  if (columnId === 'human_review') {
    return 'Human Review'
  }

  return columnId
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
