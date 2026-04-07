import { promises as fs } from 'node:fs'
import path from 'node:path'
import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import log from './logger'
import { AuthBridge } from './auth-bridge'
import { LinearDocumentClient } from './linear-document-client'
import { PiAgentBridge } from './pi-agent-bridge'
import { PlanningToolDetector } from './planning-tool-detector'
import { RpcEventAdapter } from './rpc-event-adapter'
import { DesktopSessionManager } from './session-manager'
import { SessionHistoryLoader } from './session-history-loader'
import { WorkflowBoardService } from './workflow-board-service'
import { McpConfigBridge } from './mcp-config-bridge'
import { McpService } from './mcp-service'
import { RuntimeHealthAggregator } from './runtime-health-aggregator'
import type { SymphonySupervisor } from './symphony-supervisor'
import type { SymphonyOperatorService } from './symphony-operator-service'
import {
  IPC_CHANNELS,
  type AuthProvider,
  type BridgeStatusEvent,
  type ChatEvent,
  type AvailableModelsResponse,
  type SetModelResponse,
  type AuthProvidersResponse,
  type AuthSetKeyResponse,
  type AuthRemoveKeyResponse,
  type AuthValidationResult,
  type CreateSessionResponse,
  type SessionHistoryResponse,
  type SessionSwitchResponse,
  type ExtensionUIRequest,
  type ExtensionUIResponse,
  type PermissionMode,
  buildPlanningArtifactKey,
  type PlanningArtifact,
  type PlanningArtifactEvent,
  type PlanningSliceData,
  type PlanningArtifactFetchResponse,
  type PlanningArtifactFetchStateEvent,
  type PlanningArtifactListResponse,
  type SessionInfo,
  type SessionListResponse,
  type SetThinkingLevelResponse,
  type ThinkingLevel,
  type WorkspaceInfo,
  type ArtifactType,
  type WorkflowBoardSnapshotResponse,
  type WorkflowBoardLifecycleResponse,
  type WorkflowBoardScopeRequest,
  type WorkflowBoardScopeResponse,
  type WorkflowMoveEntityRequest,
  type WorkflowMoveEntityResult,
  type WorkflowCreateTaskRequest,
  type WorkflowCreateTaskResult,
  type WorkflowTaskDetailRequest,
  type WorkflowTaskDetailResponse,
  type WorkflowUpdateTaskRequest,
  type WorkflowUpdateTaskResult,
  type WorkflowBoardEscalationResponseRequest,
  type WorkflowBoardEscalationResponseResult,
  type WorkflowBoardOpenIssueRequest,
  type WorkflowBoardOpenIssueResult,
  type WorkflowContextResponse,
  type WorkflowShellActionDispatchResult,
  type WorkflowShellActionEvent,
  type WorkflowShellActionRequest,
  type SymphonyRuntimeStatus,
  type SymphonyRuntimeCommandResult,
  type SymphonyRuntimeStatusResponse,
  type SymphonyOperatorSnapshot,
  type SymphonyOperatorSnapshotResponse,
  type SymphonyEscalationResponseCommandResult,
  type McpConfigReadResponse,
  type McpServerDeleteResponse,
  type McpServerInput,
  type McpServerMutationResponse,
  type McpServerResponse,
  type McpServerStatusResponse,
  type ReliabilityRecoveryRequest,
  type ReliabilityRecoveryResult,
  type ReliabilitySnapshot,
  type ReliabilityStatusResponse,
} from '../shared/types'

interface RegisterIpcOptions {
  bridge: PiAgentBridge
  authBridge: AuthBridge
  sessionManager: DesktopSessionManager
  window: BrowserWindow
  onModelSelected?: (model: string) => Promise<void> | void
  onWorkspaceSelected?: (workspacePath: string) => Promise<void> | void
  symphonySupervisor?: SymphonySupervisor
  symphonyOperatorService?: SymphonyOperatorService
  mcpConfigBridge?: McpConfigBridge
  mcpService?: McpService
}

