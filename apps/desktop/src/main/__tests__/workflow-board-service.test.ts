import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WorkflowBoardService } from '../workflow-board-service'

const originalFixtureFlag = process.env.KATA_TEST_WORKFLOW_FIXTURE
const originalTestMode = process.env.KATA_TEST_MODE

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

    if (originalTestMode !== undefined) {
      process.env.KATA_TEST_MODE = originalTestMode
    } else {
      delete process.env.KATA_TEST_MODE
    }
  })

  test('returns deterministic fixture snapshot when fixture mode is enabled', async () => {
    process.env.KATA_TEST_WORKFLOW_FIXTURE = 'linear'

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => '/tmp/workspace',
    })

    const response = await service.getBoard()
    expect(response.success).toBe(true)
    expect(response.snapshot.status).toBe('fresh')
    expect(response.snapshot.backend).toBe('linear')
    expect(response.snapshot.columns.find((column) => column.id === 'todo')?.cards).toHaveLength(1)
  })

  test('returns NOT_CONFIGURED when preferences are missing', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-missing-'))
    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => workspacePath,
    })

    const response = await service.refreshBoard()
    expect(response.snapshot.status).toBe('error')
    expect(response.snapshot.lastError?.code).toBe('NOT_CONFIGURED')
  })

  test('getBoard reuses cached snapshot after first refresh', async () => {
    process.env.KATA_TEST_WORKFLOW_FIXTURE = 'linear'

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

    const response = await service.refreshBoard()
    expect(response.snapshot.status).toBe('error')
    expect(response.snapshot.lastError?.code).toBe('UNKNOWN')
    expect(response.snapshot.lastError?.message).toContain('Unable to read WORKFLOW.md')
  })

  test('refreshes GitHub fixture mode based on WORKFLOW tracker config in test mode', async () => {
    process.env.KATA_TEST_MODE = '1'

    const workspacePath = mkdtempSync(path.join(tmpdir(), 'workflow-board-github-fixture-'))
    writeFileSync(
      path.join(workspacePath, 'WORKFLOW.md'),
      ['---', 'tracker:', '  kind: github', '  repo_owner: kata-sh', '  repo_name: kata', '  github_project_number: 7', '---', ''].join('\n'),
      'utf8',
    )

    const service = new WorkflowBoardService({
      authBridge: { getApiKey: vi.fn(async () => null) } as never,
      getWorkspacePath: () => workspacePath,
    })

    const response = await service.refreshBoard()

    expect(response.snapshot.backend).toBe('github')
    expect(response.snapshot.source.githubStateMode).toBe('projects_v2')
    expect(response.snapshot.columns.find((column) => column.id === 'agent_review')?.cards).toHaveLength(1)

    delete process.env.KATA_TEST_MODE
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

    const firstPromise = service.refreshBoard()
    const secondPromise = service.refreshBoard()

    resolveFetch(snapshot)
    const [first, second] = await Promise.all([firstPromise, secondPromise])

    expect((service as any).linearClient.fetchActiveMilestoneSnapshot).toHaveBeenCalledTimes(1)
    expect(first.snapshot).toEqual(second.snapshot)
  })
})
