import { AuthBridge } from './auth-bridge'
import log from './logger'
import {
  type WorkflowBoardErrorCode,
  type WorkflowBoardPrMetadata,
  type WorkflowBoardSliceCard,
  type WorkflowBoardSnapshot,
  type WorkflowTrackerConfig,
} from '../shared/types'
import { createEmptyWorkflowColumns, mapLinearStateToColumnId } from './linear-workflow-client'

const GITHUB_API_URL = 'https://api.github.com'
const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql'
const REQUEST_TIMEOUT_MS = 12_000
const PAGE_SIZE = 100
const MAX_REST_PAGES = 10

interface GithubIssueLabel {
  name?: string
}

interface GithubIssueResponse {
  id?: number
  number?: number
  title?: string
  body?: string
  html_url?: string
  labels?: GithubIssueLabel[]
  pull_request?: unknown
}

interface GithubProjectsGraphqlEnvelope<TData> {
  data?: TData
  errors?: Array<{ message?: string }>
}

interface GithubProjectsFieldResponse {
  user?: GithubProjectsOwner | null
  organization?: GithubProjectsOwner | null
}

interface GithubProjectsOwner {
  projectV2?: GithubProjectsNode | null
}

interface GithubProjectsNode {
  id?: string
  field?: {
    id?: string
    options?: Array<{
      id?: string
      name?: string
    }>
  } | null
}

interface GithubProjectItemNode {
  id?: string
  content?: {
    id?: string
    number?: number
    title?: string
    url?: string
    labels?: { nodes?: Array<{ name?: string }> }
  } | null
  fieldValueByName?: {
    name?: string
    optionId?: string
  } | null
}

interface GithubProjectsItemsResponse {
  node?: {
    items?: {
      nodes?: GithubProjectItemNode[]
      pageInfo?: {
        hasNextPage?: boolean
        endCursor?: string | null
      }
    }
  } | null
}

interface FetchGithubBoardOptions {
  config: Extract<WorkflowTrackerConfig, { kind: 'github' }>
}

export class GithubWorkflowClientError extends Error {
  constructor(
    public readonly code: WorkflowBoardErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'GithubWorkflowClientError'
  }
}

export class GithubWorkflowClient {
  constructor(private readonly authBridge: AuthBridge) {}

  async fetchSnapshot(options: FetchGithubBoardOptions): Promise<WorkflowBoardSnapshot> {
    const { config } = options
    const token = await this.requireApiToken()

    const startedAt = Date.now()

    const snapshot =
      config.stateMode === 'projects_v2'
        ? await this.fetchProjectsV2Snapshot(token, config)
        : await this.fetchLabelModeSnapshot(token, config)

    log.info('[github-workflow-client] workflow:fetch', {
      repo: `${config.repoOwner}/${config.repoName}`,
      mode: config.stateMode,
      status: snapshot.status,
      cardCount: snapshot.columns.reduce((count, column) => count + column.cards.length, 0),
      latencyMs: Date.now() - startedAt,
    })

    return snapshot
  }

  static toWorkflowError(error: unknown): { code: WorkflowBoardErrorCode; message: string } {
    const normalized = toGithubWorkflowClientError(error)
    return {
      code: normalized.code,
      message: normalized.message,
    }
  }

