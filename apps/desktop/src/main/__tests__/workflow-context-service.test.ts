import { describe, expect, test } from 'vitest'
import {
  WorkflowContextService,
  buildWorkflowContextSnapshot,
} from '../workflow-context-service'
import type { WorkflowBoardSnapshot } from '../../shared/types'

const freshBoard: WorkflowBoardSnapshot = {
  backend: 'linear',
  fetchedAt: '2026-04-04T00:00:00.000Z',
  status: 'fresh',
  source: { projectId: 'p1' },
  activeMilestone: null,
  columns: [],
  poll: {
    status: 'success',
    backend: 'linear',
    lastAttemptAt: '2026-04-04T00:00:00.000Z',
  },
}

describe('workflow-context-service', () => {
  test('resolves execution context when tracker is configured and board is available', () => {
    const snapshot = buildWorkflowContextSnapshot({
      trackerConfigured: true,
      boardSnapshot: freshBoard,
    })

    expect(snapshot.mode).toBe('execution')
    expect(snapshot.reason).toBe('tracker_and_board_available')
  })

  test('resolves execution context when tracker is configured and board is pending', () => {
    const snapshot = buildWorkflowContextSnapshot({
      trackerConfigured: true,
      boardSnapshot: null,
    })

    expect(snapshot.mode).toBe('execution')
    expect(snapshot.reason).toBe('tracker_configured_board_pending')
  })

  test('resolves execution context when board is available without tracker config', () => {
    const snapshot = buildWorkflowContextSnapshot({
      trackerConfigured: false,
      boardSnapshot: freshBoard,
    })

    expect(snapshot.mode).toBe('execution')
    expect(snapshot.reason).toBe('board_available_without_tracker')
  })

  test('resolves unknown when execution signals are absent', () => {
    const snapshot = buildWorkflowContextSnapshot({
      trackerConfigured: false,
      boardSnapshot: null,
    })

    expect(snapshot.mode).toBe('unknown')
    expect(snapshot.reason).toBe('unknown_context')
  })

  test('tracks transitions with previous and next snapshots', () => {
    const service = new WorkflowContextService()

    const first = service.resolve({
      trackerConfigured: true,
      boardSnapshot: null,
    })

    const second = service.resolve({
      trackerConfigured: true,
      boardSnapshot: freshBoard,
    })

    expect(first.previous).toBeNull()
    expect(first.next.reason).toBe('tracker_configured_board_pending')
    expect(second.previous?.reason).toBe('tracker_configured_board_pending')
    expect(second.next.reason).toBe('tracker_and_board_available')
  })
})
