import { ipcMain, type BrowserWindow } from 'electron'
import log from 'electron-log/main'
import { PiAgentBridge } from './pi-agent-bridge'
import { RpcEventAdapter } from './rpc-event-adapter'
import {
  IPC_CHANNELS,
  type BridgeStatusEvent,
  type ChatEvent,
} from '../shared/types'

interface RegisterIpcOptions {
  bridge: PiAgentBridge
  window: BrowserWindow
}

export function registerSessionIpc({ bridge, window }: RegisterIpcOptions): void {
  const adapter = new RpcEventAdapter()

  const sendEventToRenderer = (chatEvent: ChatEvent): void => {
    window.webContents.send(IPC_CHANNELS.sessionEvents, chatEvent)
    log.debug('[desktop-ipc] outbound event', chatEvent)
  }

  const sendBridgeStatus = (status: BridgeStatusEvent): void => {
    window.webContents.send(IPC_CHANNELS.sessionBridgeStatus, status)
    log.debug('[desktop-ipc] bridge status', status)
  }

  bridge.on('rpc-event', (rpcEvent) => {
    log.debug('[desktop-ipc] inbound rpc event', rpcEvent)
    for (const chatEvent of adapter.adapt(rpcEvent)) {
      sendEventToRenderer(chatEvent)
    }
  })

  bridge.on('status', (status) => {
    sendBridgeStatus(status)
  })

  bridge.on('debug', (payload) => {
    log.debug('[desktop-ipc] bridge debug', payload)
  })

  bridge.on('crash', ({ exitCode, signal, stderrLines }) => {
    const lastLine = stderrLines[stderrLines.length - 1] ?? 'kata subprocess exited unexpectedly'
    sendEventToRenderer({
      type: 'subprocess_crash',
      message: lastLine,
      exitCode,
      signal,
      stderrLines,
    })
  })

  sendBridgeStatus({
    state: bridge.getState().status,
    pid: bridge.getState().pid,
    updatedAt: Date.now(),
  })

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
    await bridge.abort()
  })

  ipcMain.handle(IPC_CHANNELS.sessionRestart, async () => {
    await bridge.restart()
  })

  ipcMain.handle(IPC_CHANNELS.sessionGetBridgeState, async () => {
    return bridge.getState()
  })
}
