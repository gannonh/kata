import { AuthBridge } from './auth-bridge'
import log from './logger'
import {
  buildPlanningArtifactKey,
  type PlanningArtifact,
  type PlanningArtifactError,
  type PlanningArtifactErrorCode,
  type PlanningArtifactScope,
} from '../shared/types'

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql'
const LINEAR_REQUEST_TIMEOUT_MS = 10_000

interface FetchByTitleOptions {
  title: string
  projectId?: string
  issueId?: string
}

interface LinearDocumentNode {
  title?: string
  content?: string
  updatedAt?: string
  project?: {
    id?: string
  } | null
  issue?: {
    id?: string
  } | null
}

interface GraphQLResponse<TData> {
  data?: TData
  errors?: Array<{
    message?: string
  }>
}

interface DocumentsQueryData {
  documents?: {
    nodes?: LinearDocumentNode[]
  }
}

interface ResolveProjectQueryData {
  project?: {
    id?: string
  } | null
}

export class LinearDocumentClientError extends Error {
  constructor(
    public readonly code: PlanningArtifactErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'LinearDocumentClientError'
  }
}

export class LinearDocumentClient {
  constructor(
    private readonly authBridge: AuthBridge,
    private readonly apiUrl = LINEAR_GRAPHQL_URL,
    private readonly requestTimeoutMs = LINEAR_REQUEST_TIMEOUT_MS,
  ) {}

  public async fetchByTitle(options: FetchByTitleOptions): Promise<PlanningArtifact | null> {
    const title = options.title.trim()
    if (!title) {
      throw new LinearDocumentClientError('UNKNOWN', 'Document title is required')
    }

    const startedAt = Date.now()

    try {
      const apiKey = await this.requireApiKey()

      const variables: Record<string, string> = {
        title,
      }

      const filterConditions: string[] = ['title: { eq: $title }']

      if (options.projectId) {
        variables.projectId = options.projectId
        filterConditions.push('project: { id: { eq: $projectId } }')
      }

      if (options.issueId) {
        variables.issueId = options.issueId
        filterConditions.push('issue: { id: { eq: $issueId } }')
      }

      const variableDefinitions = [
        '$title: String!',
        options.projectId ? '$projectId: ID!' : null,
        options.issueId ? '$issueId: ID!' : null,
      ]
        .filter((value): value is string => Boolean(value))
        .join(', ')

      const data = await this.request<DocumentsQueryData>(
        apiKey,
        `
          query PlanningDocumentByTitle(${variableDefinitions}) {
            documents(first: 20, filter: { ${filterConditions.join(', ')} }) {
              nodes {
                title
                content
                updatedAt
                project {
                  id
                }
                issue {
                  id
                }
              }
            }
          }
        `,
        variables,
      )

      const nodes = data.documents?.nodes ?? []
      if (nodes.length === 0) {
        log.info('[linear-document-client] planning:fetch', {
          title,
          status: 'not_found',
          latencyMs: Date.now() - startedAt,
          projectId: options.projectId,
          issueId: options.issueId,
        })
        return null
      }

      const exactMatches = nodes.filter((node) => node.title === title)
      const selectedNode = (exactMatches.length > 0 ? exactMatches : nodes)
        .slice()
        .sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt))[0]

      if (!selectedNode?.title) {
        log.info('[linear-document-client] planning:fetch', {
          title,
          status: 'not_found',
          latencyMs: Date.now() - startedAt,
          projectId: options.projectId,
          issueId: options.issueId,
        })
        return null
      }

      const scope = this.resolveScope(options, selectedNode)
      const projectId = options.projectId ?? selectedNode.project?.id
      const issueId = options.issueId ?? selectedNode.issue?.id

      const artifact: PlanningArtifact = {
        title: selectedNode.title,
        artifactKey: buildPlanningArtifactKey({
          title: selectedNode.title,
          scope,
          projectId,
          issueId,
        }),
        content: selectedNode.content ?? '',
        updatedAt: selectedNode.updatedAt ?? new Date().toISOString(),
        scope,
        projectId,
        issueId,
      }

      log.info('[linear-document-client] planning:fetch', {
        title,
        status: 'ok',
        latencyMs: Date.now() - startedAt,
        projectId: artifact.projectId,
        issueId: artifact.issueId,
      })

