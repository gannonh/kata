import { AuthBridge } from './auth-bridge'
import log from './logger'
import {
  WORKFLOW_COLUMNS,
  type WorkflowBoardColumn,
  type WorkflowBoardErrorCode,
  type WorkflowBoardSliceCard,
  type WorkflowBoardSnapshot,
  type WorkflowBoardTask,
  type WorkflowColumnId,
} from '../shared/types'

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql'
const LINEAR_REQUEST_TIMEOUT_MS = 10_000

const EXACT_NAME_TO_COLUMN_ID: Record<string, WorkflowColumnId> = {
  backlog: 'backlog',
  todo: 'todo',
  'in progress': 'in_progress',
  'agent review': 'agent_review',
  'human review': 'human_review',
  merging: 'merging',
  done: 'done',
}

const COLUMN_ID_TO_PREFERRED_STATE_NAMES: Record<WorkflowColumnId, string[]> = {
  backlog: ['Backlog'],
  todo: ['Todo'],
  in_progress: ['In Progress'],
  agent_review: ['Agent Review'],
  human_review: ['Human Review'],
  merging: ['Merging'],
  done: ['Done'],
}

const COLUMN_ID_TO_FALLBACK_STATE_TYPES: Partial<Record<WorkflowColumnId, string[]>> = {
  backlog: ['backlog'],
  todo: ['unstarted'],
  in_progress: ['started'],
  done: ['completed', 'canceled'],
}

interface GraphQLResponse<TData> {
  data?: TData
  errors?: Array<{ message?: string }>
}

interface LinearWorkflowState {
  id?: string
  name?: string
  type?: string
}

interface LinearWorkflowMilestone {
  id?: string
  name?: string
  sortOrder?: number
}

interface LinearWorkflowPageInfo {
  hasNextPage?: boolean
  endCursor?: string | null
}

interface LinearWorkflowTeamRef {
  id?: string
}

interface LinearWorkflowProjectRef {
  id?: string
}

interface LinearWorkflowIssue {
  id?: string
  identifier?: string
  title?: string
  description?: string
  url?: string
  parent?: { id?: string } | null
  team?: LinearWorkflowTeamRef | null
  project?: LinearWorkflowProjectRef | null
  state?: LinearWorkflowState | null
  projectMilestone?: LinearWorkflowMilestone | null
  children?: {
    nodes?: LinearWorkflowIssue[]
    pageInfo?: LinearWorkflowPageInfo
  } | null
}

interface WorkflowIssueForMutationQueryData {
  issue?: LinearWorkflowIssue | null
}

interface TeamWorkflowStatesQueryData {
  team?: {
    states?: {
      nodes?: Array<{
        id?: string
        name?: string
        type?: string
      }>
    } | null
  } | null
}

interface IssueUpdateMutationData {
  issueUpdate?: {
    success?: boolean
    issue?: LinearWorkflowIssue | null
  } | null
}

interface IssueCreateMutationData {
  issueCreate?: {
    success?: boolean
    issue?: LinearWorkflowIssue | null
  } | null
}

interface ResolveProjectQueryData {
  project?: {
    id?: string
  } | null
}

interface ResolveProjectBySlugQueryData {
  projects?: {
    nodes?: Array<{
      id?: string
    }>
  } | null
}

interface WorkflowIssuesQueryData {
  issues?: {
    nodes?: LinearWorkflowIssue[]
    pageInfo?: LinearWorkflowPageInfo
  }
}

interface WorkflowIssueChildrenQueryData {
  issue?: {
    children?: {
      nodes?: LinearWorkflowIssue[]
      pageInfo?: LinearWorkflowPageInfo
    } | null
  } | null
}

export interface FetchLinearBoardOptions {
  projectRef: string
}

export interface LinearIssueMutationResult {
  id: string
  identifier?: string
  title?: string
  url?: string
  stateId?: string
  stateName: string
  stateType: string
  teamId?: string
  projectId?: string
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

