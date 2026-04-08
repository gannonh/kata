import { promises as fs } from 'node:fs'
import path from 'node:path'
import { WORKFLOW_COLUMNS } from '../shared/types'
import { AuthBridge } from './auth-bridge'
import { LinearWorkflowClient, mapLinearStateToColumnId } from './linear-workflow-client'
import { GithubWorkflowClient } from './github-workflow-client'
import log from './logger'
import { WorkflowContextService } from './workflow-context-service'
import { readWorkspaceWorkflowTrackerConfig } from './workflow-config-reader'
import { mapWorkflowBoardSnapshotToReliability } from './reliability-contract'
import type {
  SymphonyOperatorSnapshot,
  WorkflowBoardScope,
  WorkflowBoardScopeDiagnostics,
  WorkflowBoardScopeRequest,
  WorkflowBoardScopeResolutionReason,
  WorkflowBoardScopeResponse,
  WorkflowBoardSliceCard,
  WorkflowBoardSnapshot,
  WorkflowBoardSnapshotResponse,
  WorkflowBoardTask,
  WorkflowContextSnapshot,
  WorkflowMoveEntityRequest,
  WorkflowMoveEntityResult,
  WorkflowCreateTaskRequest,
  WorkflowCreateTaskResult,
  WorkflowTaskDetailRequest,
  WorkflowTaskDetailResponse,
  WorkflowUpdateTaskRequest,
  WorkflowUpdateTaskResult,
  WorkflowTrackerConfig,
  WorkflowColumnId,
  WorkflowSymphonyExecutionFreshness,
  WorkflowSymphonyExecutionProvenance,
  ReliabilitySignal,
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
          url: 'https://linear.app/kata-sh/issue/KAT-2247',
          taskCounts: { total: 2, done: 1 },
          tasks: [
            {
              id: 'task-1',
              identifier: 'KAT-2251',
              title: '[T01] Define canonical workflow snapshot contract',
              description: 'Baseline fixture task for completed-state coverage.',
              columnId: 'done',
              stateName: 'Done',
              stateType: 'completed',
            },
            {
              id: 'task-2',
              identifier: 'KAT-2252',
              title: '[T02] Wire workflow board service through IPC',
              description: 'Fixture task used for edit-dialog hydration and mutation coverage.',
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

const TEST_LINEAR_ASSEMBLED_WORKFLOW_FIXTURE: WorkflowBoardSnapshot = {
  backend: 'linear',
  fetchedAt: '2026-04-04T00:00:00.000Z',
  status: 'fresh',
  source: {
    projectId: 'test-project',
    activeMilestoneId: 'm004',
  },
  activeMilestone: {
    id: 'm004',
    name: '[M004] Symphony Integration',
  },
  columns: [
    { id: 'backlog', title: 'Backlog', cards: [] },
    {
      id: 'in_progress',
      title: 'In Progress',
      cards: [
        {
          id: 'slice-s04',
          identifier: 'KAT-2337',
          title: '[S04] End-to-End Desktop Symphony Operation',
          columnId: 'in_progress',
          stateName: 'In Progress',
          stateType: 'started',
          milestoneId: 'm004',
          milestoneName: '[M004] Symphony Integration',
          taskCounts: { total: 4, done: 1 },
          tasks: [
            {
              id: 'task-s04-2',
              identifier: 'KAT-2356',
              title: '[T02] Prove the healthy assembled operator flow in Electron',
              description: 'Assembled fixture task for live symphony board correlation.',
              columnId: 'in_progress',
              stateName: 'In Progress',
              stateType: 'started',
            },
          ],
        },
      ],
    },
    { id: 'todo', title: 'Todo', cards: [] },
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
  private requestedScope: WorkflowBoardScope = 'project'
  private lastScopeDiagnostics: WorkflowBoardScopeDiagnostics = {
    requested: 'project',
    resolved: 'project',
    reason: 'requested',
  }
  private trackerConfigured = false
  private testScenario: WorkflowTestScenario | null = null
  private testFixtureSnapshot: WorkflowBoardSnapshot | null = null

  constructor(private readonly options: WorkflowBoardServiceOptions) {
    this.linearClient = new LinearWorkflowClient(options.authBridge)
    this.githubClient = new GithubWorkflowClient(options.authBridge)
  }

  setActive(active: boolean): { success: true; active: boolean } {
    this.active = active
    this.syncContextSnapshot()
    return { success: true, active: this.active }
  }

  setScope(request: WorkflowBoardScopeRequest | string): WorkflowBoardScopeResponse {
    const parsed = parseScopeRequest(request)
    const normalizedScopeKey = parsed.scopeKey || 'workspace:none::session:none'
    const nextScenario = parseWorkflowTestScenario(normalizedScopeKey)
    const nextRequestedScope = parsed.requestedScope

    if (
      this.scopeKey !== normalizedScopeKey ||
      this.testScenario !== nextScenario ||
      this.requestedScope !== nextRequestedScope
    ) {
      this.scopeKey = normalizedScopeKey
      this.testScenario = nextScenario
      this.requestedScope = nextRequestedScope
      this.lastSnapshot = null
      this.lastSuccessSnapshot = null
      this.lastEnrichedSnapshot = null
      this.lastEnrichedInputSnapshot = null
      this.lastEnrichedSymphonyKey = null
      this.lastScopeDiagnostics = {
        requested: nextRequestedScope,
        resolved: nextRequestedScope,
        reason: 'requested',
      }
      this.testFixtureSnapshot = null
    }

    this.syncContextSnapshot()
    return {
      success: true,
      scopeKey: this.scopeKey,
      requestedScope: this.requestedScope,
      resolvedScope: this.lastScopeDiagnostics.resolved,
      resolutionReason: this.lastScopeDiagnostics.reason,
    }
  }

  async moveEntity(request: WorkflowMoveEntityRequest): Promise<WorkflowMoveEntityResult> {
    const entityId = request.entityId.trim()
    const updatedAt = new Date().toISOString()

    if (!entityId) {
      return {
        success: false,
        entityKind: request.entityKind,
        entityId,
        targetColumnId: request.targetColumnId,
        status: 'error',
        code: 'VALIDATION_ERROR',
        phase: 'rolled_back',
        message: 'Entity id is required for workflow move.',
        refreshBoard: false,
        updatedAt,
      }
    }

    const snapshot = this.lastSnapshot ?? (await this.getBoard()).snapshot
    if (snapshot.backend !== 'linear') {
      return {
        success: false,
        entityKind: request.entityKind,
        entityId,
        targetColumnId: request.targetColumnId,
        status: 'error',
        code: 'UNSUPPORTED',
        phase: 'rolled_back',
        message: 'Workflow board mutations are currently supported only for Linear trackers.',
        refreshBoard: false,
        updatedAt,
      }
    }

    const entity = findWorkflowEntity(snapshot, request.entityKind, entityId)
    if (!entity) {
      return {
        success: false,
        entityKind: request.entityKind,
        entityId,
        targetColumnId: request.targetColumnId,
        status: 'error',
        code: 'NOT_FOUND',
        phase: 'rolled_back',
        message: `Workflow entity ${entityId} is no longer visible on the board.`,
        refreshBoard: true,
        updatedAt,
      }
    }

    if (isWorkflowFixtureEnabled()) {
      const fixtureSnapshot = this.testFixtureSnapshot ?? this.lastSuccessSnapshot ?? this.resolveTestLinearFixture()

      if (request.targetColumnId === 'human_review') {
        return {
          success: false,
          entityKind: request.entityKind,
          entityId,
          targetColumnId: request.targetColumnId,
          status: 'error',
          code: 'ROLLED_BACK',
          phase: 'rolled_back',
          message: 'Mocked Linear move failure for rollback coverage.',
          refreshBoard: false,
          updatedAt,
        }
      }

      const movedSnapshot = applyWorkflowEntityMove(fixtureSnapshot, {
        entityKind: request.entityKind,
        entityId,
        targetColumnId: request.targetColumnId,
      })

      this.testFixtureSnapshot = withFreshTimestamps(movedSnapshot)
      const scopedSnapshot = this.resolveScope(this.enrichWithSymphonyContext(this.testFixtureSnapshot))
      this.lastSnapshot = scopedSnapshot
      this.lastSuccessSnapshot = scopedSnapshot

      return {
        success: true,
        entityKind: request.entityKind,
        entityId,
        targetColumnId: request.targetColumnId,
        status: 'success',
        code: 'COMMITTED',
        phase: 'committed',
        message: `${request.entityKind === 'slice' ? 'Slice' : 'Task'} moved to ${toColumnTitle(request.targetColumnId)}.`,
        refreshBoard: true,
        updatedAt,
      }
    }

    try {
      await this.linearClient.moveIssueToColumn({
        issueId: entityId,
        targetColumnId: request.targetColumnId,
      })

      return {
        success: true,
        entityKind: request.entityKind,
        entityId,
        targetColumnId: request.targetColumnId,
        status: 'success',
        code: 'COMMITTED',
        phase: 'committed',
        message: `${request.entityKind === 'slice' ? 'Slice' : 'Task'} moved to ${toColumnTitle(request.targetColumnId)}.`,
        refreshBoard: true,
        updatedAt,
      }
    } catch (error) {
      const workflowError = LinearWorkflowClient.toWorkflowError(error)
      const code = workflowError.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'FAILED'

      return {
        success: false,
        entityKind: request.entityKind,
        entityId,
        targetColumnId: request.targetColumnId,
        status: 'error',
        code,
        phase: 'rolled_back',
        message: workflowError.message,
        refreshBoard: false,
        updatedAt,
      }
    }
  }

  async createTask(request: WorkflowCreateTaskRequest): Promise<WorkflowCreateTaskResult> {
    const parentSliceId = request.parentSliceId.trim()
    const updatedAt = new Date().toISOString()

    if (!parentSliceId) {
      return {
        success: false,
        parentSliceId,
        status: 'error',
        code: 'VALIDATION_ERROR',
        message: 'Parent slice id is required.',
        refreshBoard: false,
        updatedAt,
      }
    }

    const title = request.title.trim()
    if (!title) {
      return {
        success: false,
        parentSliceId,
        status: 'error',
        code: 'VALIDATION_ERROR',
        message: 'Task title is required.',
        refreshBoard: false,
        updatedAt,
      }
    }

    const snapshot = this.lastSnapshot ?? (await this.getBoard()).snapshot
    if (snapshot.backend !== 'linear') {
      return {
        success: false,
        parentSliceId,
        status: 'error',
        code: 'UNSUPPORTED',
        message: 'Workflow board task creation is currently supported only for Linear trackers.',
        refreshBoard: false,
        updatedAt,
      }
    }

    const parentSlice = findWorkflowEntity(snapshot, 'slice', parentSliceId)
    if (!parentSlice || !('tasks' in parentSlice)) {
      return {
        success: false,
        parentSliceId,
        status: 'error',
        code: 'NOT_FOUND',
        message: `Parent slice ${parentSliceId} is no longer visible on the board.`,
        refreshBoard: true,
        updatedAt,
      }
    }

    if (isWorkflowFixtureEnabled()) {
      if (/fail/i.test(title)) {
        return {
          success: false,
          parentSliceId,
          status: 'error',
          code: 'ROLLED_BACK',
          message: 'Mocked Linear task creation failure for rollback coverage.',
          refreshBoard: false,
          updatedAt,
        }
      }

      const fixtureSnapshot = this.testFixtureSnapshot ?? this.lastSuccessSnapshot ?? this.resolveTestLinearFixture()
      const nextTaskNumber = countWorkflowTasks(fixtureSnapshot) + 1
      const createdTaskId = `task-created-${nextTaskNumber}`

      const createdSnapshot = applyWorkflowTaskCreate(fixtureSnapshot, {
        parentSliceId,
        task: {
          id: createdTaskId,
          identifier: `KAT-NEW-${nextTaskNumber}`,
          title,
          columnId: request.initialColumnId ?? 'todo',
          stateName: toColumnTitle(request.initialColumnId ?? 'todo'),
          stateType: toColumnStateType(request.initialColumnId ?? 'todo'),
          teamId: request.teamId,
          projectId: request.projectId,
          parentSliceId,
          description: request.description ?? '',
        },
      })

      this.testFixtureSnapshot = withFreshTimestamps(createdSnapshot)
      const scopedSnapshot = this.resolveScope(this.enrichWithSymphonyContext(this.testFixtureSnapshot))
      this.lastSnapshot = scopedSnapshot
      this.lastSuccessSnapshot = scopedSnapshot

      return {
        success: true,
        parentSliceId,
        status: 'success',
        code: 'CREATED',
        message: 'Task created successfully.',
        refreshBoard: true,
        updatedAt,
        task: {
          id: createdTaskId,
          identifier: `KAT-NEW-${nextTaskNumber}`,
          title,
          columnId: request.initialColumnId ?? 'todo',
        },
      }
    }

    try {
      const created = await this.linearClient.createChildTask({
        parentIssueId: parentSliceId,
        title,
        description: request.description,
        initialColumnId: request.initialColumnId ?? 'todo',
      })

      return {
        success: true,
        parentSliceId,
        status: 'success',
        code: 'CREATED',
        message: 'Task created successfully.',
        refreshBoard: true,
        updatedAt,
        task: {
          id: created.id,
          identifier: created.identifier,
          title: created.title ?? title,
          columnId: mapLinearStateToColumnId(created.stateName, created.stateType),
        },
      }
    } catch (error) {
      const workflowError = LinearWorkflowClient.toWorkflowError(error)
      const code = workflowError.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'FAILED'
      return {
        success: false,
        parentSliceId,
        status: 'error',
        code,
        message: workflowError.message,
        refreshBoard: false,
        updatedAt,
      }
    }
  }

  async getTaskDetail(request: WorkflowTaskDetailRequest): Promise<WorkflowTaskDetailResponse> {
    const taskId = request.taskId.trim()
    if (!taskId) {
      return {
        success: false,
        code: 'FAILED',
        message: 'Task id is required.',
      }
    }

    const snapshot = this.lastSnapshot ?? (await this.getBoard()).snapshot
    if (snapshot.backend !== 'linear') {
      return {
        success: false,
        code: 'UNSUPPORTED',
        message: 'Task editing is currently supported only for Linear trackers.',
      }
    }

    if (isWorkflowFixtureEnabled()) {
      const task = findWorkflowEntity(snapshot, 'task', taskId)
      if (!task || 'tasks' in task) {
        return {
          success: false,
          code: 'NOT_FOUND',
          message: `Task ${taskId} is no longer visible on the board.`,
        }
      }

      return {
        success: true,
        code: 'LOADED',
        message: 'Task details loaded.',
        task: {
          id: task.id,
          identifier: task.identifier,
          parentSliceId: task.parentSliceId,
          teamId: task.teamId,
          projectId: task.projectId,
          stateId: task.stateId,
          stateName: task.stateName,
          stateType: task.stateType,
          columnId: task.columnId,
          title: task.title,
          description: task.description ?? '',
        },
      }
    }

    try {
      const detail = await this.linearClient.fetchIssueDetail({ issueId: taskId })
      return {
        success: true,
        code: 'LOADED',
        message: 'Task details loaded.',
        task: {
          id: detail.id,
          identifier: detail.identifier,
          parentSliceId: detail.parentId,
          teamId: detail.teamId,
          projectId: detail.projectId,
          stateId: detail.stateId,
          stateName: detail.stateName,
          stateType: detail.stateType,
          columnId: detail.columnId,
          title: detail.title ?? '',
          description: detail.description,
        },
      }
    } catch (error) {
      const workflowError = LinearWorkflowClient.toWorkflowError(error)
      return {
        success: false,
        code: workflowError.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'FAILED',
        message: workflowError.message,
      }
    }
  }

  async updateTask(request: WorkflowUpdateTaskRequest): Promise<WorkflowUpdateTaskResult> {
    const taskId = request.taskId.trim()
    const updatedAt = new Date().toISOString()

    if (!taskId) {
      return {
        success: false,
        taskId,
        status: 'error',
        code: 'VALIDATION_ERROR',
        message: 'Task id is required.',
        refreshBoard: false,
        updatedAt,
      }
    }

    const title = request.title.trim()
    if (!title) {
      return {
        success: false,
        taskId,
        status: 'error',
        code: 'VALIDATION_ERROR',
        message: 'Task title is required.',
        refreshBoard: false,
        updatedAt,
      }
    }

    const snapshot = this.lastSnapshot ?? (await this.getBoard()).snapshot
    if (snapshot.backend !== 'linear') {
      return {
        success: false,
        taskId,
        status: 'error',
        code: 'UNSUPPORTED',
        message: 'Task editing is currently supported only for Linear trackers.',
        refreshBoard: false,
        updatedAt,
      }
    }

    const existingTask = findWorkflowEntity(snapshot, 'task', taskId)
    if (!existingTask || 'tasks' in existingTask) {
      return {
        success: false,
        taskId,
        status: 'error',
        code: 'NOT_FOUND',
        message: `Task ${taskId} is no longer visible on the board.`,
        refreshBoard: true,
        updatedAt,
      }
    }

    if (isWorkflowFixtureEnabled()) {
      if (/fail/i.test(title)) {
        return {
          success: false,
          taskId,
          status: 'error',
          code: 'ROLLED_BACK',
          message: 'Mocked Linear task update failure for rollback coverage.',
          refreshBoard: false,
          updatedAt,
        }
      }

      const targetColumnId = request.targetColumnId ?? existingTask.columnId
      const fixtureSnapshot = this.testFixtureSnapshot ?? this.lastSuccessSnapshot ?? this.resolveTestLinearFixture()
      const updatedSnapshot = applyWorkflowTaskUpdate(fixtureSnapshot, {
        taskId,
        title,
        columnId: targetColumnId,
        description: request.description,
      })

      this.testFixtureSnapshot = withFreshTimestamps(updatedSnapshot)
      const scopedSnapshot = this.resolveScope(this.enrichWithSymphonyContext(this.testFixtureSnapshot))
      this.lastSnapshot = scopedSnapshot
      this.lastSuccessSnapshot = scopedSnapshot

      return {
        success: true,
        taskId,
        status: 'success',
        code: 'UPDATED',
        message: 'Task updated successfully.',
        refreshBoard: true,
        updatedAt,
        task: {
          id: taskId,
          identifier: existingTask.identifier,
          title,
          columnId: targetColumnId,
        },
      }
    }

    try {
      const updatedTask = await this.linearClient.updateTask({
        issueId: taskId,
        title,
        description: request.description,
        targetColumnId: request.targetColumnId,
      })

      return {
        success: true,
        taskId,
        status: 'success',
        code: 'UPDATED',
        message: 'Task updated successfully.',
        refreshBoard: true,
        updatedAt,
        task: {
          id: updatedTask.id,
          identifier: updatedTask.identifier,
          title: updatedTask.title ?? title,
          columnId: updatedTask.columnId,
        },
      }
    } catch (error) {
      const workflowError = LinearWorkflowClient.toWorkflowError(error)
      return {
        success: false,
        taskId,
        status: 'error',
        code: workflowError.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'FAILED',
        message: workflowError.message,
        refreshBoard: false,
        updatedAt,
      }
    }
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

  getReliabilitySignal(): ReliabilitySignal | null {
    return mapWorkflowBoardSnapshotToReliability(this.lastSnapshot)
  }

  async getBoard(): Promise<WorkflowBoardSnapshotResponse> {
    if (this.lastSnapshot) {
      const snapshot = this.resolveScope(this.getCachedOrEnrichedSnapshot(this.lastSnapshot))
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
      const scenarioSnapshot = this.resolveScope(this.enrichWithSymphonyContext(this.buildScenarioSnapshot(this.testScenario)))
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
      const baseFixture = this.testFixtureSnapshot ?? this.resolveTestLinearFixture()
      this.testFixtureSnapshot = withFreshTimestamps(baseFixture)

      const fixture = this.resolveScope(this.enrichWithSymphonyContext(this.testFixtureSnapshot))
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
      return { success: true, snapshot: this.resolveScope(this.enrichWithSymphonyContext(this.lastSnapshot)) }
    }

    if (!this.active) {
      const inactive = this.resolveScope(
        this.enrichWithSymphonyContext(
          this.toErrorSnapshot({
            nowIso: new Date().toISOString(),
            projectId: 'unknown',
            backend: 'linear',
            code: 'UNKNOWN',
            message: 'Workflow board inactive. Activate kanban pane to fetch execution state.',
          }),
        ),
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
      const snapshot = this.resolveScope(
        this.enrichWithSymphonyContext(
          this.toErrorSnapshot({
            nowIso,
            projectId: 'unknown',
            backend: 'linear',
            code: trackerResolution.error.code,
            message: trackerResolution.error.message,
          }),
        ),
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
      const snapshot = this.resolveScope(
        this.enrichWithSymphonyContext(
          this.toErrorSnapshot({
            nowIso,
            projectId: 'unknown',
            backend: 'linear',
            code: 'NOT_CONFIGURED',
            message: 'Workflow board tracker is not configured in WORKFLOW.md or .kata/preferences.md.',
          }),
        ),
      )
      if (capturedScopeKey === this.scopeKey) {
        this.lastSnapshot = snapshot
        this.trackerConfigured = false
        this.syncContextSnapshot()
      }
      return { success: true, snapshot }
    }

    if (isWorkflowFixtureEnabled()) {
      const baseFixture = this.testFixtureSnapshot ?? this.fixtureForTracker(tracker)
      this.testFixtureSnapshot = withFreshTimestamps(baseFixture)

      const fixture = this.resolveScope(this.enrichWithSymphonyContext(this.testFixtureSnapshot))
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
          : this.requestedScope === 'project' || this.requestedScope === 'active'
            ? await this.linearClient.fetchProjectSnapshot({ projectRef: tracker.projectRef })
            : await this.linearClient.fetchActiveMilestoneSnapshot({ projectRef: tracker.projectRef })

      const snapshot: WorkflowBoardSnapshot = this.resolveScope(
        this.enrichWithSymphonyContext({
          ...fetchedSnapshot,
          poll: {
            ...fetchedSnapshot.poll,
            lastSuccessAt: fetchedSnapshot.fetchedAt,
          },
        }),
      )

      if (!this.active) {
        const inactive = this.resolveScope(
          this.enrichWithSymphonyContext(
            this.toErrorSnapshot({
              nowIso,
              projectId: boardProjectId,
              backend: snapshot.backend,
              code: 'UNKNOWN',
              message: 'Workflow board inactive. Activate kanban pane to fetch execution state.',
            }),
          ),
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
        const inactive = this.resolveScope(
          this.enrichWithSymphonyContext(
            this.toErrorSnapshot({
              nowIso,
              projectId: boardProjectId,
              backend: tracker.kind === 'github' ? 'github' : 'linear',
              code: 'UNKNOWN',
              message: 'Workflow board inactive. Activate kanban pane to fetch execution state.',
            }),
          ),
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

      const staleSnapshot: WorkflowBoardSnapshot = this.resolveScope(
        this.enrichWithSymphonyContext(
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
        ),
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

  private resolveScope(snapshot: WorkflowBoardSnapshot): WorkflowBoardSnapshot {
    let resolvedScope: WorkflowBoardScope = this.requestedScope
    let resolutionReason: WorkflowBoardScopeResolutionReason = 'requested'
    let note: string | undefined

    if (this.requestedScope === 'milestone' && snapshot.backend === 'github') {
      resolvedScope = 'project'
      resolutionReason = 'milestone_scope_not_supported'
      note = 'Milestone scope is unavailable for GitHub trackers. Showing project scope.'
    }

    // When Active scope is requested, determine whether Symphony can provide
    // active-work data. If not, keep resolvedScope as 'active' but produce
    // an empty board so the user sees "no active work" instead of a misleading
    // full project backlog.
    let activeUnavailable = false

    if (this.requestedScope === 'active') {
      const symphonyEnvelope = snapshot.symphony
      if (!symphonyEnvelope || symphonyEnvelope.provenance === 'unavailable') {
        activeUnavailable = true
        resolutionReason = 'operator_state_unavailable'
        note = 'Symphony is not running. Start Symphony to see active work.'
      } else if (symphonyEnvelope.freshness === 'stale') {
        activeUnavailable = true
        resolutionReason = 'operator_state_stale'
        note = symphonyEnvelope.staleReason ?? 'Symphony state is stale. Start or reconnect Symphony to see active work.'
      } else if (symphonyEnvelope.freshness === 'disconnected') {
        activeUnavailable = true
        resolutionReason = 'operator_state_disconnected'
        note = symphonyEnvelope.staleReason ?? 'Symphony is disconnected. Active work will appear when the connection is restored.'
      }
    }

    let scopedSnapshot = snapshot
    let activeMatchIdentifiers: string[] | undefined
    let activeMatchCount: number | undefined

    if (resolvedScope === 'active') {
      if (activeUnavailable) {
        // Return empty columns so the board shows "no active work" rather
        // than falling back to the full project backlog.
        scopedSnapshot = {
          ...snapshot,
          columns: snapshot.columns.map((col) => ({ ...col, cards: [] })),
        }
        activeMatchCount = 0
        activeMatchIdentifiers = []
      } else {
        const activeOnly = projectActiveScope(snapshot)
        scopedSnapshot = activeOnly.snapshot
        activeMatchCount = activeOnly.matchIdentifiers.length
        activeMatchIdentifiers = activeOnly.matchIdentifiers
      }
    }

    const diagnostics: WorkflowBoardScopeDiagnostics = {
      requested: this.requestedScope,
      resolved: resolvedScope,
      reason: resolutionReason,
      operatorFreshness: snapshot.symphony?.freshness,
      ...(activeMatchCount !== undefined ? { activeMatchCount } : {}),
      ...(activeMatchIdentifiers ? { activeMatchIdentifiers } : {}),
      ...(note ? { note } : {}),
    }

    this.lastScopeDiagnostics = diagnostics
    return {
      ...scopedSnapshot,
      scope: diagnostics,
    }
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

    const escalationsByIdentifier = new Map<string, SymphonyOperatorSnapshot['escalations']>()
    const escalationsByIssueId = new Map<string, SymphonyOperatorSnapshot['escalations']>()
    for (const escalation of operatorSnapshot.escalations) {
      const normalizedIdentifier = normalizeIdentifier(escalation.issueIdentifier)
      if (normalizedIdentifier) {
        const entries = escalationsByIdentifier.get(normalizedIdentifier) ?? []
        entries.push(escalation)
        escalationsByIdentifier.set(normalizedIdentifier, entries)
      }

      const normalizedIssueId = normalizeIdentifier(escalation.issueId)
      if (normalizedIssueId) {
        const entries = escalationsByIssueId.get(normalizedIssueId) ?? []
        entries.push(escalation)
        escalationsByIssueId.set(normalizedIssueId, entries)
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

      const matchedEscalationsByRequestId = new Map<string, SymphonyOperatorSnapshot['escalations'][number]>()
      for (const escalation of normalizedIdentifier ? escalationsByIdentifier.get(normalizedIdentifier) ?? [] : []) {
        matchedEscalationsByRequestId.set(escalation.requestId, escalation)
      }
      for (const escalation of normalizedIssueId ? escalationsByIssueId.get(normalizedIssueId) ?? [] : []) {
        matchedEscalationsByRequestId.set(escalation.requestId, escalation)
      }

      const matchedEscalations = Array.from(matchedEscalationsByRequestId.values())
      const pendingEscalations = matchedEscalations.length

      if (workerByIdentifier && normalizedIdentifier) {
        matchedWorkerKeys.add(`identifier:${normalizedIdentifier}`)
      } else if (workerByIssueId && normalizedIssueId) {
        matchedWorkerKeys.add(`issue:${normalizedIssueId}`)
      }

      for (const escalation of matchedEscalations) {
        matchedEscalationRequestIds.add(escalation.requestId)
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
        pendingEscalationRequests: matchedEscalations.map((escalation) => ({
          requestId: escalation.requestId,
          questionPreview: escalation.questionPreview,
          createdAt: escalation.createdAt,
          timeoutMs: escalation.timeoutMs,
        })),
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

  private resolveTestLinearFixture(): WorkflowBoardSnapshot {
    const mode = process.env.KATA_DESKTOP_SYMPHONY_DASHBOARD_MOCK?.trim()
    if (mode === 'assembled_healthy' || mode === 'assembled_failure_recovery') {
      return TEST_LINEAR_ASSEMBLED_WORKFLOW_FIXTURE
    }

    return TEST_LINEAR_WORKFLOW_FIXTURE
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

    return this.resolveTestLinearFixture()
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

function parseScopeRequest(request: WorkflowBoardScopeRequest | string): WorkflowBoardScopeRequest & { requestedScope: WorkflowBoardScope } {
  if (typeof request === 'string') {
    const normalized = request.trim() || 'workspace:none::session:none'
    const requestedScope = parseScopeToken(normalized)
    return {
      scopeKey: normalized,
      requestedScope,
    }
  }

  const normalizedScopeKey = request.scopeKey.trim() || 'workspace:none::session:none'
  return {
    scopeKey: normalizedScopeKey,
    requestedScope: request.requestedScope ?? parseScopeToken(normalizedScopeKey),
  }
}

function parseScopeToken(scopeKey: string): WorkflowBoardScope {
  const marker = 'scope:'
  const markerIndex = scopeKey.indexOf(marker)
  if (markerIndex < 0) {
    return 'milestone'
  }

  const rawScope = scopeKey.slice(markerIndex + marker.length).trim().toLowerCase()
  if (rawScope === 'active' || rawScope === 'project' || rawScope === 'milestone') {
    return rawScope
  }

  return 'milestone'
}

function projectActiveScope(snapshot: WorkflowBoardSnapshot): {
  snapshot: WorkflowBoardSnapshot
  matchIdentifiers: string[]
} {
  const columns = snapshot.columns.map((column) => ({
    ...column,
    cards: column.cards.filter((card) => {
      if (isExecutionActive(card.symphony)) {
        return true
      }

      return card.tasks.some((task) => isExecutionActive(task.symphony))
    }),
  }))

  const matchIdentifiers = columns.flatMap((column) => column.cards.map((card) => card.identifier)).filter(Boolean)

  const hasCards = columns.some((column) => column.cards.length > 0)

  return {
    snapshot: {
      ...snapshot,
      columns,
      status: hasCards ? snapshot.status : snapshot.status === 'error' ? 'error' : 'empty',
      emptyReason: hasCards ? snapshot.emptyReason : 'No active Symphony work matched this board scope.',
    },
    matchIdentifiers,
  }
}

function findWorkflowEntity(
  snapshot: WorkflowBoardSnapshot,
  entityKind: WorkflowMoveEntityRequest['entityKind'],
  entityId: string,
): WorkflowBoardSliceCard | WorkflowBoardTask | null {
  if (entityKind === 'slice') {
    for (const column of snapshot.columns) {
      const card = column.cards.find((candidate) => candidate.id === entityId)
      if (card) {
        return card
      }
    }
    return null
  }

  for (const column of snapshot.columns) {
    for (const card of column.cards) {
      const task = card.tasks.find((candidate) => candidate.id === entityId)
      if (task) {
        return task
      }
    }
  }

  return null
}

function applyWorkflowEntityMove(
  snapshot: WorkflowBoardSnapshot,
  request: Pick<WorkflowMoveEntityRequest, 'entityKind' | 'entityId' | 'targetColumnId'>,
): WorkflowBoardSnapshot {
  const next = structuredClone(snapshot)
  const targetColumn = next.columns.find((column) => column.id === request.targetColumnId)
  if (!targetColumn) {
    return next
  }

  if (request.entityKind === 'slice') {
    let movingCard: WorkflowBoardSliceCard | null = null

    for (const column of next.columns) {
      const index = column.cards.findIndex((card) => card.id === request.entityId)
      if (index >= 0) {
        movingCard = column.cards.splice(index, 1)[0] ?? null
        break
      }
    }

    if (!movingCard) {
      return next
    }

    movingCard.columnId = request.targetColumnId
    movingCard.stateName = toColumnTitle(request.targetColumnId)
    movingCard.stateType = toColumnStateType(request.targetColumnId)
    targetColumn.cards.push(movingCard)
    targetColumn.cards.sort((left, right) => left.identifier.localeCompare(right.identifier))

    return next
  }

  for (const column of next.columns) {
    for (const card of column.cards) {
      const task = card.tasks.find((candidate) => candidate.id === request.entityId)
      if (!task) {
        continue
      }

      task.columnId = request.targetColumnId
      task.stateName = toColumnTitle(request.targetColumnId)
      task.stateType = toColumnStateType(request.targetColumnId)
      card.taskCounts = {
        total: card.tasks.length,
        done: card.tasks.filter((candidate) => candidate.columnId === 'done').length,
      }
      return next
    }
  }

  return next
}

function applyWorkflowTaskCreate(
  snapshot: WorkflowBoardSnapshot,
  input: {
    parentSliceId: string
    task: {
      id: string
      identifier?: string
      title: string
      columnId: WorkflowColumnId
      stateName: string
      stateType: string
      teamId?: string
      projectId?: string
      parentSliceId?: string
      description?: string
    }
  },
): WorkflowBoardSnapshot {
  const next = structuredClone(snapshot)

  for (const column of next.columns) {
    for (const card of column.cards) {
      if (card.id !== input.parentSliceId) {
        continue
      }

      card.tasks.push({
        ...input.task,
      })
      card.taskCounts = {
        total: card.tasks.length,
        done: card.tasks.filter((task) => task.columnId === 'done').length,
      }
      return next
    }
  }

  return next
}

function applyWorkflowTaskUpdate(
  snapshot: WorkflowBoardSnapshot,
  input: {
    taskId: string
    title: string
    columnId: WorkflowColumnId
    description?: string
  },
): WorkflowBoardSnapshot {
  const next = structuredClone(snapshot)

  for (const column of next.columns) {
    for (const card of column.cards) {
      const task = card.tasks.find((candidate) => candidate.id === input.taskId)
      if (!task) {
        continue
      }

      task.title = input.title
      if (input.description !== undefined) {
        task.description = input.description
      }
      task.columnId = input.columnId
      task.stateName = toColumnTitle(input.columnId)
      task.stateType = toColumnStateType(input.columnId)
      card.taskCounts = {
        total: card.tasks.length,
        done: card.tasks.filter((candidate) => candidate.columnId === 'done').length,
      }
      return next
    }
  }

  return next
}

function countWorkflowTasks(snapshot: WorkflowBoardSnapshot): number {
  return snapshot.columns.reduce((total, column) => {
    return total + column.cards.reduce((cardTotal, card) => cardTotal + card.tasks.length, 0)
  }, 0)
}

function toColumnTitle(columnId: WorkflowColumnId): string {
  return WORKFLOW_COLUMNS.find((column) => column.id === columnId)?.title ?? columnId
}

function toColumnStateType(columnId: WorkflowColumnId): string {
  if (columnId === 'backlog') {
    return 'backlog'
  }

  if (columnId === 'todo') {
    return 'unstarted'
  }

  if (columnId === 'done') {
    return 'completed'
  }

  return 'started'
}

function isExecutionActive(summary: WorkflowBoardTask['symphony'] | WorkflowBoardSliceCard['symphony'] | undefined): boolean {
  if (!summary) {
    return false
  }

  return summary.assignmentState === 'assigned' || summary.pendingEscalations > 0
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
