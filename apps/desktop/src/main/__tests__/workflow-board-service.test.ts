import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { SymphonyOperatorSnapshot } from '@shared/types'
import { WorkflowBoardService } from '../workflow-board-service'

const originalFixtureFlag = process.env.KATA_TEST_WORKFLOW_FIXTURE
const originalTestModeFlag = process.env.KATA_TEST_MODE
const originalSymphonyDashboardMockFlag = process.env.KATA_DESKTOP_SYMPHONY_DASHBOARD_MOCK

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

    if (originalSymphonyDashboardMockFlag !== undefined) {
      process.env.KATA_DESKTOP_SYMPHONY_DASHBOARD_MOCK = originalSymphonyDashboardMockFlag
    } else {
      delete process.env.KATA_DESKTOP_SYMPHONY_DASHBOARD_MOCK
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

  test('applies fixture-mode slice moves and persists them across refreshes', async () => {
    process.env.KATA_TEST_WORKFLOW_FIXTURE = '1'

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
    })

    await service.getBoard()
    const result = await service.moveEntity({
      entityKind: 'slice',
      entityId: 'slice-1',
      targetColumnId: 'in_progress',
    })

    expect(result.success).toBe(true)
    expect(result.code).toBe('COMMITTED')

    const refreshed = await service.refreshBoard()
    const inProgressCards = refreshed.snapshot.columns.find((column) => column.id === 'in_progress')?.cards ?? []
    expect(inProgressCards.map((card) => card.id)).toContain('slice-1')
  })

  test('applies fixture-mode task moves and edit updates without explicit target state', async () => {
    process.env.KATA_TEST_WORKFLOW_FIXTURE = '1'

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
    })

    await service.getBoard()

    const moveResult = await service.moveEntity({
      entityKind: 'task',
      entityId: 'task-2',
      targetColumnId: 'done',
    })

    expect(moveResult.success).toBe(true)
    expect(moveResult.message).toContain('Task moved')

    const updateResult = await service.updateTask({
      taskId: 'task-2',
      title: 'Task renamed without state change',
      description: 'No explicit target column provided',
    })

    expect(updateResult.success).toBe(true)
    expect(updateResult.task?.columnId).toBe('done')
  })

  test('returns rollback failure for fixture-mode move scenarios and keeps board unchanged', async () => {
    process.env.KATA_TEST_WORKFLOW_FIXTURE = '1'

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
    })

    const baseline = await service.getBoard()
    const beforeTodoIds = baseline.snapshot.columns.find((column) => column.id === 'todo')?.cards.map((card) => card.id)

    const failed = await service.moveEntity({
      entityKind: 'slice',
      entityId: 'slice-1',
      targetColumnId: 'human_review',
    })

    expect(failed.success).toBe(false)
    expect(failed.code).toBe('ROLLED_BACK')

    const after = await service.refreshBoard()
    const afterTodoIds = after.snapshot.columns.find((column) => column.id === 'todo')?.cards.map((card) => card.id)
    expect(afterTodoIds).toEqual(beforeTodoIds)
  })

  test('validates mutation payloads before attempting workflow writes', async () => {
    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
    })

    const move = await service.moveEntity({
      entityKind: 'slice',
      entityId: '   ',
      targetColumnId: 'todo',
    })
    expect(move.success).toBe(false)
    expect(move.code).toBe('VALIDATION_ERROR')

    const createMissingParent = await service.createTask({
      parentSliceId: '   ',
      title: 'Task title',
    })
    expect(createMissingParent.success).toBe(false)
    expect(createMissingParent.code).toBe('VALIDATION_ERROR')

    const createMissingTitle = await service.createTask({
      parentSliceId: 'slice-1',
      title: '   ',
    })
    expect(createMissingTitle.success).toBe(false)
    expect(createMissingTitle.code).toBe('VALIDATION_ERROR')

    const missingTaskDetail = await service.getTaskDetail({ taskId: '   ' })
    expect(missingTaskDetail.success).toBe(false)
    expect(missingTaskDetail.code).toBe('FAILED')

    const updateMissingTaskId = await service.updateTask({
      taskId: '   ',
      title: 'Task title',
    })
    expect(updateMissingTaskId.success).toBe(false)
    expect(updateMissingTaskId.code).toBe('VALIDATION_ERROR')

    const updateMissingTitle = await service.updateTask({
      taskId: 'task-1',
      title: '   ',
    })
    expect(updateMissingTitle.success).toBe(false)
    expect(updateMissingTitle.code).toBe('VALIDATION_ERROR')
  })

  test('returns not-found mutation responses when target entities are no longer visible', async () => {
    process.env.KATA_TEST_WORKFLOW_FIXTURE = '1'

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
    })

    await service.getBoard()

    const moveMissing = await service.moveEntity({
      entityKind: 'task',
      entityId: 'missing-task',
      targetColumnId: 'todo',
    })
    expect(moveMissing.success).toBe(false)
    expect(moveMissing.code).toBe('NOT_FOUND')

    const createMissingParent = await service.createTask({
      parentSliceId: 'missing-slice',
      title: 'Task title',
    })
    expect(createMissingParent.success).toBe(false)
    expect(createMissingParent.code).toBe('NOT_FOUND')

    const detailMissing = await service.getTaskDetail({ taskId: 'missing-task' })
    expect(detailMissing.success).toBe(false)
    expect(detailMissing.code).toBe('NOT_FOUND')

    const updateMissing = await service.updateTask({
      taskId: 'missing-task',
      title: 'Task title',
    })
    expect(updateMissing.success).toBe(false)
    expect(updateMissing.code).toBe('NOT_FOUND')
  })

  test('returns unsupported mutation responses when board backend is not linear', async () => {
    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
    })

    ;(service as any).lastSnapshot = {
      backend: 'github',
      fetchedAt: '2026-04-06T00:00:00.000Z',
      status: 'fresh',
      source: { repository: 'kata-sh/kata', mode: 'labels' },
      columns: [],
      poll: {
        status: 'success',
        backend: 'github',
        lastAttemptAt: '2026-04-06T00:00:00.000Z',
      },
    }

    const move = await service.moveEntity({
      entityKind: 'slice',
      entityId: 'slice-1',
      targetColumnId: 'todo',
    })
    expect(move.success).toBe(false)
    expect(move.code).toBe('UNSUPPORTED')

    const create = await service.createTask({
      parentSliceId: 'slice-1',
      title: 'Task title',
    })
    expect(create.success).toBe(false)
    expect(create.code).toBe('UNSUPPORTED')

    const detail = await service.getTaskDetail({ taskId: 'task-1' })
    expect(detail.success).toBe(false)
    expect(detail.code).toBe('UNSUPPORTED')

    const update = await service.updateTask({
      taskId: 'task-1',
      title: 'Task title',
    })
    expect(update.success).toBe(false)
    expect(update.code).toBe('UNSUPPORTED')
  })

  test('creates fixture-mode child tasks and keeps them visible after refresh', async () => {
    process.env.KATA_TEST_WORKFLOW_FIXTURE = '1'

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
    })

    await service.getBoard()
    const result = await service.createTask({
      parentSliceId: 'slice-1',
      title: 'Create task from board',
      description: 'Task details',
      initialColumnId: 'todo',
    })

    expect(result.success).toBe(true)
    expect(result.code).toBe('CREATED')

    const refreshed = await service.refreshBoard()
    const todoCard = refreshed.snapshot.columns.flatMap((column) => column.cards).find((card) => card.id === 'slice-1')
    const createdTask = todoCard?.tasks.find((task) => task.title === 'Create task from board')
    expect(createdTask).toBeDefined()
    expect(createdTask?.description).toBe('Task details')
  })

  test('returns rollback failure for fixture-mode create-task rejection', async () => {
    process.env.KATA_TEST_WORKFLOW_FIXTURE = '1'

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
    })

    const failed = await service.createTask({
      parentSliceId: 'slice-1',
      title: 'fail this create path',
      description: 'Should trigger rollback',
    })

    expect(failed.success).toBe(false)
    expect(failed.code).toBe('ROLLED_BACK')
  })

  test('loads fixture-mode task detail for task edit dialog hydration', async () => {
    process.env.KATA_TEST_WORKFLOW_FIXTURE = '1'

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
    })

    await service.getBoard()
    const detail = await service.getTaskDetail({ taskId: 'task-2' })

    expect(detail.success).toBe(true)
    expect(detail.code).toBe('LOADED')
    expect(detail.task?.id).toBe('task-2')
    expect(detail.task?.columnId).toBe('in_progress')
    expect(detail.task?.description).toBe('Fixture task used for edit-dialog hydration and mutation coverage.')
  })

  test('updates fixture-mode tasks and persists edit changes after refresh', async () => {
    process.env.KATA_TEST_WORKFLOW_FIXTURE = '1'

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
    })

    await service.getBoard()
    const updated = await service.updateTask({
      taskId: 'task-2',
      title: 'Edited task title',
      description: 'Edited task description',
      targetColumnId: 'agent_review',
    })

    expect(updated.success).toBe(true)
    expect(updated.code).toBe('UPDATED')

    const refreshed = await service.refreshBoard()
    const parentCard = refreshed.snapshot.columns.flatMap((column) => column.cards).find((card) => card.id === 'slice-1')
    const editedTask = parentCard?.tasks.find((task) => task.id === 'task-2')
    expect(editedTask?.title).toBe('Edited task title')
    expect(editedTask?.description).toBe('Edited task description')
    expect(editedTask?.columnId).toBe('agent_review')
  })

  test('maps fixture-mode task updates to backlog and done state types', async () => {
    process.env.KATA_TEST_WORKFLOW_FIXTURE = '1'

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
    })

    await service.getBoard()

    const backlogMove = await service.updateTask({
      taskId: 'task-2',
      title: 'Task moved to backlog',
      description: 'Backlog transition coverage',
      targetColumnId: 'backlog',
    })

    expect(backlogMove.success).toBe(true)
    expect(backlogMove.task?.columnId).toBe('backlog')

    const afterBacklogRefresh = await service.refreshBoard()
    const cardAfterBacklog = afterBacklogRefresh.snapshot.columns
      .flatMap((column) => column.cards)
      .find((card) => card.id === 'slice-1')
    const taskAfterBacklog = cardAfterBacklog?.tasks.find((task) => task.id === 'task-2')

    expect(taskAfterBacklog?.columnId).toBe('backlog')
    expect(taskAfterBacklog?.stateType).toBe('backlog')

    const doneMove = await service.updateTask({
      taskId: 'task-2',
      title: 'Task moved to done',
      description: 'Done transition coverage',
      targetColumnId: 'done',
    })

    expect(doneMove.success).toBe(true)
    expect(doneMove.task?.columnId).toBe('done')

    const refreshed = await service.refreshBoard()
    const parentCard = refreshed.snapshot.columns.flatMap((column) => column.cards).find((card) => card.id === 'slice-1')
    const updatedTask = parentCard?.tasks.find((task) => task.id === 'task-2')

    expect(updatedTask?.columnId).toBe('done')
    expect(updatedTask?.stateType).toBe('completed')
    expect(parentCard?.taskCounts.done).toBeGreaterThanOrEqual(1)
  })

  test('active-scope projection treats cards without symphony summaries as inactive', async () => {
    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
    })

    service.setScope({ scopeKey: 'workspace:a::session:b::scope:active', requestedScope: 'active' })

    const scoped = (service as any).resolveScope({
      backend: 'linear',
      fetchedAt: '2026-04-06T00:00:00.000Z',
      status: 'fresh',
      source: { projectId: 'project-ref' },
      activeMilestone: { id: 'milestone-1', name: '[M001] Demo' },
      columns: [
        {
          id: 'todo',
          title: 'Todo',
          cards: [
            {
              id: 'slice-1',
              identifier: 'KAT-2247',
              title: 'No symphony card',
              columnId: 'todo',
              stateName: 'Todo',
              stateType: 'unstarted',
              milestoneId: 'milestone-1',
              milestoneName: '[M001] Demo',
              taskCounts: { total: 1, done: 0 },
              tasks: [
                {
                  id: 'task-1',
                  identifier: 'KAT-2250',
                  title: 'No symphony task',
                  columnId: 'todo',
                  stateName: 'Todo',
                  stateType: 'unstarted',
                },
              ],
            },
          ],
        },
      ],
      symphony: {
        provenance: 'dashboard-derived',
        freshness: 'fresh',
        fetchedAt: '2026-04-06T00:00:00.000Z',
        workerCount: 0,
        escalationCount: 0,
        diagnostics: { correlationMisses: [] },
      },
      poll: {
        status: 'success',
        backend: 'linear',
        lastAttemptAt: '2026-04-06T00:00:00.000Z',
        lastSuccessAt: '2026-04-06T00:00:00.000Z',
      },
    })

    expect(scoped.scope?.requested).toBe('active')
    expect(scoped.scope?.resolved).toBe('active')
    expect(scoped.columns.find((column: { id: string }) => column.id === 'todo')?.cards).toHaveLength(0)
  })

  test('returns rollback failure for fixture-mode task edit rejection', async () => {
    process.env.KATA_TEST_WORKFLOW_FIXTURE = '1'

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
    })

    const failed = await service.updateTask({
      taskId: 'task-2',
      title: 'fail this edit path',
      description: 'Should trigger rollback',
      targetColumnId: 'todo',
    })

    expect(failed.success).toBe(false)
    expect(failed.code).toBe('ROLLED_BACK')
  })

  test('uses assembled linear fixture in test mode when assembled symphony mock is active', async () => {
    process.env.KATA_TEST_WORKFLOW_FIXTURE = '1'
    process.env.KATA_DESKTOP_SYMPHONY_DASHBOARD_MOCK = 'assembled_healthy'

    const symphonySnapshot: SymphonyOperatorSnapshot = {
      fetchedAt: new Date().toISOString(),
      queueCount: 1,
      completedCount: 3,
      workers: [
        {
          issueId: 'slice-s04',
          identifier: 'KAT-2337',
          issueTitle: '[S04] End-to-End Desktop Symphony Operation',
          state: 'in_progress',
          toolName: 'edit',
          model: 'claude-sonnet-4-6',
          lastActivityAt: new Date().toISOString(),
        },
        {
          issueId: 'task-s04-2',
          identifier: 'KAT-2356',
          issueTitle: '[T02] Prove the healthy assembled operator flow in Electron',
          state: 'in_progress',
          toolName: 'bash',
          model: 'claude-sonnet-4-6',
          lastActivityAt: new Date().toISOString(),
        },
      ],
      escalations: [
        {
          requestId: 'req-assembled-1',
          issueId: 'slice-s04',
          issueIdentifier: 'KAT-2337',
          issueTitle: '[S04] End-to-End Desktop Symphony Operation',
          questionPreview: 'Need clarification on dashboard failure state copy.',
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
    const inProgressCards = response.snapshot.columns.find((column) => column.id === 'in_progress')?.cards ?? []
    const assembledCard = inProgressCards.find((card) => card.identifier === 'KAT-2337')
    const assembledTask = assembledCard?.tasks.find((task) => task.identifier === 'KAT-2356')

    expect(assembledCard?.identifier).toBe('KAT-2337')
    expect(assembledCard?.symphony?.assignmentState).toBe('assigned')
    expect(assembledTask?.symphony?.assignmentState).toBe('assigned')
    expect(response.snapshot.symphony?.diagnostics.correlationMisses).toEqual([])

    delete process.env.KATA_DESKTOP_SYMPHONY_DASHBOARD_MOCK
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

  test('reads unavailable symphony snapshot once per enrichment pass', async () => {
    process.env.KATA_TEST_WORKFLOW_FIXTURE = '1'

    const getSymphonySnapshot = vi.fn(() => null)
    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
      getSymphonySnapshot,
    })

    await service.getBoard()

    expect(getSymphonySnapshot).toHaveBeenCalledTimes(1)
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

  test('filters active scope to cards with live symphony assignments', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-active-scope-'))
    mkdirSync(path.join(workspacePath, '.kata'), { recursive: true })
    writeFileSync(
      path.join(workspacePath, '.kata', 'preferences.md'),
      ['---', 'projectSlug: project-ref', '---', ''].join('\n'),
      'utf8',
    )

    const symphonySnapshot: SymphonyOperatorSnapshot = {
      fetchedAt: new Date().toISOString(),
      queueCount: 1,
      completedCount: 0,
      workers: [
        {
          issueId: 'slice-1',
          identifier: 'KAT-2247',
          issueTitle: 'Slice 1',
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
      authBridge: { getApiKey: vi.fn(async () => 'lin_api_test') } as never,
      getWorkspacePath: () => workspacePath,
      getSymphonySnapshot: () => symphonySnapshot,
    })

    ;(service as any).linearClient.fetchProjectSnapshot = vi.fn(async () => ({
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
              id: 'slice-1',
              identifier: 'KAT-2247',
              title: 'Active card',
              columnId: 'todo',
              stateName: 'Todo',
              stateType: 'unstarted',
              milestoneId: 'm1',
              milestoneName: '[M001] Demo',
              taskCounts: { total: 0, done: 0 },
              tasks: [],
            },
            {
              id: 'slice-2',
              identifier: 'KAT-2248',
              title: 'Inactive card',
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
    service.setScope({ scopeKey: 'workspace:a::session:b', requestedScope: 'active' })

    const response = await service.refreshBoard()
    const todoCards = response.snapshot.columns.find((column) => column.id === 'todo')?.cards ?? []

    expect(response.snapshot.scope?.requested).toBe('active')
    expect(response.snapshot.scope?.resolved).toBe('active')
    expect(todoCards.map((card) => card.identifier)).toEqual(['KAT-2247'])
  })

  test('falls back from active scope when operator state is stale', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-active-fallback-'))
    mkdirSync(path.join(workspacePath, '.kata'), { recursive: true })
    writeFileSync(
      path.join(workspacePath, '.kata', 'preferences.md'),
      ['---', 'projectSlug: project-ref', '---', ''].join('\n'),
      'utf8',
    )

    const symphonySnapshot: SymphonyOperatorSnapshot = {
      fetchedAt: new Date(Date.now() - 120_000).toISOString(),
      queueCount: 1,
      completedCount: 0,
      workers: [],
      escalations: [],
      connection: {
        state: 'connected',
        updatedAt: new Date().toISOString(),
      },
      freshness: {
        status: 'stale',
        staleReason: 'No recent operator update.',
      },
      response: {},
    }

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => 'lin_api_test') } as never,
      getWorkspacePath: () => workspacePath,
      getSymphonySnapshot: () => symphonySnapshot,
    })

    ;(service as any).linearClient.fetchProjectSnapshot = vi.fn(async () => ({
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
              id: 'slice-1',
              identifier: 'KAT-2247',
              title: 'Card still visible during fallback',
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
    service.setScope({ scopeKey: 'workspace:a::session:b', requestedScope: 'active' })

    const response = await service.refreshBoard()

    expect(response.snapshot.scope?.requested).toBe('active')
    expect(response.snapshot.scope?.resolved).toBe('project')
    expect(response.snapshot.scope?.reason).toBe('operator_state_stale')
    expect(response.snapshot.columns.find((column) => column.id === 'todo')?.cards.length).toBe(1)
  })

  test('switches fetch strategy between milestone and project scopes', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-scope-fetch-strategy-'))
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

    const milestoneSnapshot = {
      backend: 'linear' as const,
      fetchedAt: '2026-04-04T00:00:00.000Z',
      status: 'fresh' as const,
      source: { projectId: 'project-ref', activeMilestoneId: 'm1' },
      activeMilestone: { id: 'm1', name: '[M001] Demo' },
      columns: [],
      poll: { status: 'success' as const, backend: 'linear' as const, lastAttemptAt: '2026-04-04T00:00:00.000Z' },
    }

    const projectSnapshot = {
      ...milestoneSnapshot,
      source: { projectId: 'project-ref', activeMilestoneId: 'm2' },
      activeMilestone: { id: 'm2', name: '[M002] Demo' },
    }

    ;(service as any).linearClient.fetchActiveMilestoneSnapshot = vi.fn(async () => milestoneSnapshot)
    ;(service as any).linearClient.fetchProjectSnapshot = vi.fn(async () => projectSnapshot)

    service.setActive(true)

    service.setScope({ scopeKey: 'workspace:a::session:b', requestedScope: 'milestone' })
    await service.refreshBoard()

    service.setScope({ scopeKey: 'workspace:a::session:b', requestedScope: 'project' })
    await service.refreshBoard()

    expect((service as any).linearClient.fetchActiveMilestoneSnapshot).toHaveBeenCalledTimes(1)
    expect((service as any).linearClient.fetchProjectSnapshot).toHaveBeenCalledTimes(1)
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
