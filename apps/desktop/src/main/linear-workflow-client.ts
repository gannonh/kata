import { AuthBridge } from './auth-bridge'
import log from './logger'
import {
  type WorkflowBoardColumn,
  type WorkflowBoardErrorCode,
  type WorkflowBoardSliceCard,
  type WorkflowBoardSnapshot,
  type WorkflowBoardTask,
  type WorkflowColumnId,
} from '../shared/types'

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql'
const LINEAR_REQUEST_TIMEOUT_MS = 10_000

const WORKFLOW_COLUMNS: Array<{ id: WorkflowColumnId; title: string }> = [
  { id: 'backlog', title: 'Backlog' },
  { id: 'todo', title: 'Todo' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'agent_review', title: 'Agent Review' },
  { id: 'human_review', title: 'Human Review' },
  { id: 'merging', title: 'Merging' },
  { id: 'done', title: 'Done' },
]

const EXACT_NAME_TO_COLUMN_ID: Record<string, WorkflowColumnId> = {
  backlog: 'backlog',
  todo: 'todo',
  'in progress': 'in_progress',
  'agent review': 'agent_review',
  'human review': 'human_review',
  merging: 'merging',
  done: 'done',
}

interface GraphQLResponse<TData> {
  data?: TData
  errors?: Array<{ message?: string }>
}

interface LinearWorkflowState {
  name?: string
  type?: string
}

interface LinearWorkflowMilestone {
  id?: string
  name?: string
  sortOrder?: number
}

interface LinearWorkflowIssue {
  id?: string
  identifier?: string
  title?: string
  parent?: { id?: string } | null
  state?: LinearWorkflowState | null
  projectMilestone?: LinearWorkflowMilestone | null
  children?: {
    nodes?: LinearWorkflowIssue[]
  } | null
}

interface ResolveProjectQueryData {
  project?: {
    id?: string
  } | null
}

interface WorkflowIssuesQueryData {
  issues?: {
    nodes?: LinearWorkflowIssue[]
  }
}

export interface FetchLinearBoardOptions {
  projectRef: string
}

export class LinearWorkflowClientError extends Error {
  constructor(
    public readonly code: WorkflowBoardErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'LinearWorkflowClientError'
  }
}

export class LinearWorkflowClient {
  constructor(
    private readonly authBridge: AuthBridge,
    private readonly apiUrl = LINEAR_GRAPHQL_URL,
    private readonly requestTimeoutMs = LINEAR_REQUEST_TIMEOUT_MS,
  ) {}

  async fetchActiveMilestoneSnapshot(options: FetchLinearBoardOptions): Promise<WorkflowBoardSnapshot> {
    const projectRef = options.projectRef.trim()
    if (!projectRef) {
      throw new LinearWorkflowClientError('NOT_CONFIGURED', 'Linear project reference is required')
    }

    const startedAt = Date.now()
    const apiKey = await this.requireApiKey()
    const projectId = await this.resolveProjectId(apiKey, projectRef)

    if (!projectId) {
      throw new LinearWorkflowClientError('NOT_FOUND', `Linear project "${projectRef}" was not found`)
    }

    const issuesData = await this.request<WorkflowIssuesQueryData>(
      apiKey,
      `
        query WorkflowIssuesByProject($projectId: ID!) {
          issues(
            first: 250
            filter: {
              project: { id: { eq: $projectId } }
            }
          ) {
            nodes {
              id
              identifier
              title
              parent {
                id
              }
              state {
                name
                type
              }
              projectMilestone {
                id
                name
                sortOrder
              }
              children(first: 100) {
                nodes {
                  id
                  identifier
                  title
                  state {
                    name
                    type
                  }
                }
              }
            }
          }
        }
      `,
      { projectId },
    )

    const allIssues = issuesData.issues?.nodes ?? []
    const sliceIssues = allIssues.filter((issue) => !issue.parent?.id)

    const activeMilestone = chooseActiveMilestone(sliceIssues)
    const snapshot = normalizeLinearBoard({
      projectId,
      milestoneId: activeMilestone?.id,
      milestoneName: activeMilestone?.name,
      issues: sliceIssues,
    })

    log.info('[linear-workflow-client] workflow:fetch', {
      projectRef,
      projectId,
      milestoneId: snapshot.activeMilestone?.id,
      status: snapshot.status,
      cardCount: snapshot.columns.reduce((count, column) => count + column.cards.length, 0),
      latencyMs: Date.now() - startedAt,
    })

    return snapshot
  }

