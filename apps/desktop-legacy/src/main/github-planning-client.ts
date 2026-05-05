import { AuthBridge } from './auth-bridge'
import log from './logger'
import {
  buildPlanningArtifactKey,
  type PlanningArtifact,
  type PlanningArtifactError,
  type PlanningArtifactErrorCode,
} from '../shared/types'

const GITHUB_API_URL = 'https://api.github.com'
const GITHUB_REQUEST_TIMEOUT_MS = 10_000
const GITHUB_ISSUES_PAGE_SIZE = 100
const GITHUB_MAX_ISSUE_PAGES = 10
const GITHUB_PLANNING_LABELS = ['kata:artifact', 'kata:milestone'] as const

interface GithubIssueLabel {
  name?: string
}

interface GithubIssue {
  number?: number
  title?: string
  body?: string | null
  updated_at?: string
  pull_request?: unknown
  labels?: GithubIssueLabel[]
}

export interface GithubPlanningListOptions {
  repoOwner: string
  repoName: string
}

export interface GithubPlanningFetchByTitleOptions extends GithubPlanningListOptions {
  title: string
  issueId?: string
}

export class GithubPlanningClientError extends Error {
  constructor(
    public readonly code: PlanningArtifactErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'GithubPlanningClientError'
  }
}

export class GithubPlanningClient {
  constructor(
    private readonly authBridge: AuthBridge,
    private readonly apiUrl = GITHUB_API_URL,
    private readonly requestTimeoutMs = GITHUB_REQUEST_TIMEOUT_MS,
  ) {}

  async listByRepository(options: GithubPlanningListOptions): Promise<PlanningArtifact[]> {
    const repoOwner = options.repoOwner.trim()
    const repoName = options.repoName.trim()

    if (!repoOwner || !repoName) {
      throw new GithubPlanningClientError('UNKNOWN', 'GitHub repo owner and name are required')
    }

    const startedAt = Date.now()

    try {
      const token = await this.requireApiToken()
      const issues = await this.listPlanningIssues(token, {
        repoOwner,
        repoName,
      })

      const artifacts = issues
        .map((issue) => this.toPlanningArtifact(issue, repoOwner, repoName))
        .filter((artifact): artifact is PlanningArtifact => Boolean(artifact))
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))

      log.info('[github-planning-client] planning:list-by-repository', {
        repo: `${repoOwner}/${repoName}`,
        artifactCount: artifacts.length,
        latencyMs: Date.now() - startedAt,
      })

