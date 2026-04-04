import { promises as fs } from 'node:fs'
import path from 'node:path'
import { AuthBridge } from './auth-bridge'
import { GithubWorkflowClient } from './github-workflow-client'
import { LinearWorkflowClient, createEmptyWorkflowColumns } from './linear-workflow-client'
import log from './logger'
import { readWorkspaceWorkflowTrackerConfig } from './workflow-config-reader'
import {
  type WorkflowBoardBackend,
  type WorkflowBoardSnapshot,
  type WorkflowBoardSnapshotResponse,
  type WorkflowTrackerConfig,
} from '../shared/types'

const TEST_WORKFLOW_FIXTURE_LINEAR: WorkflowBoardSnapshot = {
  backend: 'linear',
  fetchedAt: '2026-04-04T00:00:00.000Z',
  status: 'fresh',
  source: {
    projectId: 'test-project',
    trackerKind: 'linear',
    activeMilestoneId: 'm003',
  },
  activeMilestone: {
    id: 'm003',
    name: '[M003] Workflow Kanban',
  },
  columns: [
    { id: 'backlog', title: 'Backlog', cards: [] },
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
    { id: 'in_progress', title: 'In Progress', cards: [] },
    { id: 'agent_review', title: 'Agent Review', cards: [] },
    { id: 'human_review', title: 'Human Review', cards: [] },
    { id: 'merging', title: 'Merging', cards: [] },
    { id: 'done', title: 'Done', cards: [] },
  ],
  poll: {
    status: 'success',
    backend: 'linear',
    lastAttemptAt: '2026-04-04T00:00:00.000Z',
  },
}

const TEST_WORKFLOW_FIXTURE_GITHUB_LABELS: WorkflowBoardSnapshot = {
  backend: 'github',
  fetchedAt: '2026-04-04T00:00:00.000Z',
  status: 'fresh',
  source: {
    projectId: 'github:kata-sh/kata-mono',
    trackerKind: 'github',
    githubStateMode: 'labels',
    repoOwner: 'kata-sh',
    repoName: 'kata-mono',
  },
  activeMilestone: null,
  columns: [
    { id: 'backlog', title: 'Backlog', cards: [] },
    {
      id: 'todo',
      title: 'Todo',
      cards: [
        {
          id: 'gh-2249',
          identifier: '#2249',
          title: '[S02] GitHub Workflow Board Parity',
          url: 'https://github.com/kata-sh/kata/issues/2249',
          columnId: 'todo',
          stateName: 'Todo',
          stateType: 'label',
          milestoneId: 'github:kata-sh/kata-mono',
          milestoneName: 'kata-sh/kata-mono',
          taskCounts: { total: 0, done: 0 },
          tasks: [],
        },
      ],
    },
    {
      id: 'in_progress',
      title: 'In Progress',
      cards: [
        {
          id: 'gh-2250',
          identifier: '#2250',
          title: '[S03] Workflow Context Switching and Failure Visibility',
          url: 'https://github.com/kata-sh/kata/issues/2250',
          columnId: 'in_progress',
          stateName: 'In Progress',
          stateType: 'label',
          milestoneId: 'github:kata-sh/kata-mono',
          milestoneName: 'kata-sh/kata-mono',
          taskCounts: { total: 0, done: 0 },
          tasks: [],
        },
      ],
    },
    { id: 'agent_review', title: 'Agent Review', cards: [] },
    { id: 'human_review', title: 'Human Review', cards: [] },
    { id: 'merging', title: 'Merging', cards: [] },
    { id: 'done', title: 'Done', cards: [] },
  ],
  poll: {
    status: 'success',
    backend: 'github',
    lastAttemptAt: '2026-04-04T00:00:00.000Z',
  },
}

