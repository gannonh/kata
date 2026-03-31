import { ipcMain, type BrowserWindow } from 'electron'
import log from './logger'
import { PiAgentBridge } from './pi-agent-bridge'
import { RpcEventAdapter } from './rpc-event-adapter'
import {
  IPC_CHANNELS,
  type BridgeStatusEvent,
  type ChatEvent,
  type ExtensionUIRequest,
  type ExtensionUIResponse,
  type PermissionMode,
} from '../shared/types'

interface RegisterIpcOptions {
  bridge: PiAgentBridge
  window: BrowserWindow
}

export function registerSessionIpc({ bridge, window }: RegisterIpcOptions): () => void {
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
  }
}
