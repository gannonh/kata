import { describe, expect, test } from 'vitest'
import { formatWorkflowBoardStatus } from '../KanbanPane'

describe('KanbanPane status formatting', () => {
  test('renders loading state', () => {
    expect(
      formatWorkflowBoardStatus({
        loading: true,
        refreshing: false,
      }),
    ).toBe('Loading workflow board…')
  })

  test('renders stale state with refresh indicator', () => {
    expect(
      formatWorkflowBoardStatus({
        loading: false,
        boardStatus: 'stale',
        refreshing: true,
      }),
    ).toBe('Showing stale board snapshot · Refreshing…')
  })

  test('renders empty reason when provided', () => {
    expect(
      formatWorkflowBoardStatus({
        loading: false,
        boardStatus: 'empty',
        emptyReason: 'No slices in active milestone',
        refreshing: false,
      }),
    ).toBe('No slices in active milestone')
  })
})