const TEST_WORKFLOW_FIXTURE_GITHUB_PROJECTS: WorkflowBoardSnapshot = {
  backend: 'github',
  fetchedAt: '2026-04-04T00:00:00.000Z',
  status: 'fresh',
  source: {
    projectId: 'github:kata-sh/kata-mono',
    trackerKind: 'github',
    githubStateMode: 'projects_v2',
    repoOwner: 'kata-sh',
    repoName: 'kata-mono',
  },
  activeMilestone: {
    id: 'github-project:7',
    name: 'GitHub Project #7',
  },
  columns: [
    { id: 'backlog', title: 'Backlog', cards: [] },
    { id: 'todo', title: 'Todo', cards: [] },
    {
      id: 'in_progress',
      title: 'In Progress',
      cards: [
        {
          id: 'ghp-2249',
          identifier: '#2249',
          title: '[S02] GitHub Workflow Board Parity',
          url: 'https://github.com/kata-sh/kata/issues/2249',
          columnId: 'in_progress',
          stateName: 'In Progress',
          stateType: 'projects_v2',
          milestoneId: 'github-project:7',
          milestoneName: 'GitHub Project #7',
          taskCounts: { total: 0, done: 0 },
          tasks: [],
        },
      ],
    },
    {
      id: 'agent_review',
      title: 'Agent Review',
      cards: [
        {
          id: 'ghp-2251',
          identifier: '#2251',
          title: '[S04] End-to-End Kanban Integration Proof',
          url: 'https://github.com/kata-sh/kata/issues/2251',
          columnId: 'agent_review',
          stateName: 'Agent Review',
          stateType: 'projects_v2',
          milestoneId: 'github-project:7',
          milestoneName: 'GitHub Project #7',
          taskCounts: { total: 0, done: 0 },
          tasks: [],
        },
      ],
    },
    { id: 'human_review', title: 'Human Review', cards: [] },
    { id: 'merging', title: 'Merging', cards: [] },
    { id: 'done', title: 'Done', cards: [] },
  ],
  poll: {
    status: 'success',
    backend: 'github',
    lastAttemptAt: '2026-04-04T00:00:00.000Z',
  },
}

interface WorkflowBoardServiceOptions {
  authBridge: AuthBridge
  getWorkspacePath: () => string
}

export class WorkflowBoardService {
  private readonly linearClient: LinearWorkflowClient
  private readonly githubClient: GithubWorkflowClient
  private lastSnapshot: WorkflowBoardSnapshot | null = null
  private inFlightRefresh: Promise<WorkflowBoardSnapshotResponse> | null = null

  constructor(private readonly options: WorkflowBoardServiceOptions) {
    this.linearClient = new LinearWorkflowClient(options.authBridge)
    this.githubClient = new GithubWorkflowClient(options.authBridge)
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
    const workspacePath = this.options.getWorkspacePath()

    const trackerResult = await readWorkspaceWorkflowTrackerConfig(workspacePath)

    if (trackerResult.error) {
      const snapshot = this.toErrorSnapshot({
        nowIso,
        backend: 'github',
        projectId: 'github:unknown/unknown',
        message: trackerResult.error.message,
        code: trackerResult.error.code,
      })
      this.lastSnapshot = snapshot
      return { success: true, snapshot }
    }

    const trackerConfig = trackerResult.config

    if (isWorkflowFixtureEnabled()) {
      const fixture = withFreshTimestamps(selectFixtureForMode(resolveFixtureMode(trackerConfig)))
      this.lastSnapshot = fixture
      return {
        success: true,
        snapshot: fixture,
      }
    }

    if (trackerConfig?.kind === 'github') {
      return this.refreshGithubBoard(nowIso, trackerConfig)
    }

    return this.refreshLinearBoard(nowIso, workspacePath)
  }