      return artifact
    } catch (error) {
      const clientError = toLinearDocumentClientError(error)

      log.warn('[linear-document-client] planning:fetch', {
        title,
        status: clientError.code.toLowerCase(),
        latencyMs: Date.now() - startedAt,
        projectId: options.projectId,
        issueId: options.issueId,
        error: clientError.message,
      })

      throw clientError
    }
  }

  public async listByProject(projectRef: string): Promise<PlanningArtifact[]> {
    const normalizedProjectRef = projectRef.trim()
    if (!normalizedProjectRef) {
      throw new LinearDocumentClientError('UNKNOWN', 'Project reference is required')
    }

    const startedAt = Date.now()

    try {
      const apiKey = await this.requireApiKey()
      const projectId = await this.resolveProjectId(apiKey, normalizedProjectRef)

      if (!projectId) {
        throw new LinearDocumentClientError(
          'NOT_FOUND',
          `Linear project "${normalizedProjectRef}" was not found`,
        )
      }

      const data = await this.request<DocumentsQueryData>(
        apiKey,
        `
          query PlanningDocumentsByProject($projectId: ID!) {
            documents(first: 100, filter: { project: { id: { eq: $projectId } } }) {
              nodes {
                title
                content
                updatedAt
                project {
                  id
                }
                issue {
                  id
                }
              }
            }
          }
        `,
        {
          projectId,
        },
      )

      const artifacts = (data.documents?.nodes ?? [])
        .filter((node): node is LinearDocumentNode & { title: string } => Boolean(node.title?.trim()))
        .map((node) => {
          const scope: PlanningArtifactScope = node.issue?.id ? 'issue' : 'project'
          const resolvedProjectId = node.project?.id ?? projectId
          const resolvedIssueId = node.issue?.id

          return {
            title: node.title,
            artifactKey: buildPlanningArtifactKey({
              title: node.title,
              scope,
              projectId: resolvedProjectId,
              issueId: resolvedIssueId,
            }),
            content: node.content ?? '',
            updatedAt: node.updatedAt ?? new Date().toISOString(),
            scope,
            projectId: resolvedProjectId,
            issueId: resolvedIssueId,
          } satisfies PlanningArtifact
        })
        .sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt))

      log.info('[linear-document-client] planning:list-by-project', {
        projectRef: normalizedProjectRef,
        projectId,
        artifactCount: artifacts.length,
        latencyMs: Date.now() - startedAt,
      })

      return artifacts
    } catch (error) {
      const clientError = toLinearDocumentClientError(error)

      log.warn('[linear-document-client] planning:list-by-project', {
        projectRef: normalizedProjectRef,
        status: clientError.code.toLowerCase(),
        error: clientError.message,
        latencyMs: Date.now() - startedAt,
      })

      throw clientError
    }
  }

  public static toPlanningArtifactError(error: unknown): PlanningArtifactError {
    const clientError = toLinearDocumentClientError(error)
    return {
      code: clientError.code,
      message: clientError.message,
    }
  }

  private async requireApiKey(): Promise<string> {
    const apiKey = await this.resolveApiKey()
    if (!apiKey) {
      throw new LinearDocumentClientError(
        'MISSING_API_KEY',
        'Linear API key required. Configure provider "linear" in auth.json or set LINEAR_API_KEY.',
      )
    }

    return apiKey
  }

  private async resolveApiKey(): Promise<string | null> {
    const envKey = process.env.LINEAR_API_KEY?.trim()
    if (envKey) {
      return envKey
    }

    return this.authBridge.getApiKey('linear')
  }

  private async resolveProjectId(apiKey: string, projectRef: string): Promise<string | null> {
    const data = await this.request<ResolveProjectQueryData>(
      apiKey,
      `
        query ResolveProjectId($projectRef: ID!) {
          project(id: $projectRef) {
            id
          }
        }
      `,
      {
        projectRef,
      },
    )

    return data.project?.id?.trim() || null
  }

  private resolveScope(options: FetchByTitleOptions, node: LinearDocumentNode): PlanningArtifactScope {
    if (options.issueId || node.issue?.id) {
      return 'issue'
    }

    return 'project'
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
        body: JSON.stringify({
          query,
          variables,
        }),
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (response.status === 401 || response.status === 403) {
      throw new LinearDocumentClientError('UNAUTHORIZED', 'Invalid Linear API key', response.status)
    }

    if (response.status === 404) {
      throw new LinearDocumentClientError(
        'NETWORK',
        'Linear API endpoint not found (HTTP 404). Verify endpoint configuration.',
        response.status,
      )
    }

    if (response.status === 429) {
      throw new LinearDocumentClientError('RATE_LIMITED', 'Linear API rate limit exceeded', response.status)
    }

    const payload = (await response
      .json()
      .catch(() => ({}))) as GraphQLResponse<TData>

    if (!response.ok) {
      const firstErrorMessage = payload.errors?.[0]?.message
      if (firstErrorMessage) {
        throw toGraphqlError(firstErrorMessage, response.status)
      }

      throw new LinearDocumentClientError(
        'NETWORK',
        `Linear API request failed with status ${response.status}`,
        response.status,
      )
    }

    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      const firstErrorMessage = payload.errors[0]?.message ?? 'Unknown GraphQL error'
      throw toGraphqlError(firstErrorMessage, response.status)
    }

    return (payload.data ?? {}) as TData
  }
}

function toTimestamp(value: string | undefined): number {
  if (!value) {
    return 0
  }

  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function toGraphqlError(message: string, status?: number): LinearDocumentClientError {
  if (/rate\s*limit/i.test(message)) {
    return new LinearDocumentClientError('RATE_LIMITED', message, status)
  }

  if (/not\s*found/i.test(message)) {
    return new LinearDocumentClientError('NOT_FOUND', message, status)
  }

  return new LinearDocumentClientError('GRAPHQL', message, status)
}

function toLinearDocumentClientError(error: unknown): LinearDocumentClientError {
  if (error instanceof LinearDocumentClientError) {
    return error
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new LinearDocumentClientError('NETWORK', 'Linear API request timed out')
  }

  if (error instanceof TypeError) {
    return new LinearDocumentClientError('NETWORK', error.message)
  }

  if (error instanceof Error) {
    return new LinearDocumentClientError('UNKNOWN', error.message)
  }

  return new LinearDocumentClientError('UNKNOWN', String(error))
}