  private async fetchLabelModeSnapshot(
    token: string,
    config: Extract<WorkflowTrackerConfig, { kind: 'github' }>,
  ): Promise<WorkflowBoardSnapshot> {
    const prefix = config.labelPrefix?.trim() || 'symphony'

    const issues = await this.fetchAllRepoIssues(token, config.repoOwner, config.repoName)
    const cards: WorkflowBoardSliceCard[] = []
    let unlabeledCount = 0

    for (const issue of issues) {
      if (issue.pull_request) {
        continue
      }

      const issueNumber = issue.number
      const issueTitle = issue.title?.trim()
      if (!issueNumber || !issueTitle) {
        continue
      }

      const parsedState = extractStateFromLabels(issue.labels ?? [], prefix)
      if (!parsedState) {
        unlabeledCount += 1
        continue
      }

      const prMetadata = extractPrMetadataFromGithubIssue(
        issue.body,
        config.repoOwner,
        config.repoName,
      )

      cards.push({
        id: String(issue.id ?? issueNumber),
        identifier: `#${issueNumber}`,
        title: issueTitle,
        url: issue.html_url,
        columnId: mapLinearStateToColumnId(parsedState.displayState, undefined),
        stateName: parsedState.displayState,
        stateType: 'label',
        milestoneId: `github:${config.repoOwner}/${config.repoName}`,
        milestoneName: `${config.repoOwner}/${config.repoName}`,
        taskCounts: { total: 0, done: 0 },
        tasks: [],
        prMetadata,
      })
    }

    log.debug('[github-workflow-client] PR metadata extraction', {
      cardsWithPr: cards.filter((c) => c.prMetadata).length,
      cardsWithoutPr: cards.filter((c) => !c.prMetadata).length,
    })

    const hasCards = cards.length > 0
    const nowIso = new Date().toISOString()
    const columns = createEmptyWorkflowColumns()

    for (const card of cards) {
      const column = columns.find((entry) => entry.id === card.columnId)
      column?.cards.push(card)
    }

    for (const column of columns) {
      column.cards.sort((left, right) => left.identifier.localeCompare(right.identifier))
    }

    return {
      backend: 'github',
      fetchedAt: nowIso,
      status: hasCards ? 'fresh' : 'empty',
      source: {
        projectId: `github:${config.repoOwner}/${config.repoName}`,
        trackerKind: 'github',
        githubStateMode: 'labels',
        repoOwner: config.repoOwner,
        repoName: config.repoName,
      },
      activeMilestone: null,
      columns,
      emptyReason: hasCards
        ? undefined
        : unlabeledCount > 0
          ? `No open issues have workflow labels with prefix "${prefix}:".`
          : 'No open GitHub issues found for workflow board.',
      poll: {
        status: 'success',
        backend: 'github',
        lastAttemptAt: nowIso,
      },
    }
  }

  private async fetchProjectsV2Snapshot(
    token: string,
    config: Extract<WorkflowTrackerConfig, { kind: 'github' }>,
  ): Promise<WorkflowBoardSnapshot> {
    const projectNumber = config.githubProjectNumber
    if (!projectNumber) {
      throw new GithubWorkflowClientError(
        'INVALID_CONFIG',
        'GitHub Projects v2 mode requires tracker.github_project_number.',
      )
    }

    const projectField = await this.resolveProjectsV2Field(token, config.repoOwner, projectNumber)

    if (!projectField.projectId || !projectField.statusFieldId) {
      throw new GithubWorkflowClientError(
        'NOT_FOUND',
        `GitHub project #${projectNumber} not found for owner ${config.repoOwner}.`,
      )
    }

    const items = await this.fetchProjectsV2Items(token, projectField.projectId)

    const cards: WorkflowBoardSliceCard[] = []
    for (const item of items) {
      const issueNumber = item.content?.number
      const issueTitle = item.content?.title?.trim()
      if (!issueNumber || !issueTitle) {
        continue
      }

      const stateName = item.fieldValueByName?.name?.trim() || 'Unknown'

      cards.push({
        id: item.content?.id || String(issueNumber),
        identifier: `#${issueNumber}`,
        title: issueTitle,
        url: item.content?.url,
        columnId: mapLinearStateToColumnId(stateName, undefined),
        stateName,
        stateType: 'projects_v2',
        milestoneId: `github-project:${projectNumber}`,
        milestoneName: `GitHub Project #${projectNumber}`,
        taskCounts: { total: 0, done: 0 },
        tasks: [],
      })
    }

    log.debug('[github-workflow-client] PR metadata extraction', {
      cardsWithPr: cards.filter((c) => c.prMetadata).length,
      cardsWithoutPr: cards.filter((c) => !c.prMetadata).length,
    })

    const hasCards = cards.length > 0
    const nowIso = new Date().toISOString()
    const columns = createEmptyWorkflowColumns()

    for (const card of cards) {
      const column = columns.find((entry) => entry.id === card.columnId)
      column?.cards.push(card)
    }

    for (const column of columns) {
      column.cards.sort((left, right) => left.identifier.localeCompare(right.identifier))
    }

    return {
      backend: 'github',
      fetchedAt: nowIso,
      status: hasCards ? 'fresh' : 'empty',
      source: {
        projectId: `github:${config.repoOwner}/${config.repoName}`,
        trackerKind: 'github',
        githubStateMode: 'projects_v2',
        repoOwner: config.repoOwner,
        repoName: config.repoName,
      },
      activeMilestone: {
        id: `github-project:${projectNumber}`,
        name: `GitHub Project #${projectNumber}`,
      },
      columns,
      emptyReason: hasCards ? undefined : 'No GitHub project issues matched workflow board.',
      poll: {
        status: 'success',
        backend: 'github',
        lastAttemptAt: nowIso,
      },
    }
  }