    const allIssues = await this.fetchAllIssuesForProject(apiKey, projectId)
    const sliceIssues = allIssues.filter((issue) => !issue.parent?.id)

    const activeMilestone = chooseActiveMilestone(sliceIssues)
    const snapshot = normalizeLinearBoard({
      projectId,
      milestoneId: activeMilestone?.id,
      milestoneName: activeMilestone?.name,
      issues: sliceIssues,
      scope: 'milestone',
    })

    log.info('[linear-workflow-client] workflow:fetch', {
      projectRef,
      projectId,
      scope: 'milestone',
      milestoneId: snapshot.activeMilestone?.id,
      status: snapshot.status,
      cardCount: snapshot.columns.reduce((count, column) => count + column.cards.length, 0),
      latencyMs: Date.now() - startedAt,
    })

    return snapshot
  }

  async fetchProjectSnapshot(options: FetchLinearBoardOptions): Promise<WorkflowBoardSnapshot> {
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

    const allIssues = await this.fetchAllIssuesForProject(apiKey, projectId)
    const sliceIssues = allIssues.filter((issue) => !issue.parent?.id)
    const activeMilestone = chooseActiveMilestone(sliceIssues)

    const snapshot = normalizeLinearBoard({
      projectId,
      issues: sliceIssues,
      scope: 'project',
      activeMilestoneId: activeMilestone?.id,
      activeMilestoneName: activeMilestone?.name,
    })

    log.info('[linear-workflow-client] workflow:fetch', {
      projectRef,
      projectId,
      scope: 'project',
      milestoneId: snapshot.activeMilestone?.id,
      status: snapshot.status,
      cardCount: snapshot.columns.reduce((count, column) => count + column.cards.length, 0),
      latencyMs: Date.now() - startedAt,
    })

    return snapshot
  }

  async moveIssueToColumn(options: {
    issueId: string
    targetColumnId: WorkflowColumnId
  }): Promise<LinearIssueMutationResult> {
    const issueId = options.issueId.trim()
    if (!issueId) {
      throw new LinearWorkflowClientError('UNKNOWN', 'Issue id is required for workflow mutation')
    }

    const apiKey = await this.requireApiKey()
    const issue = await this.fetchIssueForMutation(apiKey, issueId)

    if (!issue.id?.trim()) {
      throw new LinearWorkflowClientError('NOT_FOUND', `Issue ${issueId} was not found in Linear`)
    }

    const teamId = issue.team?.id?.trim()
    if (!teamId) {
      throw new LinearWorkflowClientError('INVALID_CONFIG', `Issue ${issueId} is missing team metadata`)
    }

    const targetStateId = await this.resolveStateIdForColumn(apiKey, {
      teamId,
      targetColumnId: options.targetColumnId,
      currentStateId: issue.state?.id?.trim(),
      currentStateName: issue.state?.name?.trim(),
      currentStateType: issue.state?.type?.trim(),
    })

    if (!targetStateId) {
      throw new LinearWorkflowClientError(
        'NOT_FOUND',
        `No Linear workflow state mapped to column "${options.targetColumnId}" for team ${teamId}`,
      )
    }

    if (issue.state?.id?.trim() === targetStateId) {
      return toLinearIssueMutationResult(issue)
    }

    const updatedIssue = await this.updateIssueState(apiKey, issue.id, targetStateId)
    return toLinearIssueMutationResult(updatedIssue)
  }

  async createChildTask(options: {
    parentIssueId: string
    title: string
    description?: string
    initialColumnId?: WorkflowColumnId
  }): Promise<LinearIssueMutationResult> {
    const parentIssueId = options.parentIssueId.trim()
    if (!parentIssueId) {
      throw new LinearWorkflowClientError('UNKNOWN', 'Parent issue id is required for task creation')
    }

    const title = options.title.trim()
    if (!title) {
      throw new LinearWorkflowClientError('UNKNOWN', 'Task title is required')
    }

    const apiKey = await this.requireApiKey()
    const parentIssue = await this.fetchIssueForMutation(apiKey, parentIssueId)

    if (!parentIssue.id?.trim()) {
      throw new LinearWorkflowClientError('NOT_FOUND', `Parent issue ${parentIssueId} was not found`)
    }

    const teamId = parentIssue.team?.id?.trim()
    if (!teamId) {
      throw new LinearWorkflowClientError('INVALID_CONFIG', `Parent issue ${parentIssueId} is missing team metadata`)
    }

    const projectId = parentIssue.project?.id?.trim()
    if (!projectId) {
      throw new LinearWorkflowClientError('INVALID_CONFIG', `Parent issue ${parentIssueId} is missing project metadata`)
    }

    const initialColumnId = options.initialColumnId ?? 'todo'
    const stateId = await this.resolveStateIdForColumn(apiKey, {
      teamId,
      targetColumnId: initialColumnId,
    })

    if (!stateId) {
      throw new LinearWorkflowClientError(
        'NOT_FOUND',
        `No Linear workflow state mapped to column "${initialColumnId}" for team ${teamId}`,
      )
    }

    const data = await this.request<IssueCreateMutationData>(
      apiKey,
      `
        mutation WorkflowCreateChildTask($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              id
              identifier
              title
              description
              url
              parent {
                id
              }
              team {
                id
              }
              project {
                id
              }
              state {
                id
                name
                type
              }
            }
          }
        }
      `,
      {
        input: {
          title,
          description: options.description?.trim() || undefined,
          parentId: parentIssue.id,
          teamId,
          projectId,
          stateId,
        },
      },
    )

    if (!data.issueCreate?.success || !data.issueCreate.issue) {
      throw new LinearWorkflowClientError('UNKNOWN', `Linear issue create failed for parent ${parentIssueId}`)
    }

    return toLinearIssueMutationResult(data.issueCreate.issue)
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
    const byId = await this.request<ResolveProjectQueryData>(
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

    const idMatch = byId.project?.id?.trim()
    if (idMatch) {
      return idMatch
    }

    const bySlug = await this.request<ResolveProjectBySlugQueryData>(
      apiKey,
      `
        query ResolveProjectBySlug($projectRef: String!) {
          projects(first: 1, filter: { slug: { eq: $projectRef } }) {
            nodes {
              id
            }
          }
        }
      `,
      { projectRef },
    )

    return bySlug.projects?.nodes?.[0]?.id?.trim() || null
  }

  private async fetchAllIssuesForProject(apiKey: string, projectId: string): Promise<LinearWorkflowIssue[]> {
    const issues: LinearWorkflowIssue[] = []
    let after: string | null = null

    do {
      const page: WorkflowIssuesQueryData = await this.request<WorkflowIssuesQueryData>(
        apiKey,
        `
          query WorkflowIssuesByProject($projectId: ID!, $after: String) {
            issues(
              first: 100
              after: $after
              filter: {
                project: { id: { eq: $projectId } }
              }
            ) {
              nodes {
                id
                identifier
                title
                description
                url
                parent {
                  id
                }
                team {
                  id
                }
                project {
                  id
                }
                state {
                  id
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
                    description
                    url
                    parent {
                      id
                    }
                    team {
                      id
                    }
                    project {
                      id
                    }
                    state {
                      id
                      name
                      type
                    }
                  }
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `,
        { projectId, after },
      )

      const pageNodes = page.issues?.nodes ?? []
      issues.push(...pageNodes)

      after = page.issues?.pageInfo?.hasNextPage ? (page.issues.pageInfo.endCursor ?? null) : null
    } while (after)

    for (const issue of issues) {
      const issueId = issue.id?.trim()
      if (!issueId || !issue.children?.pageInfo?.hasNextPage) {
        continue
      }

      const existingChildren = issue.children.nodes ?? []
      const extraChildren = await this.fetchAllChildrenForIssue(apiKey, issueId, issue.children.pageInfo.endCursor)
      issue.children = {
        nodes: [...existingChildren, ...extraChildren],
        pageInfo: {
          hasNextPage: false,
          endCursor: null,
        },
      }
    }

    return issues
  }

  private async fetchAllChildrenForIssue(
    apiKey: string,
    issueId: string,
    initialCursor?: string | null,
  ): Promise<LinearWorkflowIssue[]> {
    const children: LinearWorkflowIssue[] = []
    let after = initialCursor ?? null

    while (after) {
      const page: WorkflowIssueChildrenQueryData = await this.request<WorkflowIssueChildrenQueryData>(
        apiKey,
        `
          query WorkflowIssueChildrenPage($issueId: String!, $after: String) {
            issue(id: $issueId) {
              children(first: 100, after: $after) {
                nodes {
                  id
                  identifier
                  title
                  state {
                    id
                    name
                    type
                  }
                  team {
                    id
                  }
                  project {
                    id
                  }
                  parent {
                    id
                  }
                  url
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        `,
        { issueId, after },
      )

      children.push(...(page.issue?.children?.nodes ?? []))
      after = page.issue?.children?.pageInfo?.hasNextPage
        ? (page.issue.children.pageInfo.endCursor ?? null)
        : null
    }

    return children
  }

  private async fetchIssueForMutation(apiKey: string, issueId: string): Promise<LinearWorkflowIssue> {
    const data = await this.request<WorkflowIssueForMutationQueryData>(
      apiKey,
      `
        query WorkflowIssueForMutation($issueId: String!) {
          issue(id: $issueId) {
            id
            identifier
            title
            description
            url
            parent {
              id
            }
            team {
              id
            }
            project {
              id
            }
            projectMilestone {
              id
              name
            }
            state {
              id
              name
              type
            }
          }
        }
      `,
      { issueId },
    )

    return data.issue ?? {}
  }

  private async resolveStateIdForColumn(
    apiKey: string,
    options: {
      teamId: string
      targetColumnId: WorkflowColumnId
      currentStateId?: string
      currentStateName?: string
      currentStateType?: string
    },
  ): Promise<string | null> {
    const data = await this.request<TeamWorkflowStatesQueryData>(
      apiKey,
      `
        query WorkflowTeamStates($teamId: String!) {
          team(id: $teamId) {
            states {
              nodes {
                id
                name
                type
              }
            }
          }
        }
      `,
      { teamId: options.teamId },
    )

    const states = data.team?.states?.nodes ?? []
    const preferredState = selectWorkflowStateForColumn(states, options.targetColumnId)

    if (preferredState?.id?.trim()) {
      return preferredState.id.trim()
    }

    if (options.currentStateId && options.currentStateName) {
      const currentColumn = mapLinearStateToColumnId(options.currentStateName, options.currentStateType)
      if (currentColumn === options.targetColumnId) {
        return options.currentStateId
      }
    }

    return null
  }

  private async updateIssueState(apiKey: string, issueId: string, stateId: string): Promise<LinearWorkflowIssue> {
    const data = await this.request<IssueUpdateMutationData>(
      apiKey,
      `
        mutation WorkflowIssueMove($issueId: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $issueId, input: $input) {
            success
            issue {
              id
              identifier
              title
              description
              url
              parent {
                id
              }
              team {
                id
              }
              project {
                id
              }
              projectMilestone {
                id
                name
              }
              state {
                id
                name
                type
              }
            }
          }
        }
      `,
      {
        issueId,
        input: {
          stateId,
        },
      },
    )

    if (!data.issueUpdate?.success || !data.issueUpdate.issue) {
      throw new LinearWorkflowClientError('UNKNOWN', `Linear issue update failed for ${issueId}`)
    }

    return data.issueUpdate.issue
  }

  private async request<TData>(
    apiKey: string,
    query: string,
    variables: Record<string, unknown>,
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

function selectWorkflowStateForColumn(
  states: Array<{ id?: string; name?: string; type?: string }>,
  targetColumnId: WorkflowColumnId,
): { id?: string; name?: string; type?: string } | null {
  if (states.length === 0) {
    return null
  }

  const preferredNames = COLUMN_ID_TO_PREFERRED_STATE_NAMES[targetColumnId] ?? []
  for (const preferredName of preferredNames) {
    const match = states.find((state) => state.name?.trim().toLowerCase() === preferredName.toLowerCase())
    if (match?.id?.trim()) {
      return match
    }
  }

  const fallbackTypes = COLUMN_ID_TO_FALLBACK_STATE_TYPES[targetColumnId] ?? []
  for (const fallbackType of fallbackTypes) {
    const match = states.find((state) => state.type?.trim().toLowerCase() === fallbackType)
    if (match?.id?.trim()) {
      return match
    }
  }

  return null
}

function toLinearIssueMutationResult(issue: LinearWorkflowIssue): LinearIssueMutationResult {
  return {
    id: issue.id?.trim() || 'unknown',
    identifier: issue.identifier?.trim() || undefined,
    title: issue.title?.trim() || undefined,
    url: issue.url?.trim() || undefined,
    stateId: issue.state?.id?.trim() || undefined,
    stateName: issue.state?.name?.trim() || 'Unknown',
    stateType: issue.state?.type?.trim() || 'unknown',
    teamId: issue.team?.id?.trim() || undefined,
    projectId: issue.project?.id?.trim() || undefined,
  }
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
  scope?: 'milestone' | 'project'
  activeMilestoneId?: string
  activeMilestoneName?: string
}): WorkflowBoardSnapshot {
  const columns = createEmptyWorkflowColumns()
  const scope = input.scope ?? 'milestone'

  const scopedIssues =
    scope === 'project'
      ? input.issues
      : input.milestoneId
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
            stateId: task.state?.id?.trim() || undefined,
            stateName: task.state?.name?.trim() || 'Unknown',
            stateType: task.state?.type?.trim() || 'unknown',
            teamId: task.team?.id?.trim() || issue.team?.id?.trim() || undefined,
            projectId: task.project?.id?.trim() || issue.project?.id?.trim() || undefined,
            parentSliceId: task.parent?.id?.trim() || issue.id?.trim() || undefined,
            url: task.url?.trim() || undefined,
          } satisfies WorkflowBoardTask
        })

      const columnId = mapLinearStateToColumnId(issue.state?.name, issue.state?.type)
      const doneTasks = tasks.filter((task) => task.columnId === 'done').length
      const milestoneId = issue.projectMilestone?.id?.trim()
      const milestoneName = issue.projectMilestone?.name?.trim()

      return {
        id: issue.id as string,
        identifier: issue.identifier as string,
        title: issue.title as string,
        columnId,
        stateId: issue.state?.id?.trim() || undefined,
        stateName: issue.state?.name?.trim() || 'Unknown',
        stateType: issue.state?.type?.trim() || 'unknown',
        teamId: issue.team?.id?.trim() || undefined,
        projectId: issue.project?.id?.trim() || undefined,
        url: issue.url?.trim() || undefined,
        milestoneId: milestoneId ?? input.milestoneId ?? 'none',
        milestoneName: milestoneName ?? input.milestoneName ?? 'No active milestone',
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
  const activeMilestoneId = scope === 'project' ? input.activeMilestoneId : input.milestoneId
  const activeMilestoneName = scope === 'project' ? input.activeMilestoneName : input.milestoneName

  return {
    backend: 'linear',
    fetchedAt: new Date().toISOString(),
    status: hasCards ? 'fresh' : 'empty',
    source: {
      projectId: input.projectId,
      activeMilestoneId,
    },
    activeMilestone:
      activeMilestoneId && activeMilestoneName
        ? {
            id: activeMilestoneId,
            name: activeMilestoneName,
          }
        : null,
    columns,
    emptyReason:
      hasCards
        ? undefined
        : scope === 'project'
          ? 'No slices found in this project.'
          : 'No slices found in the active milestone.',
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
