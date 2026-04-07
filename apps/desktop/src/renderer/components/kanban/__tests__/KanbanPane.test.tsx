import { describe, expect, test } from 'vitest'
import { formatScopeStatus, formatSymphonyBoardStatus, formatWorkflowBoardStatus } from '../KanbanHeader'
import { summarizeColumnPresentation } from '../KanbanPane'
import { formatWorkflowReliabilityNotice } from '../BoardStateNotice'

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

  test('renders scope fallback details when requested scope is unresolved', () => {
    expect(
      formatScopeStatus(
        {
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
          scope: {
            requested: 'active',
            resolved: 'project',
            reason: 'operator_state_stale',
          },
        },
        'active',
      ),
    ).toContain('Scope: Active → Project')
  })

  test('renders symphony as unavailable when provenance is unavailable', () => {
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
          connectionState: 'unknown',
          freshness: 'unknown',
          provenance: 'unavailable',
          workerCount: 0,
          escalationCount: 0,
          diagnostics: {
            correlationMisses: [],
          },
        },
      }),
    ).toBe('Symphony: unavailable')
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

  test('renders pluralized escalation and correlation miss labels', () => {
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
          workerCount: 1,
          escalationCount: 3,
          diagnostics: {
            correlationMisses: ['worker:KAT-1', 'worker:KAT-2'],
          },
        },
      }),
    ).toContain('Symphony: live · 1 worker · 3 escalations · 2 correlation misses')
  })
})

describe('KanbanPane reliability messaging', () => {
  test('formats workflow reliability notice with canonical recovery language', () => {
    const message = formatWorkflowReliabilityNotice({
      code: 'REL-WORKFLOW-NETWORK-NETWORK',
      class: 'network',
      severity: 'error',
      sourceSurface: 'workflow_board',
      recoveryAction: 'reconnect',
      outcome: 'pending',
      message: 'Workflow board refresh failed.',
      timestamp: '2026-04-07T20:00:00.000Z',
      lastKnownGoodAt: '2026-04-07T19:58:00.000Z',
    })

    expect(message).toContain('Network issue (REL-WORKFLOW-NETWORK-NETWORK)')
    expect(message).toContain('Recommended recovery: Reconnect service.')
    expect(message).toContain('Last known good:')
  })
})

describe('KanbanPane presentation persistence helpers', () => {
  test('summarizes collapsed columns and hidden work counts', () => {
    const summary = summarizeColumnPresentation(
      [
        { id: 'todo', title: 'Todo', cards: [{ id: '1' } as any, { id: '2' } as any] },
        { id: 'in_progress', title: 'In Progress', cards: [{ id: '3' } as any] },
        { id: 'done', title: 'Done', cards: [] },
      ],
      new Set(['todo', 'done']),
    )

    expect(summary.collapsedColumnCount).toBe(2)
    expect(summary.hiddenCardCount).toBe(2)
  })
})