  private async resolveProjectsV2Field(token: string, owner: string, projectNumber: number): Promise<{
    projectId: string | null
    statusFieldId: string | null
  }> {
    const query = `
      query($projectNumber: Int!, $owner: String!) {
        user(login: $owner) {
          projectV2(number: $projectNumber) {
            id
            field(name: "Status") {
              ... on ProjectV2SingleSelectField {
                id
              }
            }
          }
        }
        organization(login: $owner) {
          projectV2(number: $projectNumber) {
            id
            field(name: "Status") {
              ... on ProjectV2SingleSelectField {
                id
              }
            }
          }
        }
      }
    `

    const data = await this.graphqlRequest<GithubProjectsFieldResponse>(token, query, {
      owner,
      projectNumber,
    })

    const project = data.user?.projectV2 ?? data.organization?.projectV2

    return {
      projectId: project?.id?.trim() || null,
      statusFieldId: project?.field?.id?.trim() || null,
    }
  }

  private async fetchProjectsV2Items(
    token: string,
    projectId: string,
  ): Promise<GithubProjectItemNode[]> {
    const query = `
      query($projectId: ID!, $first: Int!, $after: String) {
        node(id: $projectId) {
          ... on ProjectV2 {
            items(first: $first, after: $after) {
              nodes {
                id
                content {
                  ... on Issue {
                    id
                    number
                    title
                    url
                    labels(first: 20) {
                      nodes {
                        name
                      }
                    }
                  }
                }
                fieldValueByName(name: "Status") {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    optionId
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }
    `

    const items: GithubProjectItemNode[] = []
    let after: string | null = null

    do {
      const data: GithubProjectsItemsResponse = await this.graphqlRequest<GithubProjectsItemsResponse>(
        token,
        query,
        {
          projectId,
          first: PAGE_SIZE,
          after,
        },
      )

      const pageNodes: GithubProjectItemNode[] = data.node?.items?.nodes ?? []
      items.push(...pageNodes)

      const pageInfo = data.node?.items?.pageInfo
      after = pageInfo?.hasNextPage ? pageInfo.endCursor ?? null : null
    } while (after)

    return items
  }

  // We intentionally cap REST pagination to MAX_REST_PAGES * PAGE_SIZE (1000 issues)
  // to avoid excessive API calls for very large repositories.
  private async fetchAllRepoIssues(
    token: string,
    repoOwner: string,
    repoName: string,
  ): Promise<GithubIssueResponse[]> {
    const issues: GithubIssueResponse[] = []
    let reachedPaginationCap = false

    for (let page = 1; page <= MAX_REST_PAGES; page += 1) {
      const pageItems = await this.restRequest<GithubIssueResponse[]>(
        token,
        `/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}/issues?state=open&per_page=${PAGE_SIZE}&page=${page}`,
        [],
      )

      issues.push(...pageItems)
      if (pageItems.length < PAGE_SIZE) {
        reachedPaginationCap = false
        break
      }

      reachedPaginationCap = page === MAX_REST_PAGES
    }

    if (reachedPaginationCap) {
      log.warn('[github-workflow-client] issue pagination cap reached; snapshot may be truncated', {
        repo: `${repoOwner}/${repoName}`,
        maxPages: MAX_REST_PAGES,
        pageSize: PAGE_SIZE,
      })
    }

    return issues
  }

