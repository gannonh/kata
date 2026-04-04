import { promises as fs } from 'node:fs'
import path from 'node:path'
import { AuthBridge } from './auth-bridge'
import { LinearWorkflowClient } from './linear-workflow-client'
import log from './logger'
import {
  type WorkflowBoardSnapshot,
  type WorkflowBoardSnapshotResponse,
} from '../shared/types'

const TEST_WORKFLOW_FIXTURE: WorkflowBoardSnapshot = {
  backend: 'linear',
  fetchedAt: '2026-04-04T00:00:00.000Z',
  status: 'fresh',
  source: {
    projectId: 'test-project',
    activeMilestoneId: 'm003',
  },
  activeMilestone: {
    id: 'm003',
    name: '[M003] Workflow Kanban',
  },
  columns: [
    {
      id: 'backlog',
      title: 'Backlog',
      cards: [],
    },
    {
      id: 'todo',
      title: 'Todo',
      cards: [
        {
          id: 'slice-1',
          identifier: 'KAT-2247',
          title: '[S01] Linear Workflow Board in the Right Pane',
          columnId: 'todo',
          stateName: 'Todo',
          stateType: 'unstarted',
          milestoneId: 'm003',
          milestoneName: '[M003] Workflow Kanban',
          taskCounts: { total: 2, done: 1 },
          tasks: [
            {
              id: 'task-1',
              identifier: 'KAT-2251',
              title: '[T01] Define canonical workflow snapshot contract',
              columnId: 'done',
              stateName: 'Done',
              stateType: 'completed',
            },
            {
              id: 'task-2',
              identifier: 'KAT-2252',
              title: '[T02] Wire workflow board service through IPC',
              columnId: 'in_progress',
              stateName: 'In Progress',
              stateType: 'started',
            },
          ],
        },
      ],
    },
    {
      id: 'in_progress',
      title: 'In Progress',
      cards: [],
    },
    {
      id: 'agent_review',
      title: 'Agent Review',
      cards: [],
    },
    {
      id: 'human_review',
      title: 'Human Review',
      cards: [],
    },
    {
      id: 'merging',
      title: 'Merging',
      cards: [],
    },
    {
      id: 'done',
      title: 'Done',
      cards: [],
    },
  ],
  poll: {
    status: 'success',
    backend: 'linear',
    lastAttemptAt: '2026-04-04T00:00:00.000Z',
  },
}

interface WorkflowBoardServiceOptions {
  authBridge: AuthBridge
  getWorkspacePath: () => string
}

export class WorkflowBoardService {
  private readonly linearClient: LinearWorkflowClient
  private lastSnapshot: WorkflowBoardSnapshot | null = null
  private inFlightRefresh: Promise<WorkflowBoardSnapshotResponse> | null = null

  constructor(private readonly options: WorkflowBoardServiceOptions) {
    this.linearClient = new LinearWorkflowClient(options.authBridge)
  }

  async getBoard(): Promise<WorkflowBoardSnapshotResponse> {
    if (this.lastSnapshot) {
      return {
        success: true,
        snapshot: this.lastSnapshot,
      }
    }

    return this.refreshBoard()
  }

