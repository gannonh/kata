import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { SymphonyOperatorSnapshot } from '@shared/types'
import { WorkflowBoardService } from '../workflow-board-service'

const originalFixtureFlag = process.env.KATA_TEST_WORKFLOW_FIXTURE
const originalTestModeFlag = process.env.KATA_TEST_MODE

describe('WorkflowBoardService', () => {
  beforeEach(() => {
    delete process.env.KATA_TEST_WORKFLOW_FIXTURE
  })

  afterEach(() => {
    if (originalFixtureFlag !== undefined) {
      process.env.KATA_TEST_WORKFLOW_FIXTURE = originalFixtureFlag
    } else {
      delete process.env.KATA_TEST_WORKFLOW_FIXTURE
    }

    if (originalTestModeFlag !== undefined) {
      process.env.KATA_TEST_MODE = originalTestModeFlag
    } else {
      delete process.env.KATA_TEST_MODE
    }
  })

  test('returns deterministic fixture snapshot when fixture mode is enabled', async () => {
    process.env.KATA_TEST_WORKFLOW_FIXTURE = '1'

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
    })

    const response = await service.getBoard()
    expect(response.success).toBe(true)
    expect(response.snapshot.status).toBe('fresh')
    expect(response.snapshot.columns.find((column) => column.id === 'todo')?.cards).toHaveLength(1)
    expect(response.snapshot.symphony?.provenance).toBe('unavailable')
  })

  test('omits staleReason when symphony snapshot is unavailable', async () => {
    process.env.KATA_TEST_WORKFLOW_FIXTURE = '1'

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
      getSymphonySnapshot: () => null,
    })

    const response = await service.getBoard()

    expect(response.snapshot.symphony?.provenance).toBe('unavailable')
    expect(response.snapshot.symphony?.staleReason).toBeUndefined()
  })

  test('clears per-item symphony projections when the snapshot becomes unavailable', async () => {
    process.env.KATA_TEST_WORKFLOW_FIXTURE = '1'

    let symphonySnapshot: SymphonyOperatorSnapshot | null = {
      fetchedAt: new Date().toISOString(),
      queueCount: 1,
      completedCount: 0,
      workers: [
        {
          issueId: 'slice-1',
          identifier: 'KAT-2247',
          issueTitle: 'Slice',
          state: 'in_progress',
          toolName: 'edit',
          model: 'claude-sonnet-4-6',
          lastActivityAt: new Date().toISOString(),
        },
      ],
      escalations: [],
      connection: {
        state: 'connected',
        updatedAt: new Date().toISOString(),
      },
      freshness: {
        status: 'fresh',
      },
      response: {},
    }

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
      getSymphonySnapshot: () => symphonySnapshot,
    })

    const assigned = await service.getBoard()
    const assignedCard = assigned.snapshot.columns.flatMap((column) => column.cards)[0]
    expect(assignedCard?.symphony?.assignmentState).toBe('assigned')

    symphonySnapshot = null

    const unavailable = await service.getBoard()
    const unavailableCard = unavailable.snapshot.columns.flatMap((column) => column.cards)[0]
    expect(unavailable.snapshot.symphony?.provenance).toBe('unavailable')
    expect(unavailableCard?.symphony).toBeUndefined()
  })

  test('enriches workflow cards with symphony worker assignments and escalations', async () => {
    process.env.KATA_TEST_WORKFLOW_FIXTURE = '1'

    const symphonySnapshot: SymphonyOperatorSnapshot = {
      fetchedAt: new Date().toISOString(),
      queueCount: 1,
      completedCount: 0,
      workers: [
        {
          issueId: 'slice-1',
          identifier: 'KAT-2247',
          issueTitle: 'Slice',
          state: 'in_progress',
          toolName: 'edit',
          model: 'claude-sonnet-4-6',
          lastActivityAt: new Date().toISOString(),
        },
      ],
      escalations: [
        {
          requestId: 'req-123',
          issueId: 'slice-1',
          issueIdentifier: 'KAT-2247',
          issueTitle: 'Slice',
          questionPreview: 'Need review',
          createdAt: new Date().toISOString(),
          timeoutMs: 300000,
        },
      ],
      connection: {
        state: 'connected',
        updatedAt: new Date().toISOString(),
      },
      freshness: {
        status: 'fresh',
      },
      response: {},
    }

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
      getSymphonySnapshot: () => symphonySnapshot,
    })

    const response = await service.getBoard()
    const todoCard = response.snapshot.columns.find((column) => column.id === 'todo')?.cards[0]

    expect(response.snapshot.symphony?.provenance).toBe('dashboard-derived')
    expect(todoCard?.symphony?.assignmentState).toBe('assigned')
    expect(todoCard?.symphony?.pendingEscalations).toBe(1)
  })

  test('marks operator-stale and runtime-disconnected symphony board envelopes', async () => {
    process.env.KATA_TEST_WORKFLOW_FIXTURE = '1'

    const staleSnapshot: SymphonyOperatorSnapshot = {
      fetchedAt: new Date(Date.now() - 60_000).toISOString(),
      queueCount: 0,
      completedCount: 0,
      workers: [],
      escalations: [],
      connection: {
        state: 'connected',
        updatedAt: new Date().toISOString(),
      },
      freshness: {
        status: 'stale',
        staleReason: 'Snapshot is old.',
      },
      response: {},
    }

    const disconnectedSnapshot: SymphonyOperatorSnapshot = {
      ...staleSnapshot,
      connection: {
        state: 'disconnected',
        updatedAt: new Date().toISOString(),
        lastError: 'Runtime disconnected.',
      },
      freshness: {
        status: 'stale',
      },
    }

    const staleService = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
      getSymphonySnapshot: () => staleSnapshot,
    })

    const disconnectedService = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
      getSymphonySnapshot: () => disconnectedSnapshot,
    })

    expect((await staleService.getBoard()).snapshot.symphony?.provenance).toBe('operator-stale')
    expect((await disconnectedService.getBoard()).snapshot.symphony?.provenance).toBe('runtime-disconnected')
  })

  test('reports symphony correlation misses for unmatched workers', async () => {
    process.env.KATA_TEST_WORKFLOW_FIXTURE = '1'

    const symphonySnapshot: SymphonyOperatorSnapshot = {
      fetchedAt: new Date().toISOString(),
      queueCount: 0,
      completedCount: 0,
      workers: [
        {
          issueId: 'unknown',
          identifier: 'KAT-9999',
          issueTitle: 'Unknown issue',
          state: 'in_progress',
          toolName: 'edit',
          model: 'claude-sonnet-4-6',
        },
      ],
      escalations: [],
      connection: {
        state: 'connected',
        updatedAt: new Date().toISOString(),
      },
      freshness: {
        status: 'fresh',
      },
      response: {},
    }

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
      getSymphonySnapshot: () => symphonySnapshot,
    })

    const response = await service.getBoard()
    expect(response.snapshot.symphony?.diagnostics.correlationMisses).toContain('worker:KAT-9999')
  })

  test('falls back to issueId correlation when identifiers are missing', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-issue-id-correlation-'))
    mkdirSync(path.join(workspacePath, '.kata'), { recursive: true })
    writeFileSync(path.join(workspacePath, '.kata', 'preferences.md'), ['---', 'projectSlug: project-ref', '---', ''].join('\n'), 'utf8')

    const symphonySnapshot: SymphonyOperatorSnapshot = {
      fetchedAt: new Date().toISOString(),
      queueCount: 0,
      completedCount: 0,
      workers: [
        {
          issueId: 'slice-issue-id',
          identifier: 'KAT-0000',
          issueTitle: 'Issue id join',
          state: 'in_progress',
          toolName: 'edit',
          model: 'claude-sonnet-4-6',
        },
      ],
      escalations: [
        {
          requestId: 'req-issue-id',
          issueId: 'slice-issue-id',
          issueIdentifier: '',
          issueTitle: 'Issue id join',
          questionPreview: 'Need review',
          createdAt: new Date().toISOString(),
          timeoutMs: 300000,
        },
      ],
      connection: {
        state: 'connected',
        updatedAt: new Date().toISOString(),
      },
      freshness: {
        status: 'fresh',
      },
      response: {},
    }

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => workspacePath,
      getSymphonySnapshot: () => symphonySnapshot,
    })

    ;(service as any).linearClient.fetchActiveMilestoneSnapshot = vi.fn(async () => ({
      backend: 'linear',
      fetchedAt: '2026-04-04T00:00:00.000Z',
      status: 'fresh',
      source: { projectId: 'project-ref', activeMilestoneId: 'm1' },
      activeMilestone: { id: 'm1', name: '[M001] Demo' },
      columns: [
        {
          id: 'todo',
          title: 'Todo',
          cards: [
            {
              id: 'slice-issue-id',
              identifier: '',
              title: 'Issue id join card',
              columnId: 'todo',
              stateName: 'Todo',
              stateType: 'unstarted',
              milestoneId: 'm1',
              milestoneName: '[M001] Demo',
              taskCounts: { total: 0, done: 0 },
              tasks: [],
            },
          ],
        },
      ],
      poll: { status: 'success', backend: 'linear', lastAttemptAt: '2026-04-04T00:00:00.000Z' },
    }))

    service.setActive(true)
    const response = await service.refreshBoard()
    const matchedCard = response.snapshot.columns[0]?.cards[0]

    expect(matchedCard?.symphony?.assignmentState).toBe('assigned')
    expect(matchedCard?.symphony?.pendingEscalations).toBe(1)
    expect(response.snapshot.symphony?.diagnostics.correlationMisses).toEqual([])
  })

  test('does not report false correlation misses when escalation joins by issue id', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-escalation-issue-id-join-'))
    mkdirSync(path.join(workspacePath, '.kata'), { recursive: true })
    writeFileSync(path.join(workspacePath, '.kata', 'preferences.md'), ['---', 'projectSlug: project-ref', '---', ''].join('\n'), 'utf8')

    const symphonySnapshot: SymphonyOperatorSnapshot = {
      fetchedAt: new Date().toISOString(),
      queueCount: 0,
      completedCount: 0,
      workers: [],
      escalations: [
        {
          requestId: 'req-issue-id-only',
          issueId: 'slice-issue-id',
          issueIdentifier: '',
          issueTitle: 'Issue id join',
          questionPreview: 'Need review',
          createdAt: new Date().toISOString(),
          timeoutMs: 300000,
        },
      ],
      connection: {
        state: 'connected',
        updatedAt: new Date().toISOString(),
      },
      freshness: {
        status: 'fresh',
      },
      response: {},
    }

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => workspacePath,
      getSymphonySnapshot: () => symphonySnapshot,
    })

    ;(service as any).linearClient.fetchActiveMilestoneSnapshot = vi.fn(async () => ({
      backend: 'linear',
      fetchedAt: '2026-04-04T00:00:00.000Z',
      status: 'fresh',
      source: { projectId: 'project-ref', activeMilestoneId: 'm1' },
      activeMilestone: { id: 'm1', name: '[M001] Demo' },
      columns: [
        {
          id: 'todo',
          title: 'Todo',
          cards: [
            {
              id: 'slice-issue-id',
              identifier: 'KAT-2247',
              title: 'Issue id join card',
              columnId: 'todo',
              stateName: 'Todo',
              stateType: 'unstarted',
              milestoneId: 'm1',
              milestoneName: '[M001] Demo',
              taskCounts: { total: 0, done: 0 },
              tasks: [],
            },
          ],
        },
      ],
      poll: { status: 'success', backend: 'linear', lastAttemptAt: '2026-04-04T00:00:00.000Z' },
    }))

    service.setActive(true)
    const response = await service.refreshBoard()

    expect(response.snapshot.columns[0]?.cards[0]?.symphony?.pendingEscalations).toBe(1)
    expect(response.snapshot.symphony?.diagnostics.correlationMisses).toEqual([])
  })

  test('counts identifier and issue-id escalation matches together without false misses', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-escalation-mixed-join-'))
    mkdirSync(path.join(workspacePath, '.kata'), { recursive: true })
    writeFileSync(path.join(workspacePath, '.kata', 'preferences.md'), ['---', 'projectSlug: project-ref', '---', ''].join('\n'), 'utf8')

    const symphonySnapshot: SymphonyOperatorSnapshot = {
      fetchedAt: new Date().toISOString(),
      queueCount: 0,
      completedCount: 0,
      workers: [],
      escalations: [
        {
          requestId: 'req-identifier',
          issueId: 'slice-issue-id',
          issueIdentifier: 'KAT-2247',
          issueTitle: 'Issue id join',
          questionPreview: 'Need review',
          createdAt: new Date().toISOString(),
          timeoutMs: 300000,
        },
        {
          requestId: 'req-issue-id',
          issueId: 'slice-issue-id',
          issueIdentifier: '',
          issueTitle: 'Issue id join',
          questionPreview: 'Need review',
          createdAt: new Date().toISOString(),
          timeoutMs: 300000,
        },
      ],
      connection: {
        state: 'connected',
        updatedAt: new Date().toISOString(),
      },
      freshness: {
        status: 'fresh',
      },
      response: {},
    }

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => workspacePath,
      getSymphonySnapshot: () => symphonySnapshot,
    })

    ;(service as any).linearClient.fetchActiveMilestoneSnapshot = vi.fn(async () => ({
      backend: 'linear',
      fetchedAt: '2026-04-04T00:00:00.000Z',
      status: 'fresh',
      source: { projectId: 'project-ref', activeMilestoneId: 'm1' },
      activeMilestone: { id: 'm1', name: '[M001] Demo' },
      columns: [
        {
          id: 'todo',
          title: 'Todo',
          cards: [
            {
              id: 'slice-issue-id',
              identifier: 'KAT-2247',
              title: 'Issue id join card',
              columnId: 'todo',
              stateName: 'Todo',
              stateType: 'unstarted',
              milestoneId: 'm1',
              milestoneName: '[M001] Demo',
              taskCounts: { total: 0, done: 0 },
              tasks: [],
            },
          ],
        },
      ],
      poll: { status: 'success', backend: 'linear', lastAttemptAt: '2026-04-04T00:00:00.000Z' },
    }))

    service.setActive(true)
    const response = await service.refreshBoard()

    expect(response.snapshot.columns[0]?.cards[0]?.symphony?.pendingEscalations).toBe(2)
    expect(response.snapshot.symphony?.diagnostics.correlationMisses).toEqual([])
  })

  test('maps reconnecting and unknown connection states to truthful provenance', async () => {
    process.env.KATA_TEST_WORKFLOW_FIXTURE = '1'

    const reconnectingSnapshot: SymphonyOperatorSnapshot = {
      fetchedAt: new Date().toISOString(),
      queueCount: 0,
      completedCount: 0,
      workers: [],
      escalations: [],
      connection: {
        state: 'reconnecting',
        updatedAt: new Date().toISOString(),
        lastError: 'Retrying stream.',
      },
      freshness: {
        status: 'fresh',
      },
      response: {},
    }

    const unknownConnectionSnapshot: SymphonyOperatorSnapshot = {
      ...reconnectingSnapshot,
      connection: {
        ...(reconnectingSnapshot.connection as any),
        state: 'mystery',
      } as any,
      freshness: {
        status: 'fresh',
      },
    }

    const reconnectingService = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
      getSymphonySnapshot: () => reconnectingSnapshot,
    })

    const unknownService = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
      getSymphonySnapshot: () => unknownConnectionSnapshot,
    })

    expect((await reconnectingService.getBoard()).snapshot.symphony?.provenance).toBe('operator-stale')
    expect((await unknownService.getBoard()).snapshot.symphony?.provenance).toBe('unavailable')
  })

  test('returns NOT_CONFIGURED when preferences are missing', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-missing-'))
    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => workspacePath,
    })

    service.setActive(true)
    const response = await service.refreshBoard()
    expect(response.snapshot.status).toBe('error')
    expect(response.snapshot.lastError?.code).toBe('NOT_CONFIGURED')
  })

  test('getBoard reuses cached snapshot after first refresh', async () => {
    process.env.KATA_TEST_WORKFLOW_FIXTURE = '1'

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
    })

    const first = await service.getBoard()
    const second = await service.getBoard()

    expect(first.snapshot.fetchedAt).toBe(second.snapshot.fetchedAt)
    expect(second.snapshot.status).toBe('fresh')
  })

  test('returns stale snapshot with error metadata when refresh fails after a successful fetch', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-stale-'))
    mkdirSync(path.join(workspacePath, '.kata'), { recursive: true })
    writeFileSync(
      path.join(workspacePath, '.kata', 'preferences.md'),
      ['---', 'projectSlug: project-ref', '---', ''].join('\n'),
      'utf8',
    )

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => 'lin_api_test') } as never,
      getWorkspacePath: () => workspacePath,
    })

    service.setActive(true)
    const client = (service as any).linearClient
    client.fetchActiveMilestoneSnapshot = vi
      .fn()
      .mockResolvedValueOnce({
        backend: 'linear',
        fetchedAt: '2026-04-04T00:00:00.000Z',
        status: 'fresh',
        source: { projectId: 'project-ref', activeMilestoneId: 'm1' },
        activeMilestone: { id: 'm1', name: '[M001] Demo' },
        columns: [],
        poll: { status: 'success', backend: 'linear', lastAttemptAt: '2026-04-04T00:00:00.000Z' },
      })
      .mockRejectedValueOnce(new Error('network down'))

    const first = await service.refreshBoard()
    expect(first.snapshot.status).toBe('fresh')

    const second = await service.refreshBoard()
    expect(second.snapshot.status).toBe('stale')
    expect(second.snapshot.lastError?.code).toBe('UNKNOWN')
    expect(second.snapshot.lastError?.message).toContain('network down')
    expect(second.snapshot.poll.status).toBe('error')
  })

  test('uses projectId from preferences frontmatter when available', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-project-id-'))
    mkdirSync(path.join(workspacePath, '.kata'), { recursive: true })
    writeFileSync(
      path.join(workspacePath, '.kata', 'preferences.md'),
      ['---', 'projectId: "project-id-123"', '---', ''].join('\n'),
      'utf8',
    )

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => 'lin_api_test') } as never,
      getWorkspacePath: () => workspacePath,
    })

    service.setActive(true)
    ;(service as any).linearClient.fetchActiveMilestoneSnapshot = vi.fn(async () => ({
      backend: 'linear',
      fetchedAt: '2026-04-04T00:00:00.000Z',
      status: 'empty',
      source: { projectId: 'project-id-123' },
      activeMilestone: null,
      columns: [],
      emptyReason: 'No slices found in the active milestone.',
      poll: { status: 'success', backend: 'linear', lastAttemptAt: '2026-04-04T00:00:00.000Z' },
    }))

    const response = await service.refreshBoard()
    expect(response.snapshot.source.projectId).toBe('project-id-123')
  })

  test('surfaces malformed preferences path errors without misreporting NOT_CONFIGURED', async () => {
    const workspacePath = path.join(tmpdir(), `workflow-board-invalid-${randomUUID()}`)
    writeFileSync(workspacePath, 'not-a-directory', 'utf8')

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => workspacePath,
    })

    service.setActive(true)
    const response = await service.refreshBoard()
    expect(response.snapshot.status).toBe('error')
    expect(response.snapshot.lastError?.code).toBe('UNKNOWN')
    expect(response.snapshot.lastError?.message).toContain('Unable to read .kata/preferences.md')
  })

  test('returns inactive error snapshot when board is not active', async () => {
    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
    })

    const response = await service.refreshBoard()
    expect(response.snapshot.status).toBe('error')
    expect(response.snapshot.lastError?.message).toContain('Workflow board inactive')
  })

  test('supports deterministic test scenarios via scope key in test mode', async () => {
    process.env.KATA_TEST_MODE = '1'

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
    })

    service.setActive(true)

    service.setScope('workspace:a::session:b::scenario:missing-config')
    expect((await service.refreshBoard()).snapshot.lastError?.code).toBe('NOT_CONFIGURED')

    service.setScope('workspace:a::session:b::scenario:auth-failure')
    expect((await service.refreshBoard()).snapshot.lastError?.code).toBe('UNAUTHORIZED')

    service.setScope('workspace:a::session:b::scenario:empty')
    expect((await service.refreshBoard()).snapshot.status).toBe('empty')

    service.setScope('workspace:a::session:b::scenario:stale')
    expect((await service.refreshBoard()).snapshot.status).toBe('stale')

    service.setScope('workspace:a::session:b::scenario:recovery')
    expect((await service.refreshBoard()).snapshot.status).toBe('fresh')

    delete process.env.KATA_TEST_MODE
  })

  test('refreshContext reflects planning signals and tracker availability', async () => {
    process.env.KATA_TEST_MODE = '1'

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
    })

    service.setPlanningActive(true)
    const planningContext = await service.refreshContext()
    expect(planningContext.mode).toBe('planning')

    service.setPlanningActive(false)
    const executionContext = await service.refreshContext()
    expect(executionContext.mode).toBe('execution')

    delete process.env.KATA_TEST_MODE
  })

  test('setScope resets cached board snapshots on scope changes', async () => {
    process.env.KATA_TEST_MODE = '1'

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
    })

    service.setActive(true)
    service.setScope('workspace:a::session:b::scenario:recovery')
    const first = await service.getBoard()

    service.setScope('workspace:a::session:c::scenario:empty')
    const second = await service.getBoard()

    expect(first.snapshot.status).toBe('fresh')
    expect(second.snapshot.status).toBe('empty')
  })

  test('deduplicates concurrent refresh requests to a single Linear fetch', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-concurrent-'))
    mkdirSync(path.join(workspacePath, '.kata'), { recursive: true })
    writeFileSync(
      path.join(workspacePath, '.kata', 'preferences.md'),
      ['---', 'projectSlug: project-ref', '---', ''].join('\n'),
      'utf8',
    )

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => 'lin_api_test') } as never,
      getWorkspacePath: () => workspacePath,
    })

    const snapshot = {
      backend: 'linear' as const,
      fetchedAt: '2026-04-04T00:00:00.000Z',
      status: 'fresh' as const,
      source: { projectId: 'project-ref', activeMilestoneId: 'm1' },
      activeMilestone: { id: 'm1', name: '[M001] Demo' },
      columns: [],
      poll: { status: 'success' as const, backend: 'linear' as const, lastAttemptAt: '2026-04-04T00:00:00.000Z' },
    }

    let resolveFetch!: (value: typeof snapshot) => void
    const deferredFetch = new Promise<typeof snapshot>((resolve) => {
      resolveFetch = resolve
    })

    ;(service as any).linearClient.fetchActiveMilestoneSnapshot = vi.fn(() => deferredFetch)

    service.setActive(true)
    const firstPromise = service.refreshBoard()
    const secondPromise = service.refreshBoard()

    resolveFetch(snapshot)
    const [first, second] = await Promise.all([firstPromise, secondPromise])

    expect((service as any).linearClient.fetchActiveMilestoneSnapshot).toHaveBeenCalledTimes(1)
    expect(first.snapshot).toEqual(second.snapshot)
  })

  test('returns inactive snapshot when deactivated during an in-flight refresh', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-inactive-mid-refresh-'))
    mkdirSync(path.join(workspacePath, '.kata'), { recursive: true })
    writeFileSync(
      path.join(workspacePath, '.kata', 'preferences.md'),
      ['---', 'projectSlug: project-ref', '---', ''].join('\n'),
      'utf8',
    )

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => 'lin_api_test') } as never,
      getWorkspacePath: () => workspacePath,
    })

    let resolveFetch!: (value: any) => void
    const deferredFetch = new Promise<any>((resolve) => {
      resolveFetch = resolve
    })

    ;(service as any).linearClient.fetchActiveMilestoneSnapshot = vi.fn(() => deferredFetch)

    service.setActive(true)
    const refreshPromise = service.refreshBoard()

    service.setActive(false)

    resolveFetch({
      backend: 'linear',
      fetchedAt: '2026-04-04T00:00:00.000Z',
      status: 'fresh',
      source: { projectId: 'project-ref', activeMilestoneId: 'm1' },
      activeMilestone: { id: 'm1', name: '[M001] Demo' },
      columns: [],
      poll: { status: 'success', backend: 'linear', lastAttemptAt: '2026-04-04T00:00:00.000Z' },
    })

    const response = await refreshPromise
    expect(response.snapshot.status).toBe('error')
    expect(response.snapshot.lastError?.message).toContain('Workflow board inactive')
  })

  test('returns inactive snapshot when deactivated during a failing in-flight refresh', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-inactive-failing-refresh-'))
    mkdirSync(path.join(workspacePath, '.kata'), { recursive: true })
    writeFileSync(
      path.join(workspacePath, '.kata', 'preferences.md'),
      ['---', 'projectSlug: project-ref', '---', ''].join('\n'),
      'utf8',
    )

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => 'lin_api_test') } as never,
      getWorkspacePath: () => workspacePath,
    })

    ;(service as any).linearClient.fetchActiveMilestoneSnapshot = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      throw new Error('network down')
    })

    service.setActive(true)
    const refreshPromise = service.refreshBoard()
    service.setActive(false)

    const response = await refreshPromise
    expect(response.snapshot.status).toBe('error')
    expect(response.snapshot.lastError?.message).toContain('Workflow board inactive')
  })

  test('does not let stale in-flight refresh overwrite a newer scope snapshot', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-scope-race-'))
    mkdirSync(path.join(workspacePath, '.kata'), { recursive: true })
    writeFileSync(
      path.join(workspacePath, '.kata', 'preferences.md'),
      ['---', 'projectSlug: project-ref', '---', ''].join('\n'),
      'utf8',
    )

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => 'lin_api_test') } as never,
      getWorkspacePath: () => workspacePath,
    })

    let resolveFirst!: (value: any) => void
    let resolveSecond!: (value: any) => void

    const firstFetch = new Promise<any>((resolve) => {
      resolveFirst = resolve
    })
    const secondFetch = new Promise<any>((resolve) => {
      resolveSecond = resolve
    })

    ;(service as any).linearClient.fetchActiveMilestoneSnapshot = vi
      .fn()
      .mockImplementationOnce(() => firstFetch)
      .mockImplementationOnce(() => secondFetch)

    service.setActive(true)

    service.setScope('workspace:a::session:first')
    const firstRefresh = service.refreshBoard()
    await vi.waitFor(() => {
      expect((service as any).linearClient.fetchActiveMilestoneSnapshot).toHaveBeenCalledTimes(1)
    })

    service.setScope('workspace:a::session:second')
    const secondRefresh = service.refreshBoard()
    await vi.waitFor(() => {
      expect((service as any).linearClient.fetchActiveMilestoneSnapshot).toHaveBeenCalledTimes(2)
    })

    resolveSecond({
      backend: 'linear',
      fetchedAt: '2026-04-04T00:00:02.000Z',
      status: 'fresh',
      source: { projectId: 'project-ref-second', activeMilestoneId: 'm2' },
      activeMilestone: { id: 'm2', name: '[M002] Second' },
      columns: [],
      poll: { status: 'success', backend: 'linear', lastAttemptAt: '2026-04-04T00:00:02.000Z' },
    })

    resolveFirst({
      backend: 'linear',
      fetchedAt: '2026-04-04T00:00:01.000Z',
      status: 'fresh',
      source: { projectId: 'project-ref-first', activeMilestoneId: 'm1' },
      activeMilestone: { id: 'm1', name: '[M001] First' },
      columns: [],
      poll: { status: 'success', backend: 'linear', lastAttemptAt: '2026-04-04T00:00:01.000Z' },
    })

    await Promise.all([firstRefresh, secondRefresh])

    const finalBoard = await service.getBoard()
    expect(finalBoard.snapshot.source.projectId).toBe('project-ref-second')
  })

  test('refreshContext reports unknown mode when preferences lookup throws in non-test mode', async () => {
    const workspacePath = path.join(tmpdir(), `workflow-board-refresh-context-error-${randomUUID()}`)
    writeFileSync(workspacePath, 'not-a-directory', 'utf8')

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => workspacePath,
    })

    const context = await service.refreshContext()
    expect(context.mode).toBe('unknown')
    expect(context.trackerConfigured).toBe(false)
  })

  test('refreshContext marks tracker configured when preferences define a project reference', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-refresh-context-configured-'))
    mkdirSync(path.join(workspacePath, '.kata'), { recursive: true })
    writeFileSync(
      path.join(workspacePath, '.kata', 'preferences.md'),
      ['---', 'projectSlug: demo-project', '---', ''].join('\n'),
      'utf8',
    )

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => workspacePath,
    })

    const context = await service.refreshContext()
    expect(context.trackerConfigured).toBe(true)
  })

  test('treats frontmatter without project reference as not configured', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-no-project-ref-'))
    mkdirSync(path.join(workspacePath, '.kata'), { recursive: true })
    writeFileSync(
      path.join(workspacePath, '.kata', 'preferences.md'),
      ['---', 'foo: bar', '---', ''].join('\n'),
      'utf8',
    )

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => workspacePath,
    })

    service.setActive(true)
    const response = await service.refreshBoard()
    expect(response.snapshot.lastError?.code).toBe('NOT_CONFIGURED')
  })

  test('ignores invalid scenario markers in test mode and falls back to normal refresh path', async () => {
    process.env.KATA_TEST_MODE = '1'

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
    })

    service.setActive(true)
    service.setScope('workspace:a::session:b::scenario:not-real')

    const response = await service.refreshBoard()
    expect(response.snapshot.status).toBe('fresh')
    expect(response.snapshot.lastError).toBeUndefined()
  })

  test('supports scope keys without scenario markers while in test mode', async () => {
    process.env.KATA_TEST_MODE = '1'

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
    })

    service.setActive(true)
    service.setScope('workspace:a::session:b')

    const response = await service.refreshBoard()
    expect(response.snapshot.status).toBe('fresh')
  })

  test('uses github labels fixture in test mode when WORKFLOW tracker.kind=github labels', async () => {
    process.env.KATA_TEST_MODE = '1'

    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-github-labels-'))
    writeFileSync(
      path.join(workspacePath, 'WORKFLOW.md'),
      ['---', 'tracker:', '  kind: github', '  repo_owner: kata-sh', '  repo_name: kata-mono', '  label_prefix: symphony', '---', ''].join('\n'),
      'utf8',
    )

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => workspacePath,
    })

    service.setActive(true)
    const response = await service.refreshBoard()

    expect(response.snapshot.backend).toBe('github')
    expect(response.snapshot.source.githubStateMode).toBe('labels')
    expect(response.snapshot.status).toBe('fresh')
  })

  test('uses github projects_v2 fixture in test mode when WORKFLOW project number is set', async () => {
    process.env.KATA_TEST_MODE = '1'

    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-github-projects-'))
    writeFileSync(
      path.join(workspacePath, 'WORKFLOW.md'),
      ['---', 'tracker:', '  kind: github', '  repo_owner: kata-sh', '  repo_name: kata-mono', '  github_project_number: 7', '---', ''].join('\n'),
      'utf8',
    )

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => workspacePath,
    })

    service.setActive(true)
    const response = await service.refreshBoard()

    expect(response.snapshot.backend).toBe('github')
    expect(response.snapshot.source.githubStateMode).toBe('projects_v2')
    expect(response.snapshot.activeMilestone?.name).toContain('GitHub Project')
  })

  test('returns INVALID_CONFIG when WORKFLOW frontmatter is malformed', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-invalid-config-'))
    writeFileSync(path.join(workspacePath, 'WORKFLOW.md'), '# no frontmatter\n', 'utf8')

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => workspacePath,
    })

    service.setActive(true)
    const response = await service.refreshBoard()

    expect(response.snapshot.status).toBe('error')
    expect(response.snapshot.lastError?.code).toBe('INVALID_CONFIG')
  })

  test('refreshContext marks tracker configured for github tracker config', async () => {
    process.env.KATA_TEST_MODE = '1'

    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-refresh-context-github-'))
    writeFileSync(
      path.join(workspacePath, 'WORKFLOW.md'),
      ['---', 'tracker:', '  kind: github', '  repo_owner: kata-sh', '  repo_name: kata-mono', '---', ''].join('\n'),
      'utf8',
    )

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => workspacePath,
    })

    const context = await service.refreshContext()
    expect(context.trackerConfigured).toBe(true)
    expect(context.mode).toBe('execution')
  })

  test('returns UNKNOWN when WORKFLOW exists but preferences path is unreadable', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-preferences-unreadable-'))
    writeFileSync(path.join(workspacePath, 'WORKFLOW.md'), ['---', 'project: demo', '---', ''].join('\n'), 'utf8')
    writeFileSync(path.join(workspacePath, '.kata'), 'not-a-directory', 'utf8')

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => workspacePath,
    })

    service.setActive(true)
    const response = await service.refreshBoard()
    expect(response.snapshot.status).toBe('error')
    expect(response.snapshot.lastError?.code).toBe('UNKNOWN')
    expect(response.snapshot.lastError?.message).toContain('Unable to read .kata/preferences.md')
  })

  test('treats preferences without frontmatter as not configured', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-no-frontmatter-'))
    writeFileSync(path.join(workspacePath, 'WORKFLOW.md'), ['---', 'project: demo', '---', ''].join('\n'), 'utf8')
    mkdirSync(path.join(workspacePath, '.kata'), { recursive: true })
    writeFileSync(path.join(workspacePath, '.kata', 'preferences.md'), 'projectId: demo\n', 'utf8')

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => workspacePath,
    })

    service.setActive(true)
    const response = await service.refreshBoard()
    expect(response.snapshot.lastError?.code).toBe('NOT_CONFIGURED')
  })
})
