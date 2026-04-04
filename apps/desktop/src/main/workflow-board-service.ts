import { promises as fs } from 'node:fs'
import path from 'node:path'
import { AuthBridge } from './auth-bridge'
import { LinearWorkflowClient } from './linear-workflow-client'
import { GithubWorkflowClient } from './github-workflow-client'
import log from './logger'
import { WorkflowContextService } from './workflow-context-service'
import { readWorkspaceWorkflowTrackerConfig } from './workflow-config-reader'
import type {
  SymphonyOperatorSnapshot,
  WorkflowBoardSliceCard,
  WorkflowBoardSnapshot,
  WorkflowBoardSnapshotResponse,
  WorkflowBoardTask,
  WorkflowContextSnapshot,
  WorkflowTrackerConfig,
  WorkflowSymphonyExecutionFreshness,
  WorkflowSymphonyExecutionProvenance,
} from '../shared/types'

const TEST_LINEAR_WORKFLOW_FIXTURE: WorkflowBoardSnapshot = {
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

const TEST_GITHUB_LABELS_WORKFLOW_FIXTURE: WorkflowBoardSnapshot = {
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
          columnId: 'todo',
          stateName: 'Todo',
          stateType: 'label',
          milestoneId: 'github:kata-sh/kata-mono',
          milestoneName: 'kata-sh/kata-mono',
          taskCounts: { total: 0, done: 0 },
          tasks: [],
          url: 'https://github.com/kata-sh/kata-mono/issues/2249',
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
          columnId: 'in_progress',
          stateName: 'In Progress',
          stateType: 'label',
          milestoneId: 'github:kata-sh/kata-mono',
          milestoneName: 'kata-sh/kata-mono',
          taskCounts: { total: 0, done: 0 },
          tasks: [],
          url: 'https://github.com/kata-sh/kata-mono/issues/2250',
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

const TEST_GITHUB_PROJECTS_WORKFLOW_FIXTURE: WorkflowBoardSnapshot = {
  backend: 'github',
  fetchedAt: '2026-04-04T00:00:00.000Z',
  status: 'fresh',
  source: {
    projectId: 'github:kata-sh/kata-mono:project:7',
    trackerKind: 'github',
    githubStateMode: 'projects_v2',
    repoOwner: 'kata-sh',
    repoName: 'kata-mono',
  },
  activeMilestone: {
    id: 'github-project-7',
    name: 'GitHub Project #7',
  },
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
          columnId: 'todo',
          stateName: 'Todo',
          stateType: 'projects_v2',
          milestoneId: 'github-project:7',
          milestoneName: 'GitHub Project #7',
          taskCounts: { total: 0, done: 0 },
          tasks: [],
          url: 'https://github.com/kata-sh/kata-mono/issues/2249',
        },
      ],
    },
    {
      id: 'in_progress',
      title: 'In Progress',
      cards: [
        {
          id: 'gh-2251',
          identifier: '#2251',
          title: '[S04] End-to-End Kanban Integration Proof',
          columnId: 'in_progress',
          stateName: 'In Progress',
          stateType: 'projects_v2',
          milestoneId: 'github-project:7',
          milestoneName: 'GitHub Project #7',
          taskCounts: { total: 0, done: 0 },
          tasks: [],
          url: 'https://github.com/kata-sh/kata-mono/issues/2251',
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

interface WorkflowBoardServiceOptions {
  authBridge: AuthBridge
  getWorkspacePath: () => string
  getSymphonySnapshot?: () => SymphonyOperatorSnapshot | null
}

export class WorkflowBoardService {
  private readonly linearClient: LinearWorkflowClient
  private readonly githubClient: GithubWorkflowClient
  private readonly contextService = new WorkflowContextService()

  private lastSnapshot: WorkflowBoardSnapshot | null = null
  private lastSuccessSnapshot: WorkflowBoardSnapshot | null = null
  private lastEnrichedSnapshot: WorkflowBoardSnapshot | null = null
  private lastEnrichedInputSnapshot: WorkflowBoardSnapshot | null = null
  private lastEnrichedSymphonyKey: string | null = null
  private inFlightRefresh: Promise<WorkflowBoardSnapshotResponse> | null = null
  private inFlightScopeKey: string | null = null

  private active = false
  private planningActive = false
  private scopeKey = 'workspace:none::session:none'
  private trackerConfigured = false
  private testScenario: WorkflowTestScenario | null = null

  constructor(private readonly options: WorkflowBoardServiceOptions) {
    this.linearClient = new LinearWorkflowClient(options.authBridge)
    this.githubClient = new GithubWorkflowClient(options.authBridge)
  }

  setActive(active: boolean): { success: true; active: boolean } {
    this.active = active
    this.syncContextSnapshot()
    return { success: true, active: this.active }
  }

  setScope(scopeKey: string): { success: true; scopeKey: string } {
    const normalized = scopeKey.trim() || 'workspace:none::session:none'
    const nextScenario = parseWorkflowTestScenario(normalized)

    if (this.scopeKey !== normalized || this.testScenario !== nextScenario) {
      this.scopeKey = normalized
      this.testScenario = nextScenario
      this.lastSnapshot = null
      this.lastSuccessSnapshot = null
      this.lastEnrichedSnapshot = null
      this.lastEnrichedInputSnapshot = null
      this.lastEnrichedSymphonyKey = null
    }

    this.syncContextSnapshot()
    return { success: true, scopeKey: this.scopeKey }
  }

  setPlanningActive(active: boolean): void {
    this.planningActive = active
    this.syncContextSnapshot()
  }

  getContext(): WorkflowContextSnapshot {
    const existing = this.contextService.getSnapshot()
    if (existing) {
      return existing
    }

    return {
      mode: 'unknown',
      reason: 'unknown_context',
      planningActive: this.planningActive,
      trackerConfigured: this.trackerConfigured,
      boardAvailable: Boolean(this.lastSnapshot),
      updatedAt: new Date().toISOString(),
    }
  }

  async getBoard(): Promise<WorkflowBoardSnapshotResponse> {
    if (this.lastSnapshot) {
      const snapshot = this.getCachedOrEnrichedSnapshot(this.lastSnapshot)
      this.syncContextSnapshot()
      return { success: true, snapshot }
    }

    return this.refreshBoard()
  }

  async refreshBoard(): Promise<WorkflowBoardSnapshotResponse> {
    const capturedScopeKey = this.scopeKey

    if (this.inFlightRefresh && this.inFlightScopeKey === capturedScopeKey) {
      return this.inFlightRefresh
    }

    const refreshPromise = this.performRefreshBoard(capturedScopeKey)
    this.inFlightRefresh = refreshPromise
    this.inFlightScopeKey = capturedScopeKey

    try {
      return await refreshPromise
    } finally {
      if (this.inFlightRefresh === refreshPromise) {
        this.inFlightRefresh = null
        this.inFlightScopeKey = null
      }
    }
  }

  private async performRefreshBoard(capturedScopeKey: string): Promise<WorkflowBoardSnapshotResponse> {
    if (this.testScenario) {
      const scenarioSnapshot = this.enrichWithSymphonyContext(this.buildScenarioSnapshot(this.testScenario))
      if (capturedScopeKey === this.scopeKey) {
        this.lastSnapshot = scenarioSnapshot
        if (scenarioSnapshot.status === 'fresh' || scenarioSnapshot.status === 'empty') {
          this.lastSuccessSnapshot = scenarioSnapshot
        }
        this.trackerConfigured = scenarioSnapshot.lastError?.code !== 'NOT_CONFIGURED'
        this.syncContextSnapshot()
      }
      return { success: true, snapshot: scenarioSnapshot }
    }

    if (process.env.KATA_TEST_WORKFLOW_FIXTURE === '1') {
      const fixture = this.enrichWithSymphonyContext(withFreshTimestamps(TEST_LINEAR_WORKFLOW_FIXTURE))
      if (capturedScopeKey === this.scopeKey) {
        this.lastSnapshot = fixture
        this.lastSuccessSnapshot = fixture
        this.trackerConfigured = true
        this.syncContextSnapshot()
      }
      return { success: true, snapshot: fixture }
    }

    if (!this.active && this.lastSnapshot) {
      this.syncContextSnapshot()
      return { success: true, snapshot: this.enrichWithSymphonyContext(this.lastSnapshot) }
    }

    if (!this.active) {
      const inactive = this.enrichWithSymphonyContext(
        this.toErrorSnapshot({
          nowIso: new Date().toISOString(),
          projectId: 'unknown',
          backend: 'linear',
          code: 'UNKNOWN',
          message: 'Workflow board inactive. Activate kanban pane to fetch execution state.',
        }),
      )
      if (capturedScopeKey === this.scopeKey) {
        this.lastSnapshot = inactive
        this.syncContextSnapshot()
      }
      return { success: true, snapshot: inactive }
    }

    const nowIso = new Date().toISOString()
    const workspacePath = this.options.getWorkspacePath()

    const trackerResolution = await this.resolveTrackerConfig(workspacePath)
    if (trackerResolution.error) {
      const snapshot = this.enrichWithSymphonyContext(
        this.toErrorSnapshot({
          nowIso,
          projectId: 'unknown',
          backend: 'linear',
          code: trackerResolution.error.code,
          message: trackerResolution.error.message,
        }),
      )

      if (capturedScopeKey === this.scopeKey) {
        this.lastSnapshot = snapshot
        this.trackerConfigured = false
        this.syncContextSnapshot()
      }
      return { success: true, snapshot }
    }

    const tracker = trackerResolution.config

    if (!tracker) {
      const snapshot = this.enrichWithSymphonyContext(
        this.toErrorSnapshot({
          nowIso,
          projectId: 'unknown',
          backend: 'linear',
          code: 'NOT_CONFIGURED',
          message: 'Workflow board tracker is not configured in WORKFLOW.md or .kata/preferences.md.',
        }),
      )
      if (capturedScopeKey === this.scopeKey) {
        this.lastSnapshot = snapshot
        this.trackerConfigured = false
        this.syncContextSnapshot()
      }
      return { success: true, snapshot }
    }

    if (isWorkflowFixtureEnabled()) {
      const fixture = this.enrichWithSymphonyContext(withFreshTimestamps(this.fixtureForTracker(tracker)))
      if (capturedScopeKey === this.scopeKey) {
        this.lastSnapshot = fixture
        this.lastSuccessSnapshot = fixture
        this.trackerConfigured = true
        this.syncContextSnapshot()
      }
      return { success: true, snapshot: fixture }
    }

    const boardProjectId = tracker.kind === 'github'
      ? `github:${tracker.repoOwner}/${tracker.repoName}`
      : tracker.projectRef

    try {
      const fetchedSnapshot =
        tracker.kind === 'github'
          ? await this.githubClient.fetchSnapshot({ config: tracker })
          : await this.linearClient.fetchActiveMilestoneSnapshot({ projectRef: tracker.projectRef })

      const snapshot: WorkflowBoardSnapshot = this.enrichWithSymphonyContext({
        ...fetchedSnapshot,
        poll: {
          ...fetchedSnapshot.poll,
          lastSuccessAt: fetchedSnapshot.fetchedAt,
        },
      })

      if (!this.active) {
        const inactive = this.enrichWithSymphonyContext(
          this.toErrorSnapshot({
            nowIso,
            projectId: boardProjectId,
            backend: snapshot.backend,
            code: 'UNKNOWN',
            message: 'Workflow board inactive. Activate kanban pane to fetch execution state.',
          }),
        )
        if (capturedScopeKey === this.scopeKey) {
          this.lastSnapshot = inactive
          this.syncContextSnapshot()
        }
        return { success: true, snapshot: inactive }
      }

      if (capturedScopeKey === this.scopeKey) {
        this.lastSnapshot = snapshot
        this.lastSuccessSnapshot = snapshot
        this.trackerConfigured = true
        this.syncContextSnapshot()
      }
      return { success: true, snapshot }
    } catch (error) {
      if (!this.active) {
        const inactive = this.enrichWithSymphonyContext(
          this.toErrorSnapshot({
            nowIso,
            projectId: boardProjectId,
            backend: tracker.kind === 'github' ? 'github' : 'linear',
            code: 'UNKNOWN',
            message: 'Workflow board inactive. Activate kanban pane to fetch execution state.',
          }),
        )
        if (capturedScopeKey === this.scopeKey) {
          this.lastSnapshot = inactive
          this.syncContextSnapshot()
        }
        return { success: true, snapshot: inactive }
      }

      const workflowError =
        tracker.kind === 'github'
          ? GithubWorkflowClient.toWorkflowError(error)
          : LinearWorkflowClient.toWorkflowError(error)

      const staleSnapshot: WorkflowBoardSnapshot = this.enrichWithSymphonyContext(
        this.lastSuccessSnapshot
          ? {
              ...this.lastSuccessSnapshot,
              status: 'stale',
              lastError: workflowError,
              poll: {
                ...this.lastSuccessSnapshot.poll,
                status: 'error',
                lastAttemptAt: nowIso,
              },
            }
          : this.toErrorSnapshot({
              nowIso,
              projectId: boardProjectId,
              backend: tracker.kind === 'github' ? 'github' : 'linear',
              code: workflowError.code,
              message: workflowError.message,
            }),
      )

      if (capturedScopeKey === this.scopeKey) {
        this.lastSnapshot = staleSnapshot
      }

      log.warn('[workflow-board-service] workflow refresh failed', {
        workspacePath,
        tracker,
        scopeKey: this.scopeKey,
        error: workflowError,
      })

      if (capturedScopeKey === this.scopeKey) {
        this.syncContextSnapshot()
      }
      return { success: true, snapshot: staleSnapshot }
    }
  }

  private getCachedOrEnrichedSnapshot(snapshot: WorkflowBoardSnapshot): WorkflowBoardSnapshot {
    const operatorSnapshot = this.options.getSymphonySnapshot?.() ?? null
    const symphonyKey = this.toSymphonyCacheKey(operatorSnapshot)

    if (
      this.lastEnrichedSnapshot &&
      this.lastEnrichedInputSnapshot === snapshot &&
      this.lastEnrichedSymphonyKey === symphonyKey
    ) {
      return this.lastEnrichedSnapshot
    }

    const enriched = this.enrichWithSymphonyContext(snapshot, operatorSnapshot)
    this.lastEnrichedSnapshot = enriched
    this.lastEnrichedInputSnapshot = snapshot
    this.lastEnrichedSymphonyKey = symphonyKey

    return enriched
  }

  private toSymphonyCacheKey(operatorSnapshot: SymphonyOperatorSnapshot | null): string {
    if (!operatorSnapshot) {
      return 'none'
    }

    return [
      operatorSnapshot.fetchedAt,
      operatorSnapshot.connection.state,
      operatorSnapshot.connection.updatedAt,
      operatorSnapshot.freshness.status,
      operatorSnapshot.workers.length,
      operatorSnapshot.escalations.length,
    ].join('|')
  }

  private enrichWithSymphonyContext(
    snapshot: WorkflowBoardSnapshot,
    cachedOperatorSnapshot: SymphonyOperatorSnapshot | null | undefined = undefined,
  ): WorkflowBoardSnapshot {
    const operatorSnapshot =
      cachedOperatorSnapshot === undefined ? (this.options.getSymphonySnapshot?.() ?? null) : cachedOperatorSnapshot

    if (!operatorSnapshot) {
      const columns = snapshot.columns.map((column) => ({
        ...column,
        cards: column.cards.map(({ symphony: _cardSymphony, tasks, ...card }) => ({
          ...card,
          tasks: tasks.map(({ symphony: _taskSymphony, ...task }) => task),
        })),
      }))

      return {
        ...snapshot,
        columns,
        symphony: {
          connectionState: 'unknown',
          freshness: 'unknown',
          provenance: 'unavailable',
          workerCount: 0,
          escalationCount: 0,
          diagnostics: {
            correlationMisses: [],
          },
        },
      }
    }

    const { freshness, provenance, staleReason } = deriveSymphonyEnvelope(operatorSnapshot)

    const workersByIdentifier = new Map<string, SymphonyOperatorSnapshot['workers'][number]>()
    const workersByIssueId = new Map<string, SymphonyOperatorSnapshot['workers'][number]>()
    for (const worker of operatorSnapshot.workers) {
      const normalizedIdentifier = normalizeIdentifier(worker.identifier)
      if (normalizedIdentifier) {
        workersByIdentifier.set(normalizedIdentifier, worker)
      }

      const normalizedIssueId = normalizeIdentifier(worker.issueId)
      if (normalizedIssueId) {
        workersByIssueId.set(normalizedIssueId, worker)
      }
    }

    const escalationsByIdentifier = new Map<string, Set<string>>()
    const escalationsByIssueId = new Map<string, Set<string>>()
    for (const escalation of operatorSnapshot.escalations) {
      const normalizedIdentifier = normalizeIdentifier(escalation.issueIdentifier)
      if (normalizedIdentifier) {
        const requestIds = escalationsByIdentifier.get(normalizedIdentifier) ?? new Set<string>()
        requestIds.add(escalation.requestId)
        escalationsByIdentifier.set(normalizedIdentifier, requestIds)
      }

      const normalizedIssueId = normalizeIdentifier(escalation.issueId)
      if (normalizedIssueId) {
        const requestIds = escalationsByIssueId.get(normalizedIssueId) ?? new Set<string>()
        requestIds.add(escalation.requestId)
        escalationsByIssueId.set(normalizedIssueId, requestIds)
      }
    }

    const matchedWorkerKeys = new Set<string>()
    const matchedEscalationRequestIds = new Set<string>()

    const enrichItem = (
      item: Pick<WorkflowBoardSliceCard, 'id' | 'identifier'> | Pick<WorkflowBoardTask, 'id' | 'identifier'>,
    ) => {
      const normalizedIdentifier = normalizeIdentifier(item.identifier)
      const normalizedIssueId = normalizeIdentifier(item.id)

      const workerByIdentifier = normalizedIdentifier ? workersByIdentifier.get(normalizedIdentifier) : undefined
      const workerByIssueId = normalizedIssueId ? workersByIssueId.get(normalizedIssueId) : undefined
      const worker = workerByIdentifier ?? workerByIssueId

      const escalationRequestIds = new Set<string>()
      for (const requestId of normalizedIdentifier ? escalationsByIdentifier.get(normalizedIdentifier) ?? [] : []) {
        escalationRequestIds.add(requestId)
      }
      for (const requestId of normalizedIssueId ? escalationsByIssueId.get(normalizedIssueId) ?? [] : []) {
        escalationRequestIds.add(requestId)
      }
      const pendingEscalations = escalationRequestIds.size

      if (workerByIdentifier && normalizedIdentifier) {
        matchedWorkerKeys.add(`identifier:${normalizedIdentifier}`)
      } else if (workerByIssueId && normalizedIssueId) {
        matchedWorkerKeys.add(`issue:${normalizedIssueId}`)
      }

      for (const requestId of escalationRequestIds) {
        matchedEscalationRequestIds.add(requestId)
      }

      return {
        issueId: worker?.issueId,
        identifier: worker?.identifier ?? item.identifier,
        workerState: worker?.state,
        toolName: worker?.toolName,
        model: worker?.model,
        lastActivityAt: worker?.lastActivityAt,
        lastError: worker?.lastError,
        pendingEscalations,
        assignmentState: worker ? ('assigned' as const) : ('unassigned' as const),
        freshness,
        provenance,
        staleReason,
      }
    }

    const columns = snapshot.columns.map((column) => ({
      ...column,
      cards: column.cards.map((card) => ({
        ...card,
        symphony: enrichItem(card),
        tasks: card.tasks.map((task) => ({
          ...task,
          symphony: enrichItem(task),
        })),
      })),
    }))

    const correlationMisses: string[] = []

    for (const worker of operatorSnapshot.workers) {
      const identifierKey = normalizeIdentifier(worker.identifier)
      const issueKey = normalizeIdentifier(worker.issueId)
      if (
        (identifierKey && matchedWorkerKeys.has(`identifier:${identifierKey}`)) ||
        (issueKey && matchedWorkerKeys.has(`issue:${issueKey}`))
      ) {
        continue
      }
      correlationMisses.push(`worker:${worker.identifier || worker.issueId}`)
    }

    for (const escalation of operatorSnapshot.escalations) {
      if (matchedEscalationRequestIds.has(escalation.requestId)) {
        continue
      }
      correlationMisses.push(`escalation:${escalation.requestId}`)
    }

    return {
      ...snapshot,
      columns,
      symphony: {
        connectionState: operatorSnapshot.connection.state,
        freshness,
        provenance,
        staleReason,
        fetchedAt: operatorSnapshot.fetchedAt,
        workerCount: operatorSnapshot.workers.length,
        escalationCount: operatorSnapshot.escalations.length,
        diagnostics: {
          correlationMisses,
        },
      },
    }
  }

  private syncContextSnapshot(): void {
    this.contextService.resolve({
      planningActive: this.planningActive,
      trackerConfigured: this.trackerConfigured,
      boardSnapshot: this.lastSnapshot,
    })
  }

  private buildScenarioSnapshot(scenario: WorkflowTestScenario): WorkflowBoardSnapshot {
    const nowIso = new Date().toISOString()

    if (scenario === 'missing-config') {
      return this.toErrorSnapshot({
        nowIso,
        projectId: 'unknown',
        backend: 'linear',
        code: 'NOT_CONFIGURED',
        message: 'Linear project is not configured in .kata/preferences.md (projectId or projectSlug).',
      })
    }

    if (scenario === 'auth-failure') {
      return this.toErrorSnapshot({
        nowIso,
        projectId: 'test-project',
        backend: 'linear',
        code: 'UNAUTHORIZED',
        message: 'Invalid Linear API key',
      })
    }

    if (scenario === 'empty') {
      const fixture = withFreshTimestamps(TEST_LINEAR_WORKFLOW_FIXTURE)
      return {
        ...fixture,
        status: 'empty',
        columns: fixture.columns.map((column) => ({ ...column, cards: [] })),
        activeMilestone: null,
        emptyReason: 'No slices found in the active milestone.',
      }
    }

    if (scenario === 'stale') {
      const baseline = this.lastSuccessSnapshot ?? withFreshTimestamps(TEST_LINEAR_WORKFLOW_FIXTURE)
      return {
        ...baseline,
        status: 'stale',
        lastError: {
          code: 'NETWORK',
          message: 'Network error while refreshing workflow board',
        },
        poll: {
          ...baseline.poll,
          status: 'error',
          lastAttemptAt: nowIso,
        },
      }
    }

    return withFreshTimestamps(TEST_LINEAR_WORKFLOW_FIXTURE)
  }

  async refreshContext(): Promise<WorkflowContextSnapshot> {
    try {
      const tracker = await this.resolveTrackerConfig(this.options.getWorkspacePath())
      this.trackerConfigured = Boolean(tracker.config)
    } catch {
      this.trackerConfigured = false
    }

    return this.contextService.resolve({
      planningActive: this.planningActive,
      trackerConfigured: this.trackerConfigured,
      boardSnapshot: this.lastSnapshot,
    }).next
  }

  private async resolveTrackerConfig(workspacePath: string): Promise<{
    config:
      | ({ kind: 'github' } & Extract<WorkflowTrackerConfig, { kind: 'github' }>)
      | ({ kind: 'linear'; projectRef: string })
      | null
    error?: NonNullable<WorkflowBoardSnapshot['lastError']>
  }> {
    const trackerResult = await readWorkspaceWorkflowTrackerConfig(workspacePath)
    if (trackerResult.error) {
      if (trackerResult.error.code === 'UNKNOWN') {
        try {
          await readLinearProjectReference(workspacePath)
        } catch (error) {
          return {
            config: null,
            error: {
              code: 'UNKNOWN',
              message: error instanceof Error ? error.message : String(error),
            },
          }
        }
      }

      return { config: null, error: trackerResult.error }
    }

    const trackerConfig = trackerResult.config
    if (trackerConfig?.kind === 'github') {
      return {
        config: trackerConfig,
      }
    }

    let projectRef: string | null
    try {
      projectRef = await readLinearProjectReference(workspacePath)
    } catch (error) {
      return {
        config: null,
        error: {
          code: 'UNKNOWN',
          message: error instanceof Error ? error.message : String(error),
        },
      }
    }

    if (projectRef) {
      return {
        config: {
          kind: 'linear',
          projectRef,
        },
      }
    }

    if (process.env.KATA_TEST_MODE === '1') {
      return {
        config: {
          kind: 'linear',
          projectRef: 'test-project',
        },
      }
    }

    return { config: null }
  }

  private fixtureForTracker(
    tracker:
      | ({ kind: 'github' } & Extract<WorkflowTrackerConfig, { kind: 'github' }>)
      | { kind: 'linear'; projectRef: string },
  ): WorkflowBoardSnapshot {
    if (tracker.kind === 'github') {
      return tracker.stateMode === 'projects_v2'
        ? TEST_GITHUB_PROJECTS_WORKFLOW_FIXTURE
        : TEST_GITHUB_LABELS_WORKFLOW_FIXTURE
    }

    return TEST_LINEAR_WORKFLOW_FIXTURE
  }

  private toErrorSnapshot(input: {
    nowIso: string
    projectId: string
    backend: WorkflowBoardSnapshot['backend']
    code: NonNullable<WorkflowBoardSnapshot['lastError']>['code']
    message: string
  }): WorkflowBoardSnapshot {
    return {
      backend: input.backend,
      fetchedAt: input.nowIso,
      status: 'error',
      source: { projectId: input.projectId },
      activeMilestone: null,
      columns: TEST_LINEAR_WORKFLOW_FIXTURE.columns.map((column) => ({
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
        backend: input.backend,
        lastAttemptAt: input.nowIso,
      },
    }
  }
}

function deriveSymphonyEnvelope(operatorSnapshot: SymphonyOperatorSnapshot): {
  freshness: WorkflowSymphonyExecutionFreshness
  provenance: WorkflowSymphonyExecutionProvenance
  staleReason?: string
} {
  if (operatorSnapshot.connection.state === 'disconnected') {
    return {
      freshness: 'disconnected',
      provenance: 'runtime-disconnected',
      staleReason:
        operatorSnapshot.connection.lastError ??
        operatorSnapshot.freshness.staleReason ??
        'Symphony runtime is disconnected.',
    }
  }

  if (
    operatorSnapshot.connection.state === 'reconnecting' ||
    operatorSnapshot.freshness.status === 'stale'
  ) {
    return {
      freshness: 'stale',
      provenance: 'operator-stale',
      staleReason:
        operatorSnapshot.freshness.staleReason ??
        operatorSnapshot.connection.lastError ??
        'Symphony operator data is stale.',
    }
  }

  if (operatorSnapshot.connection.state === 'connected') {
    return {
      freshness: 'fresh',
      provenance: 'dashboard-derived',
    }
  }

  return {
    freshness: 'unknown',
    provenance: 'unavailable',
    staleReason: operatorSnapshot.connection.lastError ?? operatorSnapshot.freshness.staleReason,
  }
}

function normalizeIdentifier(value: string | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized.toUpperCase() : null
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
      lastSuccessAt: snapshot.poll.status === 'success' ? nowIso : snapshot.poll.lastSuccessAt,
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

type WorkflowTestScenario =
  | 'missing-config'
  | 'auth-failure'
  | 'empty'
  | 'stale'
  | 'recovery'

function parseWorkflowTestScenario(scopeKey: string): WorkflowTestScenario | null {
  if (process.env.KATA_TEST_MODE !== '1') {
    return null
  }

  const marker = 'scenario:'
  const idx = scopeKey.indexOf(marker)
  if (idx < 0) {
    return null
  }

  const value = scopeKey.slice(idx + marker.length).trim().toLowerCase()
  if (
    value === 'missing-config' ||
    value === 'auth-failure' ||
    value === 'empty' ||
    value === 'stale' ||
    value === 'recovery'
  ) {
    return value
  }

  return null
}
