import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
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

    service.setScope('workspace:a::session:second')
    const secondRefresh = service.refreshBoard()

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
})
