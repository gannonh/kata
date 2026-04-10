import { describe, expect, test } from 'vitest'
import type { WorkflowBoardSliceCard, WorkflowBoardTask } from '@shared/types'
import { formatScopeStatus, formatSymphonyBoardStatus, formatWorkflowBoardStatus } from '../KanbanHeader'
import { summarizeColumnPresentation } from '../KanbanPane'
import { formatWorkflowReliabilityNotice, formatWorkflowStabilityNotice } from '../BoardStateNotice'

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

  test('formats workflow stability notice with threshold guidance', () => {
    const message = formatWorkflowStabilityNotice({
      code: 'REL-LONGRUN-STALE_AGE_MS-BREACH',
      metric: 'staleAgeMs',
      sourceSurface: 'workflow_board',
      failureClass: 'stale',
      severity: 'critical',
      recoveryAction: 'refresh_state',
      comparator: 'max',
      observedValue: 200000,
      warningThreshold: 60000,
      breachThreshold: 180000,
      breached: true,
      message: 'Stale age exceeded threshold (200000ms vs 180000ms).',
      suggestedRecovery: 'Refresh workflow board and confirm tracker connectivity.',
      timestamp: '2026-04-07T20:00:00.000Z',
      lastKnownGoodAt: '2026-04-07T19:58:00.000Z',
    })

    expect(message).toContain('Stale age threshold breach')
    expect(message).toContain('Suggested recovery: Refresh workflow board and confirm tracker connectivity.')
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

describe('KanbanPane PR metadata integration', () => {
  test('board snapshot with mixed PR-linked and non-linked cards preserves prMetadata correctly', () => {
    const taskWithPrData: WorkflowBoardTask = {
      id: 'task-1',
      identifier: 'KAT-101',
      title: 'Task with PR',
      columnId: 'todo',
      stateName: 'Todo',
      stateType: 'unstarted',
      prMetadata: {
        number: 43,
        url: 'https://github.com/kata-sh/kata/pull/43',
      },
    }

    const taskWithoutPrData: WorkflowBoardTask = {
      id: 'task-2',
      identifier: 'KAT-102',
      title: 'Task without PR',
      columnId: 'todo',
      stateName: 'Todo',
      stateType: 'unstarted',
    }

    const cardWithPrData: WorkflowBoardSliceCard = {
      id: 'slice-1',
      identifier: 'KAT-100',
      title: 'Slice with PR',
      columnId: 'in_progress',
      stateName: 'In Progress',
      stateType: 'started',
      milestoneId: 'milestone-1',
      milestoneName: 'M001',
      taskCounts: { total: 2, done: 0 },
      tasks: [taskWithPrData, taskWithoutPrData],
      prMetadata: {
        number: 42,
        url: 'https://github.com/kata-sh/kata/pull/42',
        title: 'Feature PR',
        status: 'open',
        branchName: 'feat/branch',
      },
    }

    const cardWithoutPrData: WorkflowBoardSliceCard = {
      id: 'slice-2',
      identifier: 'KAT-200',
      title: 'Slice without PR',
      columnId: 'todo',
      stateName: 'Todo',
      stateType: 'unstarted',
      milestoneId: 'milestone-1',
      milestoneName: 'M001',
      taskCounts: { total: 0, done: 0 },
      tasks: [],
    }

    // Card with PR metadata
    expect(cardWithPrData.prMetadata).toBeDefined()
    expect(cardWithPrData.prMetadata?.number).toBe(42)
    expect(cardWithPrData.prMetadata?.url).toBe('https://github.com/kata-sh/kata/pull/42')
    expect(cardWithPrData.prMetadata?.status).toBe('open')
    expect(cardWithPrData.prMetadata?.branchName).toBe('feat/branch')

    // Card without PR metadata
    expect(cardWithoutPrData.prMetadata).toBeUndefined()

    // Task with PR
    expect(taskWithPrData.prMetadata?.number).toBe(43)
    expect(taskWithPrData.prMetadata?.url).toBe('https://github.com/kata-sh/kata/pull/43')

    // Task without PR
    expect(taskWithoutPrData.prMetadata).toBeUndefined()
  })
})