export function registerSessionIpc({
  bridge,
  authBridge,
  sessionManager,
  window,
  onModelSelected,
  onWorkspaceSelected,
  symphonySupervisor,
  symphonyOperatorService,
  mcpConfigBridge,
  mcpService,
}: RegisterIpcOptions): () => void {
  const adapter = new RpcEventAdapter()
  const planningToolDetector = new PlanningToolDetector()
  const linearDocumentClient = new LinearDocumentClient(authBridge)
  const sessionHistoryLoader = new SessionHistoryLoader()
  const workflowBoardService = new WorkflowBoardService({
    authBridge,
    getWorkspacePath: () => bridge.getWorkspacePath(),
    getSymphonySnapshot: () => symphonyOperatorService?.getSnapshot() ?? null,
  })
  const resolvedMcpConfigBridge =
    mcpConfigBridge ??
    new McpConfigBridge({
      configPath: process.env.KATA_DESKTOP_MCP_CONFIG_PATH,
      getWorkspacePath: () => bridge.getWorkspacePath(),
    })
  const resolvedMcpService = mcpService ?? new McpService({ configBridge: resolvedMcpConfigBridge })

  const reliabilityAggregator = new RuntimeHealthAggregator({
    requestRecovery: async ({ sourceSurface, action }) => {
      try {
        if (sourceSurface === 'chat_runtime') {
          await bridge.restart()
          return {
            success: true,
            outcome: 'succeeded' as const,
            code: 'CHAT_RUNTIME_RESTARTED',
            message: 'Chat runtime restarted successfully.',
          }
        }

        if (sourceSurface === 'workflow_board') {
          const response = await workflowBoardService.refreshBoard()
          reliabilityAggregator.ingestWorkflowSnapshot(response.snapshot)
          return {
            success: true,
            outcome: 'succeeded' as const,
            code: 'WORKFLOW_REFRESHED',
            message: `Workflow board recovery action applied: ${action}.`,
          }
        }

        if (sourceSurface === 'symphony') {
          if (symphonySupervisor) {
            const commandResult = await symphonySupervisor.restart()
            return {
              success: commandResult.success,
              outcome: commandResult.success ? ('succeeded' as const) : ('failed' as const),
              code: commandResult.success ? 'SYMPHONY_RESTARTED' : 'SYMPHONY_RESTART_FAILED',
              message:
                commandResult.error?.message ??
                (commandResult.success
                  ? 'Symphony runtime restart requested.'
                  : 'Symphony runtime restart failed.'),
            }
          }

          if (symphonyOperatorService) {
            const snapshot = await symphonyOperatorService.refreshBaseline()
            reliabilityAggregator.ingestSymphonyOperatorSnapshot(snapshot)
            return {
              success: snapshot.connection.state !== 'disconnected',
              outcome:
                snapshot.connection.state !== 'disconnected'
                  ? ('succeeded' as const)
                  : ('failed' as const),
              code:
                snapshot.connection.state !== 'disconnected'
                  ? 'SYMPHONY_DASHBOARD_REFRESHED'
                  : 'SYMPHONY_DASHBOARD_REFRESH_FAILED',
              message:
                snapshot.connection.state !== 'disconnected'
                  ? 'Symphony operator snapshot refreshed.'
                  : snapshot.connection.lastError ?? 'Symphony operator refresh failed.',
            }
          }

          return {
            success: false,
            outcome: 'failed' as const,
            code: 'SYMPHONY_UNAVAILABLE',
            message: 'Symphony services are unavailable.',
          }
        }

        if (sourceSurface === 'mcp') {
          const response = await resolvedMcpConfigBridge.listServers()
          reliabilityAggregator.ingestMcpConfigResponse(response)

          if (!response.success) {
            return {
              success: false,
              outcome: 'failed' as const,
              code: response.error?.code ?? 'MCP_REFRESH_FAILED',
              message: response.error?.message ?? 'MCP config refresh failed.',
            }
          }

          return {
            success: true,
            outcome: 'succeeded' as const,
            code: 'MCP_CONFIG_REFRESHED',
            message: 'MCP config refreshed successfully.',
          }
        }

        return {
          success: false,
          outcome: 'failed' as const,
          code: 'RECOVERY_UNSUPPORTED_SURFACE',
          message: `Unsupported reliability surface: ${sourceSurface}`,
        }
      } catch (error) {
        return {
          success: false,
          outcome: 'failed' as const,
          code: 'RECOVERY_ACTION_THROW',
          message: error instanceof Error ? error.message : String(error),
        }
      }
    },
  })

  const planningArtifactsByKey = new Map<string, PlanningArtifact>()
  const planningMetadataByKey = new Map<string, PlanningArtifactEvent>()
  const planningLatestKeyByTitle = new Map<string, string>()
  const pendingTasksBySliceIssueId = new Map<string, PlanningSliceData['tasks']>()

  const canSendToRenderer = (): boolean => !window.isDestroyed() && !window.webContents.isDestroyed()

  /** Safe send that catches frame disposal errors (e.g. when an MCP server spawn crashes the renderer). */
  const safeSend = (channel: string, ...args: unknown[]): boolean => {
    if (!canSendToRenderer()) {
      return false
    }
    try {
      window.webContents.send(channel, ...args)
      return true
    } catch (error) {
      log.warn('[desktop-ipc] send failed (frame may be disposed)', {
        channel,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  const sendEventToRenderer = (chatEvent: ChatEvent): void => {
    if (safeSend(IPC_CHANNELS.sessionEvents, chatEvent)) {
      log.debug('[desktop-ipc] outbound event', chatEvent)
    }
  }

  const sendBridgeStatus = (status: BridgeStatusEvent): void => {
    if (safeSend(IPC_CHANNELS.sessionBridgeStatus, status)) {
      log.debug('[desktop-ipc] bridge status', status)
    }
  }

  const sendPlanningArtifactToRenderer = (artifact: PlanningArtifact): void => {
    if (!safeSend(IPC_CHANNELS.planningArtifactUpdated, artifact)) {
      return
    }
    log.debug('[desktop-ipc] planning artifact pushed', {
      title: artifact.title,
      artifactKey: artifact.artifactKey,
      updatedAt: artifact.updatedAt,
      scope: artifact.scope,
      projectId: artifact.projectId,
      issueId: artifact.issueId,
    })
  }

  const sendSymphonyStatusToRenderer = (status: SymphonyRuntimeStatus): void => {
    if (!safeSend(IPC_CHANNELS.symphonyStatus, status)) {
      return
    }
    log.debug('[desktop-ipc] symphony status', {
      phase: status.phase,
      pid: status.pid,
      managedProcessRunning: status.managedProcessRunning,
    })
  }

  const sendPlanningFetchStateToRenderer = (event: PlanningArtifactFetchStateEvent): void => {
    if (!safeSend(IPC_CHANNELS.planningArtifactFetchState, event)) {
      return
    }
    log.debug('[desktop-ipc] planning fetch state', event)
  }

  const sendSymphonyDashboardSnapshot = (snapshot: SymphonyOperatorSnapshot): void => {
    if (!safeSend(IPC_CHANNELS.symphonyDashboardSnapshot, snapshot)) {
      return
    }
    log.debug('[desktop-ipc] symphony dashboard snapshot', {
      connectionState: snapshot.connection.state,
      workers: snapshot.workers.length,
      escalations: snapshot.escalations.length,
      queueCount: snapshot.queueCount,
      completedCount: snapshot.completedCount,
    })
  }

  const sendReliabilitySnapshot = (snapshot: ReliabilitySnapshot): void => {
    if (!safeSend(IPC_CHANNELS.reliabilityStatus, snapshot)) {
      return
    }

    log.debug('[desktop-ipc] reliability snapshot', {
      overallStatus: snapshot.overallStatus,
      degradedSurfaces: snapshot.surfaces
        .filter((surface) => surface.status === 'degraded')
        .map((surface) => surface.sourceSurface),
    })
  }

  const getPlanningFetchContext = (
    title: string,
    artifactKey?: string,
  ): { projectId?: string; issueId?: string } => {
    const metadata =
      (artifactKey ? planningMetadataByKey.get(artifactKey) : undefined) ??
      planningMetadataByKey.get(planningLatestKeyByTitle.get(title) ?? '')

    if (!metadata) {
      return {}
    }

    return {
      projectId: metadata.projectId,
      issueId: metadata.issueId,
    }
  }

  const fetchPlanningArtifact = async (
    title: string,
    options?: {
      projectId?: string
      issueId?: string
      pushUpdate?: boolean
      scope?: PlanningArtifact['scope']
      artifactKey?: string
    },
  ): Promise<PlanningArtifactFetchResponse> => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      return {
        success: false,
        error: {
          code: 'UNKNOWN',
          message: 'Artifact title is required',
        },
      }
    }

    try {
      const fetchedArtifact = await linearDocumentClient.fetchByTitle({
        title: trimmedTitle,
        projectId: options?.projectId,
        issueId: options?.issueId,
      })

      if (!fetchedArtifact) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Artifact "${trimmedTitle}" not found`,
          },
        }
      }

      const scope = options?.scope ?? fetchedArtifact.scope
      const artifactKey =
        options?.artifactKey ??
        fetchedArtifact.artifactKey ??
        buildPlanningArtifactKey({
          title: fetchedArtifact.title,
          scope,
          projectId: fetchedArtifact.projectId,
          issueId: fetchedArtifact.issueId,
        })

      const artifact: PlanningArtifact = {
        ...fetchedArtifact,
        scope,
        artifactKey,
        artifactType: detectArtifactTypeFromTitle(fetchedArtifact.title),
      }

      planningArtifactsByKey.set(artifactKey, artifact)
      planningLatestKeyByTitle.set(trimmedTitle, artifactKey)

      if (options?.pushUpdate) {
        sendPlanningArtifactToRenderer(artifact)
      }

      return {
        success: true,
        artifact,
      }
    } catch (error) {
      return {
        success: false,
        error: LinearDocumentClient.toPlanningArtifactError(error),
      }
    }
  }

  const upsertPlanningArtifact = (artifact: PlanningArtifact): void => {
    let artifactToStore = artifact

    if (artifact.artifactType === 'slice') {
      const sliceIssueId = artifact.sliceData?.issueId ?? artifact.issueId
      const pendingTasks = sliceIssueId ? pendingTasksBySliceIssueId.get(sliceIssueId) ?? [] : []

      if (sliceIssueId && pendingTasks.length > 0) {
        pendingTasksBySliceIssueId.delete(sliceIssueId)

        const baseSliceData: PlanningSliceData =
          artifact.sliceData ??
          ({
            id: extractSliceIdFromTitle(artifact.title) ?? 'S00',
            title: artifact.title,
            description: artifact.content,
            issueId: sliceIssueId,
            tasks: [],
          } satisfies PlanningSliceData)

        artifactToStore = {
          ...artifact,
          sliceData: {
            ...baseSliceData,
            tasks: mergeSliceTasks(baseSliceData.tasks, pendingTasks),
          },
        }
      }
    }

    planningArtifactsByKey.set(artifactToStore.artifactKey, artifactToStore)
    planningLatestKeyByTitle.set(artifactToStore.title, artifactToStore.artifactKey)
    sendPlanningArtifactToRenderer(artifactToStore)
  }

  const onPlanningArtifactEvent = (planningEvent: PlanningArtifactEvent): void => {
    workflowBoardService.setPlanningActive(true)
    planningMetadataByKey.set(planningEvent.artifactKey, planningEvent)
    planningLatestKeyByTitle.set(planningEvent.title, planningEvent.artifactKey)

    if (planningEvent.eventType === 'slice_created' && planningEvent.slice) {
      // When a slice is created successfully after a prior failed attempt, the
      // first (errored) event may have stored a project-scoped artifact without
      // an issueId. The successful retry produces a different (issue-scoped) key.
      // Migrate: find any existing artifact with the same title but missing issueId,
      // remove it, and carry its tasks forward into the new artifact.
      const existingArtifact = planningArtifactsByKey.get(planningEvent.artifactKey)
      let migratedTasks: PlanningSliceData['tasks'] = []

      if (!existingArtifact && planningEvent.issueId) {
        const staleArtifact = Array.from(planningArtifactsByKey.values()).find(
          (a) =>
            a.artifactType === 'slice' &&
            a.title === planningEvent.title &&
            !a.issueId &&
            (!a.projectId || a.projectId === planningEvent.projectId),
        )
        if (staleArtifact) {
          migratedTasks = staleArtifact.sliceData?.tasks ?? []
          planningArtifactsByKey.delete(staleArtifact.artifactKey)
          planningMetadataByKey.delete(staleArtifact.artifactKey)
          log.info('[desktop-ipc] migrated stale project-scoped slice artifact to issue-scoped', {
            oldKey: staleArtifact.artifactKey,
            newKey: planningEvent.artifactKey,
            issueId: planningEvent.issueId,
          })
        }
      }

      const existingSliceData = existingArtifact?.sliceData
      const tasks = existingSliceData?.tasks ?? migratedTasks

      const sliceData: PlanningSliceData = {
        id: planningEvent.slice.id,
        title: planningEvent.slice.title,
        description: planningEvent.slice.description,
        issueId: planningEvent.slice.issueId ?? planningEvent.issueId,
        tasks,
      }

      upsertPlanningArtifact({
        title: planningEvent.title,
        artifactKey: planningEvent.artifactKey,
        content: sliceData.description,
        updatedAt: new Date().toISOString(),
        scope: planningEvent.scope,
        projectId: planningEvent.projectId,
        issueId: planningEvent.issueId,
        artifactType: 'slice',
        sliceData,
      })

      return
    }

    if (planningEvent.eventType === 'task_created' && planningEvent.task) {
      const targetSliceIssueId = planningEvent.targetSliceIssueId ?? planningEvent.issueId
      const targetSliceArtifact = Array.from(planningArtifactsByKey.values()).find((artifact) => {
        if (artifact.artifactType !== 'slice') {
          return false
        }

        return (
          artifact.issueId === targetSliceIssueId || artifact.sliceData?.issueId === targetSliceIssueId
        )
      })

      if (!targetSliceArtifact) {
        if (targetSliceIssueId) {
          const existingPendingTasks = pendingTasksBySliceIssueId.get(targetSliceIssueId) ?? []
          const hasTask = existingPendingTasks.some((task) => task.id === planningEvent.task?.id)

          if (!hasTask) {
            pendingTasksBySliceIssueId.set(targetSliceIssueId, [
              ...existingPendingTasks,
              planningEvent.task,
            ])
          }

          log.warn('[desktop-ipc] queued task for unresolved slice artifact', {
            taskId: planningEvent.task.id,
            targetSliceIssueId,
            queuedTasks: hasTask ? existingPendingTasks.length : existingPendingTasks.length + 1,
            artifactKey: planningEvent.artifactKey,
          })
        } else {
          log.warn('[desktop-ipc] unable to append task: missing target slice issue id', {
            taskId: planningEvent.task.id,
            artifactKey: planningEvent.artifactKey,
          })
        }

        return
      }

      const currentSliceData =
        targetSliceArtifact.sliceData ??
        ({
          id: extractSliceIdFromTitle(targetSliceArtifact.title) ?? 'S00',
          title: targetSliceArtifact.title,
          description: targetSliceArtifact.content,
          issueId: targetSliceIssueId,
          tasks: [],
        } satisfies PlanningSliceData)

      const existingTasks = currentSliceData.tasks
      const nextTasks = mergeSliceTasks(existingTasks, [planningEvent.task])

      upsertPlanningArtifact({
        ...targetSliceArtifact,
        updatedAt: new Date().toISOString(),
        artifactType: 'slice',
        sliceData: {
          ...currentSliceData,
          tasks: nextTasks,
        },
      })

      return
    }

    sendPlanningFetchStateToRenderer({
      state: 'start',
      title: planningEvent.title,
      artifactKey: planningEvent.artifactKey,
      toolName: planningEvent.toolName,
    })

    void (async () => {
      const response = await fetchPlanningArtifact(planningEvent.title, {
        projectId: planningEvent.projectId,
        issueId: planningEvent.issueId,
        scope: planningEvent.scope,
        artifactKey: planningEvent.artifactKey,
        pushUpdate: true,
      })

      sendPlanningFetchStateToRenderer({
        state: 'end',
        title: planningEvent.title,
        artifactKey: planningEvent.artifactKey,
        toolName: planningEvent.toolName,
        error: response.success ? undefined : response.error,
      })

      if (!response.success) {
        log.warn('[desktop-ipc] planning artifact fetch failed', {
          title: planningEvent.title,
          artifactKey: planningEvent.artifactKey,
          toolName: planningEvent.toolName,
          error: response.error,
        })
      }
    })()
  }

  planningToolDetector.on('artifact', onPlanningArtifactEvent)

  const onRpcEvent = (rpcEvent: Record<string, unknown>): void => {
    log.debug('[desktop-ipc] inbound rpc event', rpcEvent)
    for (const chatEvent of adapter.adapt(rpcEvent)) {
      sendEventToRenderer(chatEvent)
      planningToolDetector.handleChatEvent(chatEvent)
    }
  }

  const onExtensionUiRequest = (request: ExtensionUIRequest): void => {
    if (safeSend(IPC_CHANNELS.sessionExtensionUiRequest, request)) {
      log.debug('[desktop-ipc] outbound extension ui request', {
        id: request.id,
        method: request.method,
      })
    }
  }

  const onStatus = (status: BridgeStatusEvent): void => {
    sendBridgeStatus(status)
    reliabilityAggregator.ingestChatBridgeStatus(status)
  }

  const onDebug = (payload: Record<string, unknown>): void => {
    log.debug('[desktop-ipc] bridge debug', payload)
  }

  const onCrash = ({ exitCode, signal, stderrLines }: { exitCode: number | null; signal: NodeJS.Signals | null; stderrLines: string[] }): void => {
    const lastLine = stderrLines[stderrLines.length - 1] ?? 'kata subprocess exited unexpectedly'
    sendEventToRenderer({
      type: 'subprocess_crash',
      message: lastLine,
      exitCode,
      signal,
      stderrLines,
    })
    reliabilityAggregator.ingestChatSubprocessCrash({
      message: lastLine,
      exitCode,
      signal,
      stderrLines,
    })
  }

  bridge.on('rpc-event', onRpcEvent)
  bridge.on('extension-ui-request', onExtensionUiRequest)
  bridge.on('status', onStatus)
  bridge.on('debug', onDebug)
  bridge.on('crash', onCrash)

  const onSymphonyStatus = (status: SymphonyRuntimeStatus): void => {
    sendSymphonyStatusToRenderer(status)
    reliabilityAggregator.ingestSymphonyRuntimeStatus(status)
    void symphonyOperatorService?.syncRuntimeStatus(status)
  }

  const onSymphonyDashboardSnapshot = (snapshot: SymphonyOperatorSnapshot): void => {
    sendSymphonyDashboardSnapshot(snapshot)
    reliabilityAggregator.ingestSymphonyOperatorSnapshot(snapshot)
  }

  const onReliabilitySnapshot = (snapshot: ReliabilitySnapshot): void => {
    sendReliabilitySnapshot(snapshot)
  }

  symphonySupervisor?.on('status', onSymphonyStatus)
  symphonyOperatorService?.on('snapshot', onSymphonyDashboardSnapshot)
  reliabilityAggregator.on('snapshot', onReliabilitySnapshot)

  const initialState = bridge.getState()
  const initialBridgeStatus: BridgeStatusEvent = {
    state: initialState.status,
    pid: initialState.pid,
    updatedAt: Date.now(),
  }
  sendBridgeStatus(initialBridgeStatus)
  reliabilityAggregator.ingestChatBridgeStatus(initialBridgeStatus)

  if (symphonySupervisor) {
    const initialSymphonyStatus = symphonySupervisor.getStatus()
    sendSymphonyStatusToRenderer(initialSymphonyStatus)
    reliabilityAggregator.ingestSymphonyRuntimeStatus(initialSymphonyStatus)
    void symphonyOperatorService?.syncRuntimeStatus(initialSymphonyStatus)
  }

  if (symphonyOperatorService) {
    const initialDashboardSnapshot = symphonyOperatorService.getSnapshot()
    sendSymphonyDashboardSnapshot(initialDashboardSnapshot)
    reliabilityAggregator.ingestSymphonyOperatorSnapshot(initialDashboardSnapshot)
  }

  sendReliabilitySnapshot(reliabilityAggregator.getSnapshot())

  ipcMain.removeHandler(IPC_CHANNELS.sessionSend)
  ipcMain.removeHandler(IPC_CHANNELS.sessionStop)
  ipcMain.removeHandler(IPC_CHANNELS.sessionRestart)
  ipcMain.removeHandler(IPC_CHANNELS.sessionGetBridgeState)
  ipcMain.removeHandler(IPC_CHANNELS.sessionExtensionUiResponse)
  ipcMain.removeHandler(IPC_CHANNELS.sessionPermissionMode)
  ipcMain.removeHandler(IPC_CHANNELS.sessionGetAvailableModels)
  ipcMain.removeHandler(IPC_CHANNELS.sessionSetModel)
  ipcMain.removeHandler(IPC_CHANNELS.sessionSetThinkingLevel)
  ipcMain.removeHandler(IPC_CHANNELS.sessionList)
  ipcMain.removeHandler(IPC_CHANNELS.sessionNew)
  ipcMain.removeHandler(IPC_CHANNELS.sessionGetInfo)
  ipcMain.removeHandler(IPC_CHANNELS.sessionSwitch)
  ipcMain.removeHandler(IPC_CHANNELS.sessionGetHistory)
  ipcMain.removeHandler(IPC_CHANNELS.workspaceGet)
  ipcMain.removeHandler(IPC_CHANNELS.workspaceSet)
  ipcMain.removeHandler(IPC_CHANNELS.workspacePick)
  ipcMain.removeHandler(IPC_CHANNELS.authGetProviders)
  ipcMain.removeHandler(IPC_CHANNELS.authSetKey)
  ipcMain.removeHandler(IPC_CHANNELS.authRemoveKey)
  ipcMain.removeHandler(IPC_CHANNELS.authValidateKey)
  ipcMain.removeHandler(IPC_CHANNELS.planningFetchArtifact)
  ipcMain.removeHandler(IPC_CHANNELS.planningListArtifacts)
  ipcMain.removeHandler(IPC_CHANNELS.workflowGetBoard)
  ipcMain.removeHandler(IPC_CHANNELS.workflowRefreshBoard)
  ipcMain.removeHandler(IPC_CHANNELS.workflowSetBoardActive)
  ipcMain.removeHandler(IPC_CHANNELS.workflowSetScope)
  ipcMain.removeHandler(IPC_CHANNELS.workflowMoveEntity)
  ipcMain.removeHandler(IPC_CHANNELS.workflowCreateTask)
  ipcMain.removeHandler(IPC_CHANNELS.workflowGetTaskDetail)
  ipcMain.removeHandler(IPC_CHANNELS.workflowUpdateTask)
  ipcMain.removeHandler(IPC_CHANNELS.workflowRespondEscalation)
  ipcMain.removeHandler(IPC_CHANNELS.workflowOpenIssue)
  ipcMain.removeHandler(IPC_CHANNELS.workflowGetContext)
  ipcMain.removeHandler(IPC_CHANNELS.workflowDispatchShellAction)
  ipcMain.removeHandler(IPC_CHANNELS.symphonyGetStatus)
  ipcMain.removeHandler(IPC_CHANNELS.symphonyStart)
  ipcMain.removeHandler(IPC_CHANNELS.symphonyStop)
  ipcMain.removeHandler(IPC_CHANNELS.symphonyRestart)
  ipcMain.removeHandler(IPC_CHANNELS.symphonyGetDashboard)
  ipcMain.removeHandler(IPC_CHANNELS.symphonyRefreshDashboard)
  ipcMain.removeHandler(IPC_CHANNELS.symphonyRespondEscalation)
  ipcMain.removeHandler(IPC_CHANNELS.mcpListServers)
  ipcMain.removeHandler(IPC_CHANNELS.mcpGetServer)
  ipcMain.removeHandler(IPC_CHANNELS.mcpSaveServer)
  ipcMain.removeHandler(IPC_CHANNELS.mcpDeleteServer)
  ipcMain.removeHandler(IPC_CHANNELS.mcpRefreshStatus)
  ipcMain.removeHandler(IPC_CHANNELS.mcpReconnectServer)
  ipcMain.removeHandler(IPC_CHANNELS.reliabilityGetStatus)
  ipcMain.removeHandler(IPC_CHANNELS.reliabilityRequestRecoveryAction)

  ipcMain.handle(IPC_CHANNELS.sessionSend, async (_event, message: string) => {
    if (!message?.trim()) {
      return
    }

    void bridge.prompt(message).catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error)
      sendEventToRenderer({
        type: 'agent_error',
        message: errorMessage,
      })
    })
  })

  ipcMain.handle(IPC_CHANNELS.sessionStop, async () => {
    const state = bridge.getState()
    if (!state.running) {
      return
    }

    await bridge.abort()
  })

  ipcMain.handle(IPC_CHANNELS.sessionRestart, async () => {
    await bridge.restart()
  })

  ipcMain.handle(IPC_CHANNELS.sessionGetBridgeState, async () => bridge.getState())

  ipcMain.handle(
    IPC_CHANNELS.sessionExtensionUiResponse,
    async (_event, id: string, response: ExtensionUIResponse) => {
      await bridge.sendExtensionUIResponse(id, response)
    },
  )

  ipcMain.handle(IPC_CHANNELS.sessionPermissionMode, async (_event, mode: PermissionMode) => {
    bridge.setPermissionMode(mode)
  })

  ipcMain.handle(IPC_CHANNELS.sessionGetAvailableModels, async (): Promise<AvailableModelsResponse> => {
    try {
      const models = await bridge.getAvailableModels()
      return {
        success: true,
        models,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        models: [],
        error: message,
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.sessionSetModel, async (_event, model: string): Promise<SetModelResponse> => {
    if (!model?.trim()) {
      return {
        success: false,
        error: 'Model is required',
      }
    }

    try {
      // Model comes as "provider/modelId" — split for the CLI's set_model command
      const slashIndex = model.indexOf('/')
      if (slashIndex <= 0) {
        return { success: false, error: 'Invalid model format — expected "provider/modelId"' }
      }
      const provider = model.slice(0, slashIndex)
      const modelId = model.slice(slashIndex + 1)
      await bridge.setModel(provider, modelId)

      if (onModelSelected) {
        try {
          await onModelSelected(model)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          log.warn('[desktop-ipc] model persistence failed after runtime switch', {
            model,
            error: message,
          })
        }
      }

      log.info('[desktop-ipc] model switch', {
        model,
      })

      return {
        success: true,
        model,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error('[desktop-ipc] model switch failed', {
        model,
        error: message,
      })
      return {
        success: false,
        error: message,
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.sessionSetThinkingLevel, async (_event, level: ThinkingLevel): Promise<SetThinkingLevelResponse> => {
    if (!level?.trim()) {
      return { success: false, error: 'Thinking level is required' }
    }

    try {
      await bridge.setThinkingLevel(level)
      log.info('[desktop-ipc] thinking level switch', { level })
      return { success: true, level }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error('[desktop-ipc] thinking level switch failed', { level, error: message })
      return { success: false, error: message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.sessionList, async (): Promise<SessionListResponse> => {
    const workspacePath = bridge.getWorkspacePath()

    try {
      return await sessionManager.listSessions(workspacePath)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error('[desktop-ipc] session list failed', {
        workspacePath,
        error: message,
      })

      throw new Error(`Unable to load sessions for ${workspacePath}: ${message}`)
    }
  })

  ipcMain.handle(IPC_CHANNELS.sessionNew, async (): Promise<CreateSessionResponse> => {
    try {
      const result = await bridge.send({ type: 'new_session' })
      const payload = result.data

      // The RPC new_session response returns { cancelled: boolean } — no sessionId.
      // Check if the session was cancelled (user declined).
      if (
        payload &&
        typeof payload === 'object' &&
        'cancelled' in payload &&
        (payload as { cancelled?: boolean }).cancelled
      ) {
        return { success: false, sessionId: null, error: 'Session creation cancelled' }
      }

      // After new_session, query get_state for the actual session ID.
      let sessionId: string | null = null
      try {
        const stateResult = await bridge.send({ type: 'get_state' })
        const statePayload = stateResult.data
        if (
          statePayload &&
          typeof statePayload === 'object' &&
          'sessionId' in statePayload &&
          typeof (statePayload as { sessionId?: unknown }).sessionId === 'string'
        ) {
          sessionId = (statePayload as { sessionId: string }).sessionId
        }
      } catch {
        // get_state failure is non-fatal — session was still created
        log.warn('[desktop-ipc] get_state after new_session failed')
      }

      if (!sessionId) {
        log.warn('[desktop-ipc] new session created but sessionId could not be resolved', {
          workspacePath: bridge.getWorkspacePath(),
        })
        return {
          success: false,
          sessionId: null,
          error: 'Session created but ID could not be resolved',
        }
      }

      log.info('[desktop-ipc] new session created', {
        sessionId,
        workspacePath: bridge.getWorkspacePath(),
      })

      return {
        success: true,
        sessionId,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error('[desktop-ipc] new session failed', {
        workspacePath: bridge.getWorkspacePath(),
        error: message,
      })

      return {
        success: false,
        sessionId: null,
        error: message,
      }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.sessionGetInfo,
    async (_event, sessionPath: string): Promise<SessionInfo> => {
      return sessionManager.getSessionInfo(sessionPath)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.sessionSwitch,
    async (_event, sessionId: string): Promise<SessionSwitchResponse> => {
      const trimmedSessionId = sessionId?.trim()
      if (!trimmedSessionId) {
        return {
          success: false,
          sessionId: null,
          error: 'Session ID is required',
        }
      }

      const workspacePath = bridge.getWorkspacePath()

      try {
        const sessionPath = await sessionManager.resolveSessionPathById(trimmedSessionId, workspacePath)
        if (!sessionPath) {
          return {
            success: false,
            sessionId: null,
            error: `Session ${trimmedSessionId} was not found in the current workspace`,
          }
        }

        const switched = await bridge.switchSession(sessionPath)
        if (!switched) {
          return {
            success: false,
            sessionId: null,
            error: `Session switch to ${trimmedSessionId} was cancelled`,
          }
        }

        workflowBoardService.setPlanningActive(false)

        log.info('[desktop-ipc] session switched', {
          sessionId: trimmedSessionId,
          workspacePath,
          sessionPath,
        })

        return {
          success: true,
          sessionId: trimmedSessionId,
          sessionPath,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.error('[desktop-ipc] session switch failed', {
          sessionId: trimmedSessionId,
          workspacePath,
          error: message,
        })

        return {
          success: false,
          sessionId: null,
          error: message,
        }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.sessionGetHistory,
    async (_event, sessionId: string, sessionPath?: string): Promise<SessionHistoryResponse> => {
      const trimmedSessionId = sessionId?.trim()
      if (!trimmedSessionId) {
        return {
          success: false,
          sessionId: null,
          sessionPath: null,
          events: [],
          warnings: [],
          error: 'Session ID is required',
        }
      }

      const workspacePath = bridge.getWorkspacePath()

      try {
        const explicitSessionPath = sessionPath?.trim() || null
        const resolvedSessionPath =
          explicitSessionPath ??
          await sessionManager.resolveSessionPathById(trimmedSessionId, workspacePath)

        if (!resolvedSessionPath) {
          return {
            success: false,
            sessionId: null,
            sessionPath: null,
            events: [],
            warnings: [],
            error: `Session ${trimmedSessionId} was not found in the current workspace`,
          }
        }

        const loaded = await sessionHistoryLoader.load(resolvedSessionPath)

        return {
          success: true,
          sessionId: loaded.sessionId ?? trimmedSessionId,
          sessionPath: resolvedSessionPath,
          events: loaded.events,
          warnings: loaded.warnings,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.error('[desktop-ipc] session history load failed', {
          sessionId: trimmedSessionId,
          workspacePath,
          error: message,
        })

        return {
          success: false,
          sessionId: trimmedSessionId,
          sessionPath: sessionPath?.trim() || null,
          events: [],
          warnings: [],
          error: message,
        }
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.workspaceGet, async (): Promise<WorkspaceInfo> => {
    return {
      path: bridge.getWorkspacePath(),
    }
  })

  ipcMain.handle(IPC_CHANNELS.workspaceSet, async (_event, workspacePath: string): Promise<WorkspaceInfo> => {
    const trimmedWorkspacePath = workspacePath?.trim()
    if (!trimmedWorkspacePath) {
      throw new Error('Workspace path is required')
    }

    const nextWorkspacePath = path.resolve(trimmedWorkspacePath)
    const stat = await fs.stat(nextWorkspacePath)
    if (!stat.isDirectory()) {
      throw new Error(`Workspace path is not a directory: ${nextWorkspacePath}`)
    }

    const previousWorkspacePath = bridge.getWorkspacePath()

    await bridge.switchWorkspace(nextWorkspacePath)
    await symphonySupervisor?.setWorkspacePath(nextWorkspacePath)
    workflowBoardService.setPlanningActive(false)

    if (onWorkspaceSelected) {
      try {
        await onWorkspaceSelected(nextWorkspacePath)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.warn('[desktop-ipc] workspace persistence failed after switch', {
          workspacePath: nextWorkspacePath,
          error: message,
        })
      }
    }

    log.info('[desktop-ipc] workspace switched', {
      previousWorkspacePath,
      nextWorkspacePath,
    })

    return {
      path: nextWorkspacePath,
    }
  })

  ipcMain.handle(IPC_CHANNELS.workspacePick, async (): Promise<WorkspaceInfo | null> => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
      defaultPath: bridge.getWorkspacePath(),
      title: 'Select working directory',
      buttonLabel: 'Use Directory',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const selectedPath = result.filePaths[0]
    if (!selectedPath) {
      return null
    }

    return {
      path: selectedPath,
    }
  })

  ipcMain.handle(IPC_CHANNELS.authGetProviders, async (): Promise<AuthProvidersResponse> => {
    return authBridge.getProviders()
  })

  ipcMain.handle(
    IPC_CHANNELS.authSetKey,
    async (_event, provider: AuthProvider, key: string): Promise<AuthSetKeyResponse> => {
      try {
        return await authBridge.setProviderKey(provider, key)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          success: false,
          provider,
          error: message,
        }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.authRemoveKey,
    async (_event, provider: AuthProvider): Promise<AuthRemoveKeyResponse> => {
      try {
        return await authBridge.removeProviderKey(provider)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          success: false,
          provider,
          error: message,
        }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.authValidateKey,
    async (_event, provider: AuthProvider, key: string): Promise<AuthValidationResult> => {
      try {
        return await authBridge.validateKey(provider, key)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          valid: false,
          error: message,
        }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.planningFetchArtifact,
    async (_event, title: string, artifactKey?: string): Promise<PlanningArtifactFetchResponse> => {
      const context = getPlanningFetchContext(title, artifactKey)
      return fetchPlanningArtifact(title, {
        ...context,
        artifactKey,
        pushUpdate: false,
      })
    },
  )

  ipcMain.handle(IPC_CHANNELS.planningListArtifacts, async (): Promise<PlanningArtifactListResponse> => {
    let staleError: PlanningArtifactListResponse['error']

    const workspacePath = bridge.getWorkspacePath()
    const projectRef = await readLinearProjectReference(workspacePath)
    const startupScopePrefix = projectRef ? `startup:${workspacePath}:${projectRef}:` : null

    const clearStartupProactiveArtifacts = (): void => {
      for (const [artifactKey, metadata] of planningMetadataByKey.entries()) {
        if (metadata.toolName !== 'startup_proactive_load') {
          continue
        }

        planningMetadataByKey.delete(artifactKey)
        planningArtifactsByKey.delete(artifactKey)

        if (planningLatestKeyByTitle.get(metadata.title) === artifactKey) {
          planningLatestKeyByTitle.delete(metadata.title)
        }
      }
    }

    if (projectRef) {
      try {
        const projectArtifacts = await linearDocumentClient.listByProject(projectRef)

        clearStartupProactiveArtifacts()

        for (const projectArtifact of projectArtifacts) {
          const artifactType = detectArtifactTypeFromTitle(projectArtifact.title)
          if (!isStartupProactiveArtifactType(artifactType)) {
            continue
          }

          const existingArtifact = planningArtifactsByKey.get(projectArtifact.artifactKey)
          const artifact: PlanningArtifact = {
            ...projectArtifact,
            artifactType,
            sliceData: projectArtifact.sliceData ?? existingArtifact?.sliceData,
          }

          planningArtifactsByKey.set(artifact.artifactKey, artifact)
          planningLatestKeyByTitle.set(artifact.title, artifact.artifactKey)
          planningMetadataByKey.set(artifact.artifactKey, {
            eventType: 'document',
            toolName: 'startup_proactive_load',
            toolCallId: `${startupScopePrefix ?? 'startup:'}${artifact.artifactKey}`,
            title: artifact.title,
            artifactKey: artifact.artifactKey,
            scope: artifact.scope,
            action: 'updated',
            projectId: artifact.projectId,
            issueId: artifact.issueId,
          })
        }
      } catch (error) {
        staleError = LinearDocumentClient.toPlanningArtifactError(error)

        log.warn('[desktop-ipc] planning proactive artifact load failed', {
          workspacePath,
          projectRef,
          error: staleError,
        })
      }
    }

    const artifacts = Array.from(planningArtifactsByKey.values())
      .filter((artifact) => {
        if (!startupScopePrefix) {
          return true
        }

        const metadata = planningMetadataByKey.get(artifact.artifactKey)
        if (metadata?.toolName !== 'startup_proactive_load') {
          return true
        }

        return metadata.toolCallId.startsWith(startupScopePrefix)
      })
      .sort((left, right) => {
        return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      })

    if (staleError) {
      if (artifacts.length === 0) {
        return {
          success: false,
          artifacts: [],
          stale: false,
          error: staleError,
        }
      }

      return {
        success: true,
        artifacts,
        stale: true,
        error: staleError,
      }
    }

    return {
      success: true,
      artifacts,
      stale: false,
    }
  })

  ipcMain.handle(IPC_CHANNELS.workflowGetBoard, async (): Promise<WorkflowBoardSnapshotResponse> => {
    const response = await workflowBoardService.getBoard()
    reliabilityAggregator.ingestWorkflowSnapshot(response.snapshot)
    return response
  })

  ipcMain.handle(IPC_CHANNELS.workflowRefreshBoard, async (): Promise<WorkflowBoardSnapshotResponse> => {
    const response = await workflowBoardService.refreshBoard()
    reliabilityAggregator.ingestWorkflowSnapshot(response.snapshot)
    return response
  })

  ipcMain.handle(
    IPC_CHANNELS.workflowSetBoardActive,
    async (_event, active: boolean): Promise<WorkflowBoardLifecycleResponse> => {
      return workflowBoardService.setActive(Boolean(active))
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.workflowSetScope,
    async (_event, request: WorkflowBoardScopeRequest | string): Promise<WorkflowBoardScopeResponse> => {
      return workflowBoardService.setScope(request)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.workflowMoveEntity,
    async (_event, request: WorkflowMoveEntityRequest): Promise<WorkflowMoveEntityResult> => {
      return workflowBoardService.moveEntity(request)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.workflowCreateTask,
    async (_event, request: WorkflowCreateTaskRequest): Promise<WorkflowCreateTaskResult> => {
      return workflowBoardService.createTask(request)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.workflowGetTaskDetail,
    async (_event, request: WorkflowTaskDetailRequest): Promise<WorkflowTaskDetailResponse> => {
      return workflowBoardService.getTaskDetail(request)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.workflowUpdateTask,
    async (_event, request: WorkflowUpdateTaskRequest): Promise<WorkflowUpdateTaskResult> => {
      return workflowBoardService.updateTask(request)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.workflowRespondEscalation,
    async (_event, request: WorkflowBoardEscalationResponseRequest): Promise<WorkflowBoardEscalationResponseResult> => {
      if (!symphonyOperatorService) {
        const nowIso = new Date().toISOString()
        return {
          success: false,
          cardId: request.cardId,
          requestId: request.requestId,
          status: 'disabled',
          code: 'UNAVAILABLE',
          message: 'Symphony operator service is unavailable.',
          submittedAt: nowIso,
          completedAt: nowIso,
          refreshBoard: false,
        }
      }

      const submittedAt = new Date().toISOString()
      const response = await symphonyOperatorService.respondToEscalation(request.requestId, request.responseText)
      const completedAt = new Date().toISOString()

      return {
        success: response.success,
        cardId: request.cardId,
        requestId: request.requestId,
        status: response.success ? 'success' : 'error',
        code: response.success ? 'SUBMITTED' : 'FAILED',
        message:
          response.result?.message ??
          (response.success ? 'Escalation response submitted.' : 'Escalation response failed.'),
        submittedAt,
        completedAt,
        refreshBoard: true,
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.workflowOpenIssue,
    async (_event, request: WorkflowBoardOpenIssueRequest): Promise<WorkflowBoardOpenIssueResult> => {
      const openedAt = new Date().toISOString()
      const trimmedUrl = request.url.trim()
      if (!trimmedUrl) {
        return {
          success: false,
          cardId: request.cardId,
          url: request.url,
          status: 'disabled',
          code: 'INVALID_URL',
          message: 'Issue URL is missing.',
          openedAt,
        }
      }

      if (!/^https?:\/\//i.test(trimmedUrl)) {
        return {
          success: false,
          cardId: request.cardId,
          url: request.url,
          status: 'disabled',
          code: 'INVALID_URL',
          message: 'Issue URL must use http or https.',
          openedAt,
        }
      }

      if (process.env.KATA_TEST_MODE === '1') {
        return {
          success: true,
          cardId: request.cardId,
          url: trimmedUrl,
          status: 'success',
          code: 'OPENED',
          message: `Opened ${request.identifier ?? 'issue'} in browser.`,
          openedAt,
        }
      }

      try {
        await shell.openExternal(trimmedUrl)
        return {
          success: true,
          cardId: request.cardId,
          url: trimmedUrl,
          status: 'success',
          code: 'OPENED',
          message: `Opened ${request.identifier ?? 'issue'} in browser.`,
          openedAt,
        }
      } catch (error) {
        return {
          success: false,
          cardId: request.cardId,
          url: trimmedUrl,
          status: 'error',
          code: 'FAILED',
          message: error instanceof Error ? error.message : String(error),
          openedAt,
        }
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.workflowGetContext, async (): Promise<WorkflowContextResponse> => {
    return {
      success: true,
      context: await workflowBoardService.refreshContext(),
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.workflowDispatchShellAction,
    async (_event, request: WorkflowShellActionRequest): Promise<WorkflowShellActionDispatchResult> => {
      if (!request || typeof request !== 'object') {
        return {
          success: false,
          error: 'Workflow shell action request is required.',
        }
      }

      if (
        request.action !== 'open_mcp_settings' &&
        request.action !== 'return_to_kanban' &&
        request.action !== 'refresh_board'
      ) {
        return {
          success: false,
          error: `Unsupported workflow shell action: ${String((request as { action?: unknown }).action)}`,
        }
      }

      if (
        request.source !== 'kanban_header' &&
        request.source !== 'settings_panel' &&
        request.source !== 'keyboard_shortcut'
      ) {
        return {
          success: false,
          error: `Unsupported workflow shell action source: ${String((request as { source?: unknown }).source)}`,
        }
      }

      const eventPayload: WorkflowShellActionEvent = {
        action: request.action,
        source: request.source,
        dispatchedAt: new Date().toISOString(),
      }

      const dispatched = safeSend(IPC_CHANNELS.workflowShellAction, eventPayload)

      return {
        success: dispatched,
        dispatchedAt: eventPayload.dispatchedAt,
        ...(dispatched
          ? {}
          : {
              error: 'Renderer unavailable. Workflow shell action was not dispatched.',
            }),
      }
    },
  )

  const createSymphonyDisconnectedResult = (): SymphonyRuntimeCommandResult => {
    const status: SymphonyRuntimeStatus = {
      phase: 'disconnected',
      managedProcessRunning: false,
      pid: null,
      url: null,
      diagnostics: { stdout: [], stderr: [] },
      updatedAt: new Date().toISOString(),
      restartCount: 0,
      lastError: {
        code: 'UNKNOWN',
        phase: 'unknown',
        message: 'Symphony supervisor is unavailable.',
      },
    }

    return {
      success: false,
      status,
      error: {
        code: 'UNKNOWN',
        phase: 'unknown',
        message: 'Symphony supervisor is unavailable.',
      },
    }
  }

  const createUnavailableDashboardSnapshot = (): SymphonyOperatorSnapshot => ({
    fetchedAt: new Date(0).toISOString(),
    queueCount: 0,
    completedCount: 0,
    workers: [],
    escalations: [],
    connection: {
      state: 'disconnected',
      updatedAt: new Date().toISOString(),
      lastError: 'Symphony dashboard service is unavailable.',
    },
    freshness: {
      status: 'stale',
      staleReason: 'Symphony dashboard service is unavailable.',
    },
    response: {},
  })

  ipcMain.handle(IPC_CHANNELS.symphonyGetStatus, async (): Promise<SymphonyRuntimeStatusResponse> => {
    if (!symphonySupervisor) {
      const fallback = createSymphonyDisconnectedResult()
      reliabilityAggregator.ingestSymphonyRuntimeStatus(fallback.status)
      return {
        success: true,
        status: fallback.status,
      }
    }

    const status = symphonySupervisor.getStatus()
    reliabilityAggregator.ingestSymphonyRuntimeStatus(status)
    return {
      success: true,
      status,
    }
  })

  const runSymphonyCommand = async (
    command: () => Promise<SymphonyRuntimeCommandResult>,
  ): Promise<SymphonyRuntimeCommandResult> => {
    if (!symphonySupervisor) {
      return createSymphonyDisconnectedResult()
    }

    return command()
  }

  ipcMain.handle(IPC_CHANNELS.symphonyStart, async (): Promise<SymphonyRuntimeCommandResult> => {
    return runSymphonyCommand(() => symphonySupervisor!.start())
  })

  ipcMain.handle(IPC_CHANNELS.symphonyStop, async (): Promise<SymphonyRuntimeCommandResult> => {
    return runSymphonyCommand(() => symphonySupervisor!.stop())
  })

  ipcMain.handle(IPC_CHANNELS.symphonyRestart, async (): Promise<SymphonyRuntimeCommandResult> => {
    return runSymphonyCommand(() => symphonySupervisor!.restart())
  })

  ipcMain.handle(IPC_CHANNELS.symphonyGetDashboard, async (): Promise<SymphonyOperatorSnapshotResponse> => {
    const snapshot = symphonyOperatorService?.getSnapshot() ?? createUnavailableDashboardSnapshot()
    reliabilityAggregator.ingestSymphonyOperatorSnapshot(snapshot)
    return {
      success: true,
      snapshot,
    }
  })

  ipcMain.handle(IPC_CHANNELS.symphonyRefreshDashboard, async (): Promise<SymphonyOperatorSnapshotResponse> => {
    if (!symphonyOperatorService) {
      const snapshot = createUnavailableDashboardSnapshot()
      reliabilityAggregator.ingestSymphonyOperatorSnapshot(snapshot)
      return {
        success: false,
        snapshot,
      }
    }

    const snapshot = await symphonyOperatorService.refreshBaseline()
    reliabilityAggregator.ingestSymphonyOperatorSnapshot(snapshot)
    return {
      success: true,
      snapshot,
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.symphonyRespondEscalation,
    async (_event, requestId: string, responseText: string): Promise<SymphonyEscalationResponseCommandResult> => {
      if (!symphonyOperatorService) {
        const snapshot = createUnavailableDashboardSnapshot()
        reliabilityAggregator.ingestSymphonyOperatorSnapshot(snapshot)
        return {
          success: false,
          snapshot,
        }
      }

      const response = await symphonyOperatorService.respondToEscalation(requestId, responseText)
      reliabilityAggregator.ingestSymphonyOperatorSnapshot(response.snapshot)
      return response
    },
  )

  ipcMain.handle(IPC_CHANNELS.mcpListServers, async (): Promise<McpConfigReadResponse> => {
    const response = await resolvedMcpConfigBridge.listServers()
    reliabilityAggregator.ingestMcpConfigResponse(response)
    return response
  })

  ipcMain.handle(IPC_CHANNELS.mcpGetServer, async (_event, name: string): Promise<McpServerResponse> => {
    return resolvedMcpConfigBridge.getServer(name)
  })

  ipcMain.handle(
    IPC_CHANNELS.mcpSaveServer,
    async (_event, input: McpServerInput): Promise<McpServerMutationResponse> => {
      return resolvedMcpConfigBridge.saveServer(input)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.mcpDeleteServer,
    async (_event, name: string): Promise<McpServerDeleteResponse> => {
      return resolvedMcpConfigBridge.deleteServer(name)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.mcpRefreshStatus,
    async (_event, name: string): Promise<McpServerStatusResponse> => {
      const response = await resolvedMcpService.refreshStatus(name)
      reliabilityAggregator.ingestMcpStatusResponse(response)
      return response
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.mcpReconnectServer,
    async (_event, name: string): Promise<McpServerStatusResponse> => {
      const response = await resolvedMcpService.reconnectServer(name)
      reliabilityAggregator.ingestMcpStatusResponse(response)
      return response
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.reliabilityGetStatus,
    async (): Promise<ReliabilityStatusResponse> => {
      return {
        success: true,
        snapshot: reliabilityAggregator.getSnapshot(),
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.reliabilityRequestRecoveryAction,
    async (_event, request: ReliabilityRecoveryRequest): Promise<ReliabilityRecoveryResult> => {
      if (
        request?.sourceSurface !== 'chat_runtime' &&
        request?.sourceSurface !== 'workflow_board' &&
        request?.sourceSurface !== 'symphony' &&
        request?.sourceSurface !== 'mcp'
      ) {
        return {
          success: false,
          sourceSurface: request?.sourceSurface ?? 'chat_runtime',
          action: request?.action ?? 'inspect',
          outcome: 'failed',
          code: 'INVALID_RECOVERY_SURFACE',
          message: `Unsupported reliability source surface: ${String(request?.sourceSurface)}`,
          timestamp: new Date().toISOString(),
        }
      }

      return reliabilityAggregator.requestRecoveryAction(request)
    },
  )

  return () => {
    bridge.off('rpc-event', onRpcEvent)
    bridge.off('extension-ui-request', onExtensionUiRequest)
    bridge.off('status', onStatus)
    bridge.off('debug', onDebug)
    bridge.off('crash', onCrash)
    symphonySupervisor?.off('status', onSymphonyStatus)
    symphonyOperatorService?.off('snapshot', onSymphonyDashboardSnapshot)
    reliabilityAggregator.off('snapshot', onReliabilitySnapshot)
    planningToolDetector.off('artifact', onPlanningArtifactEvent)

    ipcMain.removeHandler(IPC_CHANNELS.sessionSend)
    ipcMain.removeHandler(IPC_CHANNELS.sessionStop)
    ipcMain.removeHandler(IPC_CHANNELS.sessionRestart)
    ipcMain.removeHandler(IPC_CHANNELS.sessionGetBridgeState)
    ipcMain.removeHandler(IPC_CHANNELS.sessionExtensionUiResponse)
    ipcMain.removeHandler(IPC_CHANNELS.sessionPermissionMode)
    ipcMain.removeHandler(IPC_CHANNELS.sessionGetAvailableModels)
    ipcMain.removeHandler(IPC_CHANNELS.sessionSetModel)
    ipcMain.removeHandler(IPC_CHANNELS.sessionSetThinkingLevel)
    ipcMain.removeHandler(IPC_CHANNELS.sessionList)
    ipcMain.removeHandler(IPC_CHANNELS.sessionNew)
    ipcMain.removeHandler(IPC_CHANNELS.sessionGetInfo)
    ipcMain.removeHandler(IPC_CHANNELS.sessionSwitch)
    ipcMain.removeHandler(IPC_CHANNELS.sessionGetHistory)
    ipcMain.removeHandler(IPC_CHANNELS.workspaceGet)
    ipcMain.removeHandler(IPC_CHANNELS.workspaceSet)
    ipcMain.removeHandler(IPC_CHANNELS.workspacePick)
    ipcMain.removeHandler(IPC_CHANNELS.authGetProviders)
    ipcMain.removeHandler(IPC_CHANNELS.authSetKey)
    ipcMain.removeHandler(IPC_CHANNELS.authRemoveKey)
    ipcMain.removeHandler(IPC_CHANNELS.authValidateKey)
    ipcMain.removeHandler(IPC_CHANNELS.planningFetchArtifact)
    ipcMain.removeHandler(IPC_CHANNELS.planningListArtifacts)
    ipcMain.removeHandler(IPC_CHANNELS.workflowGetBoard)
    ipcMain.removeHandler(IPC_CHANNELS.workflowRefreshBoard)
    ipcMain.removeHandler(IPC_CHANNELS.workflowSetBoardActive)
    ipcMain.removeHandler(IPC_CHANNELS.workflowSetScope)
    ipcMain.removeHandler(IPC_CHANNELS.workflowMoveEntity)
    ipcMain.removeHandler(IPC_CHANNELS.workflowCreateTask)
    ipcMain.removeHandler(IPC_CHANNELS.workflowGetTaskDetail)
    ipcMain.removeHandler(IPC_CHANNELS.workflowUpdateTask)
    ipcMain.removeHandler(IPC_CHANNELS.workflowRespondEscalation)
    ipcMain.removeHandler(IPC_CHANNELS.workflowOpenIssue)
    ipcMain.removeHandler(IPC_CHANNELS.workflowGetContext)
    ipcMain.removeHandler(IPC_CHANNELS.workflowDispatchShellAction)
    ipcMain.removeHandler(IPC_CHANNELS.symphonyGetStatus)
    ipcMain.removeHandler(IPC_CHANNELS.symphonyStart)
    ipcMain.removeHandler(IPC_CHANNELS.symphonyStop)
    ipcMain.removeHandler(IPC_CHANNELS.symphonyRestart)
    ipcMain.removeHandler(IPC_CHANNELS.symphonyGetDashboard)
    ipcMain.removeHandler(IPC_CHANNELS.symphonyRefreshDashboard)
    ipcMain.removeHandler(IPC_CHANNELS.symphonyRespondEscalation)
    ipcMain.removeHandler(IPC_CHANNELS.mcpListServers)
    ipcMain.removeHandler(IPC_CHANNELS.mcpGetServer)
    ipcMain.removeHandler(IPC_CHANNELS.mcpSaveServer)
    ipcMain.removeHandler(IPC_CHANNELS.mcpDeleteServer)
    ipcMain.removeHandler(IPC_CHANNELS.mcpRefreshStatus)
    ipcMain.removeHandler(IPC_CHANNELS.mcpReconnectServer)
    ipcMain.removeHandler(IPC_CHANNELS.reliabilityGetStatus)
    ipcMain.removeHandler(IPC_CHANNELS.reliabilityRequestRecoveryAction)
  }
}

function detectArtifactTypeFromTitle(title: string): ArtifactType | undefined {
  const normalized = title.trim().toUpperCase()

  if (/-ROADMAP(?:\b|$)/.test(normalized) || normalized === 'ROADMAP') {
    return 'roadmap'
  }

  if (normalized === 'REQUIREMENTS' || /-REQUIREMENTS(?:\b|$)/.test(normalized)) {
    return 'requirements'
  }

  if (normalized === 'DECISIONS' || /-DECISIONS(?:\b|$)/.test(normalized)) {
    return 'decisions'
  }

  if (/-CONTEXT(?:\b|$)/.test(normalized) || normalized === 'CONTEXT') {
    return 'context'
  }

  if (
    /^\[S\d+\]\s+/.test(title.trim()) ||
    /^S\d+[:\-\s]/.test(title.trim()) ||
    /^SLICE:/.test(normalized)
  ) {
    return 'slice'
  }

  return undefined
}

function isStartupProactiveArtifactType(artifactType: ArtifactType | undefined): boolean {
  return (
    artifactType === 'roadmap' ||
    artifactType === 'requirements' ||
    artifactType === 'decisions' ||
    artifactType === 'context'
  )
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

    log.warn('[desktop-ipc] unable to read .kata/preferences.md for proactive planning load', {
      workspacePath,
      preferencesPath,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }

  const frontmatterMatch = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatterMatch) {
    return null
  }

  const frontmatter = frontmatterMatch[1]
  if (!frontmatter) {
    return null
  }

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

function extractSliceIdFromTitle(title: string): string | undefined {
  const match = title.match(/S\d+/i)
  return match?.[0]?.toUpperCase()
}

function mergeSliceTasks(
  existingTasks: PlanningSliceData['tasks'],
  newTasks: PlanningSliceData['tasks'],
): PlanningSliceData['tasks'] {
  const mergedTasks = [...existingTasks]

  for (const task of newTasks) {
    if (!mergedTasks.some((existingTask) => existingTask.id === task.id)) {
      mergedTasks.push(task)
    }
  }

  return mergedTasks
}