  static toWorkflowError(error: unknown): { code: WorkflowBoardErrorCode; message: string } {
    const mapped = toLinearWorkflowClientError(error)
    return {
      code: mapped.code,
      message: mapped.message,
    }
  }

  private async requireApiKey(): Promise<string> {
    const envKey = process.env.LINEAR_API_KEY?.trim()
    if (envKey) {
      return envKey
    }

    const authKey = await this.authBridge.getApiKey('linear')
    if (authKey?.trim()) {
      return authKey.trim()
    }

    throw new LinearWorkflowClientError(
      'MISSING_API_KEY',
      'Linear API key required. Configure provider "linear" in auth.json or set LINEAR_API_KEY.',
    )
  }

  private async resolveProjectId(apiKey: string, projectRef: string): Promise<string | null> {
    const data = await this.request<ResolveProjectQueryData>(
      apiKey,
      `
        query ResolveProjectId($projectRef: String!) {
          project(id: $projectRef) {
            id
          }
        }
      `,
      { projectRef },
    )

    return data.project?.id?.trim() || null
  }

  private async request<TData>(
    apiKey: string,
    query: string,
    variables: Record<string, string>,
  ): Promise<TData> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, this.requestTimeoutMs)

    let response: Response
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({ query, variables }),
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (response.status === 401 || response.status === 403) {
      throw new LinearWorkflowClientError('UNAUTHORIZED', 'Invalid Linear API key', response.status)
    }

    if (response.status === 404) {
      throw new LinearWorkflowClientError(
        'NETWORK',
        'Linear API endpoint not found (HTTP 404). Verify endpoint configuration.',
        response.status,
      )
    }

    if (response.status === 429) {
      throw new LinearWorkflowClientError('RATE_LIMITED', 'Linear API rate limit exceeded', response.status)
    }

    const payload = (await response.json().catch(() => ({}))) as GraphQLResponse<TData>

    if (!response.ok) {
      const firstError = payload.errors?.[0]?.message
      if (firstError) {
        throw toGraphqlError(firstError, response.status)
      }

      throw new LinearWorkflowClientError(
        'NETWORK',
        `Linear API request failed with status ${response.status}`,
        response.status,
      )
    }

    if (payload.errors?.length) {
      throw toGraphqlError(payload.errors[0]?.message ?? 'Unknown GraphQL error', response.status)
    }

    return (payload.data ?? {}) as TData
  }
}

function chooseActiveMilestone(
  issues: LinearWorkflowIssue[],
): { id: string; name: string } | null {
  const milestones = new Map<string, { id: string; name: string; sortOrder: number; hasActive: boolean }>()

  for (const issue of issues) {
    const milestoneId = issue.projectMilestone?.id?.trim()
    const milestoneName = issue.projectMilestone?.name?.trim()
    if (!milestoneId || !milestoneName) {
      continue
    }

    const sortOrder = Number(issue.projectMilestone?.sortOrder ?? Number.MAX_SAFE_INTEGER)
    const columnId = mapLinearStateToColumnId(issue.state?.name, issue.state?.type)
    const hasActive = columnId !== 'done'

    const existing = milestones.get(milestoneId)
    if (!existing) {
      milestones.set(milestoneId, {
        id: milestoneId,
        name: milestoneName,
        sortOrder,
        hasActive,
      })
      continue
    }

    existing.hasActive = existing.hasActive || hasActive
    existing.sortOrder = Math.min(existing.sortOrder, sortOrder)
  }

  if (milestones.size === 0) {
    return null
  }

  const sorted = Array.from(milestones.values()).sort((left, right) => right.sortOrder - left.sortOrder)
  return sorted.find((milestone) => milestone.hasActive) ?? sorted[0] ?? null
}

