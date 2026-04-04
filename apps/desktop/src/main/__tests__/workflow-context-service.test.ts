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
  test('prefers planning context when planning activity is active', () => {
    const snapshot = buildWorkflowContextSnapshot({
      planningActive: true,
      trackerConfigured: true,
      boardSnapshot: freshBoard,
    })

    expect(snapshot.mode).toBe('planning')
    expect(snapshot.reason).toBe('planning_activity_detected')
  })

  test('resolves execution context when tracker is configured and board is pending', () => {
    const snapshot = buildWorkflowContextSnapshot({
      planningActive: false,
      trackerConfigured: true,
      boardSnapshot: null,
    })

    expect(snapshot.mode).toBe('execution')
    expect(snapshot.reason).toBe('tracker_configured_board_pending')
  })

  test('resolves unknown when neither planning nor execution signals exist', () => {
    const snapshot = buildWorkflowContextSnapshot({
      planningActive: false,
      trackerConfigured: false,
      boardSnapshot: null,
    })

    expect(snapshot.mode).toBe('unknown')
    expect(snapshot.reason).toBe('unknown_context')
  })

  test('tracks transitions with previous and next snapshots', () => {
    const service = new WorkflowContextService()

    const first = service.resolve({
      planningActive: false,
      trackerConfigured: true,
      boardSnapshot: null,
    })

    const second = service.resolve({
      planningActive: true,
      trackerConfigured: true,
      boardSnapshot: freshBoard,
    })

    expect(first.previous).toBeNull()
    expect(first.next.mode).toBe('execution')
    expect(second.previous?.mode).toBe('execution')
    expect(second.next.mode).toBe('planning')
  })
})
