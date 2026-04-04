import { describe, expect, test } from 'vitest'
import { formatSymphonyBoardStatus, formatWorkflowBoardStatus } from '../KanbanHeader'

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
        board: {
          backend: 'linear',
          fetchedAt: '2026-04-04T00:00:00.000Z',
          status: 'stale',
          source: { projectId: 'test-project' },
          activeMilestone: null,
          columns: [],
          poll: {
            status: 'error',
            backend: 'linear',
            lastAttemptAt: '2026-04-04T00:01:00.000Z',
            lastSuccessAt: '2026-04-04T00:00:30.000Z',
          },
          lastError: { code: 'NETWORK', message: 'offline' },
        },
        refreshing: true,
      }),
    ).toContain('Showing stale board snapshot · linear')
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

  test('renders symphony convergence summary with correlation misses', () => {
    expect(
      formatSymphonyBoardStatus({
        backend: 'linear',
        fetchedAt: '2026-04-04T00:00:00.000Z',
        status: 'fresh',
        source: { projectId: 'test-project' },
        activeMilestone: null,
        columns: [],
        poll: {
          status: 'success',
          backend: 'linear',
          lastAttemptAt: '2026-04-04T00:00:00.000Z',
        },
        symphony: {
          connectionState: 'connected',
          freshness: 'fresh',
          provenance: 'dashboard-derived',
          workerCount: 2,
          escalationCount: 1,
          diagnostics: {
            correlationMisses: ['worker:KAT-9999'],
          },
        },
      }),
    ).toContain('Symphony: live · 2 workers · 1 escalation · 1 correlation miss')
  })
})