export function mapLinearStateToColumnId(
  stateName: string | undefined,
  stateType: string | undefined,
): WorkflowColumnId {
  const normalizedName = stateName?.trim().toLowerCase()
  if (normalizedName && normalizedName in EXACT_NAME_TO_COLUMN_ID) {
    const exactMatch = EXACT_NAME_TO_COLUMN_ID[normalizedName as keyof typeof EXACT_NAME_TO_COLUMN_ID]
    if (exactMatch) {
      return exactMatch
    }
  }

  const normalizedType = stateType?.trim().toLowerCase()
  if (normalizedType === 'backlog') {
    return 'backlog'
  }

  if (normalizedType === 'unstarted') {
    return 'todo'
  }

  if (normalizedType === 'started') {
    return 'in_progress'
  }

  if (normalizedType === 'completed' || normalizedType === 'canceled') {
    return 'done'
  }

  return 'todo'
}

export function createEmptyWorkflowColumns(): WorkflowBoardColumn[] {
  return WORKFLOW_COLUMNS.map((column) => ({
    id: column.id,
    title: column.title,
    cards: [],
  }))
}

export function normalizeLinearBoard(input: {
  projectId: string
  milestoneId?: string
  milestoneName?: string
  issues: LinearWorkflowIssue[]
}): WorkflowBoardSnapshot {
  const columns = createEmptyWorkflowColumns()

  const scopedIssues = input.milestoneId
    ? input.issues.filter((issue) => issue.projectMilestone?.id === input.milestoneId)
    : []

  const sliceCards = scopedIssues
    .filter((issue) => issue.id && issue.identifier && issue.title)
    .map((issue) => {
      const tasks = (issue.children?.nodes ?? [])
        .filter((task) => task.id && task.title)
        .map((task) => {
          const taskColumnId = mapLinearStateToColumnId(task.state?.name, task.state?.type)
          return {
            id: task.id as string,
            identifier: task.identifier,
            title: task.title as string,
            columnId: taskColumnId,
            stateName: task.state?.name?.trim() || 'Unknown',
            stateType: task.state?.type?.trim() || 'unknown',
          } satisfies WorkflowBoardTask
        })

      const columnId = mapLinearStateToColumnId(issue.state?.name, issue.state?.type)
      const doneTasks = tasks.filter((task) => task.columnId === 'done').length

      return {
        id: issue.id as string,
        identifier: issue.identifier as string,
        title: issue.title as string,
        columnId,
        stateName: issue.state?.name?.trim() || 'Unknown',
        stateType: issue.state?.type?.trim() || 'unknown',
        milestoneId: input.milestoneId ?? 'none',
        milestoneName: input.milestoneName ?? 'No active milestone',
        taskCounts: {
          total: tasks.length,
          done: doneTasks,
        },
        tasks,
      } satisfies WorkflowBoardSliceCard
    })

  for (const card of sliceCards) {
    const column = columns.find((entry) => entry.id === card.columnId)
    column?.cards.push(card)
  }

  for (const column of columns) {
    column.cards.sort((left, right) => left.identifier.localeCompare(right.identifier))
  }

  const hasCards = columns.some((column) => column.cards.length > 0)

  return {
    backend: 'linear',
    fetchedAt: new Date().toISOString(),
    status: hasCards ? 'fresh' : 'empty',
    source: {
      projectId: input.projectId,
      activeMilestoneId: input.milestoneId,
    },
    activeMilestone:
      input.milestoneId && input.milestoneName
        ? {
            id: input.milestoneId,
            name: input.milestoneName,
          }
        : null,
    columns,
    emptyReason: hasCards ? undefined : 'No slices found in the active milestone.',
    poll: {
      status: 'success',
      backend: 'linear',
      lastAttemptAt: new Date().toISOString(),
    },
  }
}

function toGraphqlError(message: string, status?: number): LinearWorkflowClientError {
  if (/rate\s*limit/i.test(message)) {
    return new LinearWorkflowClientError('RATE_LIMITED', message, status)
  }

  if (/not\s*found/i.test(message)) {
    return new LinearWorkflowClientError('NOT_FOUND', message, status)
  }

  return new LinearWorkflowClientError('GRAPHQL', message, status)
}

function toLinearWorkflowClientError(error: unknown): LinearWorkflowClientError {
  if (error instanceof LinearWorkflowClientError) {
    return error
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new LinearWorkflowClientError('NETWORK', 'Linear API request timed out')
  }

  if (error instanceof TypeError) {
    return new LinearWorkflowClientError('NETWORK', error.message)
  }

  if (error instanceof Error) {
    return new LinearWorkflowClientError('UNKNOWN', error.message)
  }

  return new LinearWorkflowClientError('UNKNOWN', String(error))
}
