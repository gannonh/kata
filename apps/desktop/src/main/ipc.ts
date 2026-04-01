import { promises as fs } from 'node:fs'
import path from 'node:path'
import { dialog, ipcMain, type BrowserWindow } from 'electron'
import log from './logger'
import { AuthBridge } from './auth-bridge'
import { PiAgentBridge } from './pi-agent-bridge'
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
  type SessionInfo,
  type SessionListResponse,
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

  const onRpcEvent = (rpcEvent: Record<string, unknown>): void => {
    log.debug('[desktop-ipc] inbound rpc event', rpcEvent)
    for (const chatEvent of adapter.adapt(rpcEvent)) {
      sendEventToRenderer(chatEvent)
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
      await bridge.setModel(model)

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

  return () => {
    bridge.off('rpc-event', onRpcEvent)
    bridge.off('extension-ui-request', onExtensionUiRequest)
    bridge.off('status', onStatus)
    bridge.off('debug', onDebug)
    bridge.off('crash', onCrash)

    ipcMain.removeHandler(IPC_CHANNELS.sessionSend)
    ipcMain.removeHandler(IPC_CHANNELS.sessionStop)
    ipcMain.removeHandler(IPC_CHANNELS.sessionRestart)
    ipcMain.removeHandler(IPC_CHANNELS.sessionGetBridgeState)
    ipcMain.removeHandler(IPC_CHANNELS.sessionExtensionUiResponse)
    ipcMain.removeHandler(IPC_CHANNELS.sessionPermissionMode)
    ipcMain.removeHandler(IPC_CHANNELS.sessionGetAvailableModels)
    ipcMain.removeHandler(IPC_CHANNELS.sessionSetModel)
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
  }
}