      return artifacts
    } catch (error) {
      const clientError = toGithubPlanningClientError(error)
      log.warn('[github-planning-client] planning:list-by-repository', {
        repo: `${repoOwner}/${repoName}`,
        status: clientError.code.toLowerCase(),
        error: clientError.message,
        latencyMs: Date.now() - startedAt,
      })
      throw clientError
    }
  }

  async fetchByTitle(options: GithubPlanningFetchByTitleOptions): Promise<PlanningArtifact | null> {
    const title = options.title.trim()
    const repoOwner = options.repoOwner.trim()
    const repoName = options.repoName.trim()

    if (!title) {
      throw new GithubPlanningClientError('UNKNOWN', 'Issue title is required')
    }

    if (!repoOwner || !repoName) {
      throw new GithubPlanningClientError('UNKNOWN', 'GitHub repo owner and name are required')
    }

    const startedAt = Date.now()

    try {
      const token = await this.requireApiToken()
      const issueNumber = parseIssueNumber(options.issueId)

      if (issueNumber) {
        const issue = await this.request<GithubIssue>(
          token,
          `/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}/issues/${issueNumber}`,
          {},
        )

        const artifact = this.toPlanningArtifact(issue, repoOwner, repoName)
        if (!artifact) {
          return null
        }

        log.info('[github-planning-client] planning:fetch', {
          repo: `${repoOwner}/${repoName}`,
          title,
          issueId: String(issueNumber),
          status: 'ok',
          latencyMs: Date.now() - startedAt,
        })

        return artifact
      }

      const issues = await this.listPlanningIssues(token, {
        repoOwner,
        repoName,
      })

      const matchingIssues = issues
        .filter((issue) => issue.title?.trim() === title)
        .sort((left, right) => toTimestamp(right.updated_at) - toTimestamp(left.updated_at))

      const selected = matchingIssues[0]
      if (!selected) {
        log.info('[github-planning-client] planning:fetch', {
          repo: `${repoOwner}/${repoName}`,
          title,
          status: 'not_found',
          latencyMs: Date.now() - startedAt,
        })
        return null
      }

      const artifact = this.toPlanningArtifact(selected, repoOwner, repoName)
      if (!artifact) {
        return null
      }

      log.info('[github-planning-client] planning:fetch', {
        repo: `${repoOwner}/${repoName}`,
        title,
        issueId: artifact.issueId,
        status: 'ok',
        latencyMs: Date.now() - startedAt,
      })

      return artifact
    } catch (error) {
      const clientError = toGithubPlanningClientError(error)

      log.warn('[github-planning-client] planning:fetch', {
        repo: `${repoOwner}/${repoName}`,
        title,
        issueId: options.issueId,
        status: clientError.code.toLowerCase(),
        error: clientError.message,
        latencyMs: Date.now() - startedAt,
      })

      throw clientError
    }
  }

  static toPlanningArtifactError(error: unknown): PlanningArtifactError {
    const clientError = toGithubPlanningClientError(error)
    return {
      code: clientError.code,
      message: clientError.message,
    }
  }

  private async requireApiToken(): Promise<string> {
    const envToken = process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim()
    if (envToken) {
      return envToken
    }

    const authToken = await this.authBridge.getApiKey('github')
    if (authToken?.trim()) {
      return authToken.trim()
    }

    throw new GithubPlanningClientError(
      'MISSING_API_KEY',
      'GitHub API token required. Configure provider "github" in auth.json or set GH_TOKEN.',
    )
  }

  private async listPlanningIssues(
    token: string,
    options: {
      repoOwner: string
      repoName: string
    },
  ): Promise<GithubIssue[]> {
    const dedupedByNumber = new Map<number, GithubIssue>()

    for (const label of GITHUB_PLANNING_LABELS) {
      for (let page = 1; page <= GITHUB_MAX_ISSUE_PAGES; page += 1) {
        const pageIssues = await this.request<GithubIssue[]>(
          token,
          `/repos/${encodeURIComponent(options.repoOwner)}/${encodeURIComponent(options.repoName)}/issues` +
            `?state=open&labels=${encodeURIComponent(label)}&per_page=${GITHUB_ISSUES_PAGE_SIZE}&page=${page}`,
          [],
        )

        for (const issue of pageIssues) {
          if (issue.pull_request) {
            continue
          }

          const issueNumber = issue.number
          if (!issueNumber || dedupedByNumber.has(issueNumber)) {
            continue
          }

          dedupedByNumber.set(issueNumber, issue)
        }

        if (pageIssues.length < GITHUB_ISSUES_PAGE_SIZE) {
          break
        }
      }
    }

    return Array.from(dedupedByNumber.values()).sort(
      (left, right) => toTimestamp(right.updated_at) - toTimestamp(left.updated_at),
    )
  }

  private toPlanningArtifact(issue: GithubIssue, repoOwner: string, repoName: string): PlanningArtifact | null {
    const issueNumber = issue.number ?? 0
    const title = issue.title?.trim() ?? `#${issueNumber}`

    if (!isPlanningIssue(issue) || !issueNumber || !title) {
      return null
    }

    const projectId = `github:${repoOwner}/${repoName}`
    const issueId = String(issueNumber)

    return {
      title,
      artifactKey: buildPlanningArtifactKey({
        title,
        scope: 'issue',
        projectId,
        issueId,
      }),
      content: issue.body ?? '',
      updatedAt: issue.updated_at ?? new Date().toISOString(),
      scope: 'issue',
      projectId,
      issueId,
    }
  }

  private async request<T>(
    token: string,
    path: string,
    fallback: T,
  ): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, this.requestTimeoutMs)

    let response: Response
    try {
      response = await fetch(`${this.apiUrl}${path}`, {
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          'content-type': 'application/json',
        },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (response.status === 401 || response.status === 403) {
      throw new GithubPlanningClientError('UNAUTHORIZED', 'Invalid GitHub API token', response.status)
    }

    if (response.status === 404) {
      throw new GithubPlanningClientError('NOT_FOUND', 'GitHub repository or issue not found', response.status)
    }

    if (response.status === 429) {
      throw new GithubPlanningClientError('RATE_LIMITED', 'GitHub API rate limit exceeded', response.status)
    }

    if (!response.ok) {
      throw new GithubPlanningClientError('NETWORK', `GitHub API request failed with status ${response.status}`, response.status)
    }

    const text = await response.text()
    if (!text.trim()) {
      return fallback
    }

    try {
      return JSON.parse(text) as T
    } catch (error) {
      throw new GithubPlanningClientError(
        'UNKNOWN',
        `Invalid GitHub API response: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

function parseIssueNumber(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const exactNumber = Number(trimmed)
  if (Number.isFinite(exactNumber) && exactNumber > 0) {
    return exactNumber
  }

  const hashMatch = trimmed.match(/#(\d+)$/)
  if (hashMatch?.[1]) {
    const parsed = Number(hashMatch[1])
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }

  return null
}

function isPlanningIssue(issue: GithubIssue): boolean {
  if (issue.pull_request) {
    return false
  }

  const labels = (issue.labels ?? [])
    .map((label) => label.name?.trim().toLowerCase())
    .filter((name): name is string => Boolean(name))

  return labels.includes('kata:artifact') || labels.includes('kata:milestone')
}

function toTimestamp(value: string | undefined): number {
  if (!value) {
    return 0
  }

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function toGithubPlanningClientError(error: unknown): GithubPlanningClientError {
  if (error instanceof GithubPlanningClientError) {
    return error
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new GithubPlanningClientError('NETWORK', 'GitHub API request timed out')
  }

  if (error instanceof TypeError) {
    return new GithubPlanningClientError('NETWORK', error.message)
  }

  if (error instanceof Error) {
    return new GithubPlanningClientError('UNKNOWN', error.message)
  }

  return new GithubPlanningClientError('UNKNOWN', String(error))
}