  async refreshBoard(): Promise<WorkflowBoardSnapshotResponse> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh
    }

    this.inFlightRefresh = this.performRefreshBoard()

    try {
      return await this.inFlightRefresh
    } finally {
      this.inFlightRefresh = null
    }
  }

  private async performRefreshBoard(): Promise<WorkflowBoardSnapshotResponse> {
    const nowIso = new Date().toISOString()

    if (isWorkflowFixtureEnabled()) {
      const fixture = withFreshTimestamps(TEST_WORKFLOW_FIXTURE)
      this.lastSnapshot = fixture
      return {
        success: true,
        snapshot: fixture,
      }
    }

    const workspacePath = this.options.getWorkspacePath()

    let projectRef: string | null
    try {
      projectRef = await readLinearProjectReference(workspacePath)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to read .kata/preferences.md due to an unknown error.'

      const snapshot = this.toErrorSnapshot({
        nowIso,
        projectId: 'unknown',
        code: 'UNKNOWN',
        message,
      })

      this.lastSnapshot = snapshot

      return {
        success: true,
        snapshot,
      }
    }

    if (!projectRef) {
      const snapshot = this.toErrorSnapshot({
        nowIso,
        projectId: 'unknown',
        code: 'NOT_CONFIGURED',
        message: 'Linear project is not configured in .kata/preferences.md (projectId or projectSlug).',
      })
      this.lastSnapshot = snapshot
      return {
        success: true,
        snapshot,
      }
    }

    try {
      const snapshot = await this.linearClient.fetchActiveMilestoneSnapshot({ projectRef })
      this.lastSnapshot = snapshot
      return {
        success: true,
        snapshot,
      }
    } catch (error) {
      const workflowError = LinearWorkflowClient.toWorkflowError(error)
      const staleSnapshot: WorkflowBoardSnapshot = this.lastSnapshot
        ? {
            ...this.lastSnapshot,
            status: 'stale',
            lastError: workflowError,
            poll: {
              ...this.lastSnapshot.poll,
              status: 'error',
              lastAttemptAt: nowIso,
            },
          }
        : this.toErrorSnapshot({
            nowIso,
            projectId: projectRef,
            code: workflowError.code,
            message: workflowError.message,
          })

      this.lastSnapshot = staleSnapshot

      log.warn('[workflow-board-service] workflow refresh failed', {
        workspacePath,
        projectRef,
        error: workflowError,
      })

      return {
        success: true,
        snapshot: staleSnapshot,
      }
    }
  }

  private toErrorSnapshot(input: {
    nowIso: string
    projectId: string
    code: NonNullable<WorkflowBoardSnapshot['lastError']>['code']
    message: string
  }): WorkflowBoardSnapshot {
    return {
      backend: 'linear',
      fetchedAt: input.nowIso,
      status: 'error',
      source: {
        projectId: input.projectId,
      },
      activeMilestone: null,
      columns: TEST_WORKFLOW_FIXTURE.columns.map((column) => ({
        id: column.id,
        title: column.title,
        cards: [],
      })),
      emptyReason: 'Workflow board unavailable',
      lastError: {
        code: input.code,
        message: input.message,
      },
      poll: {
        status: 'error',
        backend: 'linear',
        lastAttemptAt: input.nowIso,
      },
    }
  }
}

function isWorkflowFixtureEnabled(): boolean {
  return process.env.KATA_TEST_MODE === '1' || process.env.KATA_TEST_WORKFLOW_FIXTURE === '1'
}

function withFreshTimestamps(snapshot: WorkflowBoardSnapshot): WorkflowBoardSnapshot {
  const nowIso = new Date().toISOString()
  return {
    ...snapshot,
    fetchedAt: nowIso,
    poll: {
      ...snapshot.poll,
      lastAttemptAt: nowIso,
    },
  }
}

async function readLinearProjectReference(workspacePath: string): Promise<string | null> {
  const preferencesPath = path.join(workspacePath, '.kata', 'preferences.md')

  let content: string
  try {
    content = await fs.readFile(preferencesPath, 'utf8')
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : undefined

    if (code === 'ENOENT') {
      return null
    }

    const errorMessage = error instanceof Error ? error.message : String(error)

    log.warn('[workflow-board-service] unable to read preferences', {
      workspacePath,
      preferencesPath,
      error: errorMessage,
    })

    throw new Error(`Unable to read .kata/preferences.md: ${errorMessage}`)
  }

  const frontmatterMatch = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatterMatch?.[1]) {
    return null
  }

  const frontmatter = frontmatterMatch[1]
  const projectIdMatch = frontmatter.match(/^\s*projectId:\s*([^\n#]+)$/m)
  if (projectIdMatch?.[1]) {
    const projectId = stripYamlWrapping(projectIdMatch[1].trim())
    if (projectId) {
      return projectId
    }
  }

  const projectSlugMatch = frontmatter.match(/^\s*projectSlug:\s*([^\n#]+)$/m)
  if (projectSlugMatch?.[1]) {
    const projectSlug = stripYamlWrapping(projectSlugMatch[1].trim())
    if (projectSlug) {
      return projectSlug
    }
  }

  return null
}

function stripYamlWrapping(value: string): string {
  return value.replace(/^['"]/, '').replace(/['"]$/, '').trim()
}