  private async restRequest<T>(token: string, endpoint: string, defaultEmptyResponse?: T): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(`${GITHUB_API_URL}${endpoint}`, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
        },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    return this.readJsonOrThrow<T>(response, defaultEmptyResponse)
  }

  private async graphqlRequest<TData>(
    token: string,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<TData> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(GITHUB_GRAPHQL_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    const payload = await this.readJsonOrThrow<GithubProjectsGraphqlEnvelope<TData>>(response)

    if (payload.errors?.length) {
      throw new GithubWorkflowClientError('GRAPHQL', payload.errors[0]?.message || 'GitHub GraphQL error')
    }

    return (payload.data ?? {}) as TData
  }

  private async readJsonOrThrow<T>(response: Response, defaultEmptyResponse?: T): Promise<T> {
    if (response.status === 401 || response.status === 403) {
      throw new GithubWorkflowClientError('UNAUTHORIZED', 'Invalid GitHub token', response.status)
    }

    if (response.status === 404) {
      throw new GithubWorkflowClientError('NOT_FOUND', 'GitHub repository or project not found', response.status)
    }

    if (response.status === 429) {
      throw new GithubWorkflowClientError('RATE_LIMITED', 'GitHub API rate limit exceeded', response.status)
    }

    const text = await response.text().catch(() => '')

    if (!response.ok) {
      throw new GithubWorkflowClientError(
        'NETWORK',
        `GitHub API request failed with status ${response.status}`,
        response.status,
      )
    }

    if (!text.trim()) {
      if (defaultEmptyResponse !== undefined) {
        return defaultEmptyResponse
      }
      throw new GithubWorkflowClientError('GRAPHQL', 'GitHub API returned an empty response body')
    }

    return JSON.parse(text) as T
  }

  private async requireApiToken(): Promise<string> {
    const envToken = process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim()
    if (envToken) {
      return envToken
    }

    const authToken = (await this.authBridge.getApiKey('github'))?.trim()
    if (authToken) {
      return authToken
    }

    throw new GithubWorkflowClientError(
      'MISSING_API_KEY',
      'GitHub token required. Set GH_TOKEN/GITHUB_TOKEN or configure provider "github" in auth.json.',
    )
  }
}

export function extractPrMetadataFromGithubIssue(
  body: string | undefined,
  repoOwner: string,
  repoName: string,
): WorkflowBoardPrMetadata | undefined {
  if (!body) {
    return undefined
  }

  // Match GitHub PR URLs in the issue body
  const prUrlPattern = /https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/g
  let match: RegExpExecArray | null

  while ((match = prUrlPattern.exec(body)) !== null) {
    const prNumber = Number(match[3])
    const prUrl = match[0]

    return {
      number: prNumber,
      url: prUrl,
    }
  }

  // Also match shorthand #N references that could be PRs within the same repo
  // Only match standalone #N patterns (not inside URLs already matched)
  // Require an explicit PR hint to avoid mislabeling issue references as PRs
  const hasPrHint = /\b(pr|pull request)\b/i.test(body)
  const shorthandPattern = /(?:^|\s)#(\d+)(?:\s|$|[.,;)])/g
  while (hasPrHint && (match = shorthandPattern.exec(body)) !== null) {
    const refNumber = Number(match[1])

    return {
      number: refNumber,
      url: `https://github.com/${repoOwner}/${repoName}/pull/${refNumber}`,
    }
  }

  return undefined
}

function extractStateFromLabels(
  labels: GithubIssueLabel[],
  prefix: string,
): { displayState: string } | null {
  const marker = `${prefix.toLowerCase()}:`

  for (const label of labels) {
    const labelName = label.name?.trim()
    if (!labelName) {
      continue
    }

    const lower = labelName.toLowerCase()
    if (!lower.startsWith(marker)) {
      continue
    }

    const suffix = labelName.split(':').slice(1).join(':').trim()
    if (!suffix) {
      continue
    }

    const normalized = suffix
      .toLowerCase()
      .replace(/_/g, '-')
      .split(/\s+/)
      .filter(Boolean)
      .join('-')

    return {
      displayState: denormalizeLabelState(normalized),
    }
  }

  return null
}

function denormalizeLabelState(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function toGithubWorkflowClientError(error: unknown): GithubWorkflowClientError {
  if (error instanceof GithubWorkflowClientError) {
    return error
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new GithubWorkflowClientError('NETWORK', 'GitHub API request timed out')
  }

  if (error instanceof TypeError) {
    return new GithubWorkflowClientError('NETWORK', error.message)
  }

  if (error instanceof SyntaxError) {
    return new GithubWorkflowClientError('GRAPHQL', `Invalid GitHub API response: ${error.message}`)
  }

  if (error instanceof Error) {
    return new GithubWorkflowClientError('UNKNOWN', error.message)
  }

  return new GithubWorkflowClientError('UNKNOWN', String(error))
}