  private async refreshGithubBoard(
    nowIso: string,
    config: Extract<WorkflowTrackerConfig, { kind: 'github' }>,
  ): Promise<WorkflowBoardSnapshotResponse> {
    try {
      const snapshot = await this.githubClient.fetchSnapshot({ config })
      this.lastSnapshot = snapshot
      return {
        success: true,
        snapshot,
      }
    } catch (error) {
      const workflowError = GithubWorkflowClient.toWorkflowError(error)

      const staleSnapshot =
        this.lastSnapshot && this.lastSnapshot.backend === 'github'
          ? {
              ...this.lastSnapshot,
              status: 'stale' as const,
              lastError: workflowError,
              poll: {
                ...this.lastSnapshot.poll,
                status: 'error' as const,
                lastAttemptAt: nowIso,
              },
            }
          : this.toErrorSnapshot({
              nowIso,
              backend: 'github',
              projectId: `github:${config.repoOwner}/${config.repoName}`,
              message: workflowError.message,
              code: workflowError.code,
              source: {
                trackerKind: 'github',
                githubStateMode: config.stateMode,
                repoOwner: config.repoOwner,
                repoName: config.repoName,
              },
            })

      this.lastSnapshot = staleSnapshot

      log.warn('[workflow-board-service] github workflow refresh failed', {
        repo: `${config.repoOwner}/${config.repoName}`,
        mode: config.stateMode,
        error: workflowError,
      })

      return {
        success: true,
        snapshot: staleSnapshot,
      }
    }
  }

  private async refreshLinearBoard(
    nowIso: string,
    workspacePath: string,
  ): Promise<WorkflowBoardSnapshotResponse> {
    let projectRef: string | null
    try {
      projectRef = await readLinearProjectReference(workspacePath)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to read .kata/preferences.md due to an unknown error.'

      const snapshot = this.toErrorSnapshot({
        nowIso,
        backend: 'linear',
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
        backend: 'linear',
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
      const staleSnapshot: WorkflowBoardSnapshot =
        this.lastSnapshot && this.lastSnapshot.backend === 'linear'
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
              backend: 'linear',
              projectId: projectRef,
              code: workflowError.code,
              message: workflowError.message,
              source: {
                trackerKind: 'linear',
              },
            })

      this.lastSnapshot = staleSnapshot

      log.warn('[workflow-board-service] linear workflow refresh failed', {
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
    backend: WorkflowBoardBackend
    projectId: string
    code: NonNullable<WorkflowBoardSnapshot['lastError']>['code']
    message: string
    source?: Partial<WorkflowBoardSnapshot['source']>
  }): WorkflowBoardSnapshot {
    return {
      backend: input.backend,
      fetchedAt: input.nowIso,
      status: 'error',
      source: {
        projectId: input.projectId,
        ...input.source,
      },
      activeMilestone: null,
      columns: createEmptyWorkflowColumns(),
      emptyReason: 'Workflow board unavailable',
      lastError: {
        code: input.code,
        message: input.message,
      },
      poll: {
        status: 'error',
        backend: input.backend,
        lastAttemptAt: input.nowIso,
      },
    }
  }
}

type FixtureMode = 'linear' | 'github_labels' | 'github_projects_v2'

function isWorkflowFixtureEnabled(): boolean {
  return process.env.KATA_TEST_MODE === '1' || Boolean(process.env.KATA_TEST_WORKFLOW_FIXTURE)
}

function resolveFixtureMode(config: WorkflowTrackerConfig | null): FixtureMode {
  const explicit = process.env.KATA_TEST_WORKFLOW_FIXTURE?.trim()
  if (explicit === 'github_labels' || explicit === 'github_projects_v2' || explicit === 'linear') {
    return explicit
  }

  if (config?.kind === 'github') {
    return config.stateMode === 'projects_v2' ? 'github_projects_v2' : 'github_labels'
  }

  return 'linear'
}

function selectFixtureForMode(mode: FixtureMode): WorkflowBoardSnapshot {
  if (mode === 'github_labels') {
    return TEST_WORKFLOW_FIXTURE_GITHUB_LABELS
  }

  if (mode === 'github_projects_v2') {
    return TEST_WORKFLOW_FIXTURE_GITHUB_PROJECTS
  }

  return TEST_WORKFLOW_FIXTURE_LINEAR
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

  const frontmatterMatch = content.match(/^\uFEFF?\s*---\s*\r?\n([\s\S]*?)\r?\n---/)
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
