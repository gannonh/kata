import { promises as fs } from 'node:fs'
import path from 'node:path'
import { dialog, ipcMain, type BrowserWindow } from 'electron'
import log from './logger'
import { AuthBridge } from './auth-bridge'
import { LinearDocumentClient } from './linear-document-client'
import { PiAgentBridge } from './pi-agent-bridge'
import { PlanningToolDetector } from './planning-tool-detector'
import { RpcEventAdapter } from './rpc-event-adapter'
import { DesktopSessionManager } from './session-manager'
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
  type ExtensionUIRequest,
  type ExtensionUIResponse,
  type PermissionMode,
  buildPlanningArtifactKey,
  type PlanningArtifact,
  type PlanningArtifactEvent,
  type PlanningArtifactFetchResponse,
  type PlanningArtifactListResponse,
  type SessionInfo,
  type SessionListResponse,
  type SetThinkingLevelResponse,
  type ThinkingLevel,
  type WorkspaceInfo,
} from '../shared/types'

interface RegisterIpcOptions {
  bridge: PiAgentBridge
  authBridge: AuthBridge
  sessionManager: DesktopSessionManager
  window: BrowserWindow
  onModelSelected?: (model: string) => Promise<void> | void
  onWorkspaceSelected?: (workspacePath: string) => Promise<void> | void
}

export function registerSessionIpc({
  bridge,
  authBridge,
  sessionManager,
  window,
  onModelSelected,
  onWorkspaceSelected,
}: RegisterIpcOptions): () => void {
  const adapter = new RpcEventAdapter()
  const planningToolDetector = new PlanningToolDetector()
  const linearDocumentClient = new LinearDocumentClient(authBridge)

  const planningArtifactsByKey = new Map<string, PlanningArtifact>()
  const planningMetadataByKey = new Map<string, PlanningArtifactEvent>()
  const planningLatestKeyByTitle = new Map<string, string>()

  const canSendToRenderer = (): boolean => !window.isDestroyed() && !window.webContents.isDestroyed()

  const sendEventToRenderer = (chatEvent: ChatEvent): void => {
    if (!canSendToRenderer()) {
      log.warn('[desktop-ipc] skipping event dispatch: renderer window is destroyed')
      return
    }

    window.webContents.send(IPC_CHANNELS.sessionEvents, chatEvent)
    log.debug('[desktop-ipc] outbound event', chatEvent)
  }

  const sendBridgeStatus = (status: BridgeStatusEvent): void => {
    if (!canSendToRenderer()) {
      log.warn('[desktop-ipc] skipping bridge status dispatch: renderer window is destroyed')
      return
    }

    window.webContents.send(IPC_CHANNELS.sessionBridgeStatus, status)
    log.debug('[desktop-ipc] bridge status', status)
  }

  const sendPlanningArtifactToRenderer = (artifact: PlanningArtifact): void => {
    if (!canSendToRenderer()) {
      log.warn('[desktop-ipc] skipping planning artifact dispatch: renderer window is destroyed')
      return
    }

    window.webContents.send(IPC_CHANNELS.planningArtifactUpdated, artifact)
    log.debug('[desktop-ipc] planning artifact pushed', {
      title: artifact.title,
      artifactKey: artifact.artifactKey,
      updatedAt: artifact.updatedAt,
      scope: artifact.scope,
      projectId: artifact.projectId,
      issueId: artifact.issueId,
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

  const onPlanningArtifactEvent = (planningEvent: PlanningArtifactEvent): void => {
    planningMetadataByKey.set(planningEvent.artifactKey, planningEvent)
    planningLatestKeyByTitle.set(planningEvent.title, planningEvent.artifactKey)

    void fetchPlanningArtifact(planningEvent.title, {
      projectId: planningEvent.projectId,
      issueId: planningEvent.issueId,
      scope: planningEvent.scope,
      artifactKey: planningEvent.artifactKey,
      pushUpdate: true,
    })
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
    if (!canSendToRenderer()) {
      log.warn('[desktop-ipc] skipping extension ui request dispatch: renderer window is destroyed')
      return
    }

    window.webContents.send(IPC_CHANNELS.sessionExtensionUiRequest, request)
    log.debug('[desktop-ipc] outbound extension ui request', {
      id: request.id,
      method: request.method,
    })
  }

  const onStatus = (status: BridgeStatusEvent): void => {
    sendBridgeStatus(status)
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
  }

  bridge.on('rpc-event', onRpcEvent)
  bridge.on('extension-ui-request', onExtensionUiRequest)
  bridge.on('status', onStatus)
  bridge.on('debug', onDebug)
  bridge.on('crash', onCrash)

  const initialState = bridge.getState()
  sendBridgeStatus({
    state: initialState.status,
    pid: initialState.pid,
    updatedAt: Date.now(),
  })

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
  ipcMain.removeHandler(IPC_CHANNELS.workspaceGet)
  ipcMain.removeHandler(IPC_CHANNELS.workspaceSet)
  ipcMain.removeHandler(IPC_CHANNELS.workspacePick)
  ipcMain.removeHandler(IPC_CHANNELS.authGetProviders)
  ipcMain.removeHandler(IPC_CHANNELS.authSetKey)
  ipcMain.removeHandler(IPC_CHANNELS.authRemoveKey)
  ipcMain.removeHandler(IPC_CHANNELS.authValidateKey)
  ipcMain.removeHandler(IPC_CHANNELS.planningFetchArtifact)
  ipcMain.removeHandler(IPC_CHANNELS.planningListArtifacts)

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
      const sessionId =
        payload &&
        typeof payload === 'object' &&
        'sessionId' in payload &&
        typeof (payload as { sessionId?: unknown }).sessionId === 'string'
          ? (payload as { sessionId: string }).sessionId
          : payload &&
                typeof payload === 'object' &&
                'session_id' in payload &&
                typeof (payload as { session_id?: unknown }).session_id === 'string'
              ? (payload as { session_id: string }).session_id
              : null

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
    const artifacts = Array.from(planningArtifactsByKey.values()).sort((left, right) => {
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    })

    return {
      success: true,
      artifacts,
    }
  })

  return () => {
    bridge.off('rpc-event', onRpcEvent)
    bridge.off('extension-ui-request', onExtensionUiRequest)
    bridge.off('status', onStatus)
    bridge.off('debug', onDebug)
    bridge.off('crash', onCrash)
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
    ipcMain.removeHandler(IPC_CHANNELS.workspaceGet)
    ipcMain.removeHandler(IPC_CHANNELS.workspaceSet)
    ipcMain.removeHandler(IPC_CHANNELS.workspacePick)
    ipcMain.removeHandler(IPC_CHANNELS.authGetProviders)
    ipcMain.removeHandler(IPC_CHANNELS.authSetKey)
    ipcMain.removeHandler(IPC_CHANNELS.authRemoveKey)
    ipcMain.removeHandler(IPC_CHANNELS.authValidateKey)
    ipcMain.removeHandler(IPC_CHANNELS.planningFetchArtifact)
    ipcMain.removeHandler(IPC_CHANNELS.planningListArtifacts)
  }
}
