import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type AuthProvider,
  type BridgeStatusEvent,
  type ChatEvent,
  type DesktopApi,
  type ExtensionUIRequest,
  type PermissionMode,
} from '../shared/types'

const api: DesktopApi = {
  sendMessage: async (message: string) => {
    await ipcRenderer.invoke(IPC_CHANNELS.sessionSend, message)
  },
  stopAgent: async () => {
    await ipcRenderer.invoke(IPC_CHANNELS.sessionStop)
  },
  restartAgent: async () => {
    await ipcRenderer.invoke(IPC_CHANNELS.sessionRestart)
  },
  onChatEvent: (listener: (event: ChatEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, chatEvent: ChatEvent) => {
      listener(chatEvent)
    }

    ipcRenderer.on(IPC_CHANNELS.sessionEvents, wrapped)

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.sessionEvents, wrapped)
    }
  },
  onBridgeStatus: (listener: (status: BridgeStatusEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, status: BridgeStatusEvent) => {
      listener(status)
    }

    ipcRenderer.on(IPC_CHANNELS.sessionBridgeStatus, wrapped)

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.sessionBridgeStatus, wrapped)
    }
  },
  getBridgeState: async () => {
    return ipcRenderer.invoke(IPC_CHANNELS.sessionGetBridgeState)
  },
  onExtensionUIRequest: (listener: (event: ExtensionUIRequest) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, request: ExtensionUIRequest) => {
      listener(request)
    }

    ipcRenderer.on(IPC_CHANNELS.sessionExtensionUiRequest, wrapped)

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.sessionExtensionUiRequest, wrapped)
    }
  },
  sendExtensionUIResponse: async (
    id: string,
    response: Parameters<DesktopApi['sendExtensionUIResponse']>[1],
  ) => {
    await ipcRenderer.invoke(IPC_CHANNELS.sessionExtensionUiResponse, id, response)
  },
  setPermissionMode: async (mode: PermissionMode) => {
    await ipcRenderer.invoke(IPC_CHANNELS.sessionPermissionMode, mode)
  },
  getAvailableModels: async () => {
    return ipcRenderer.invoke(IPC_CHANNELS.sessionGetAvailableModels)
  },
  setModel: async (model: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.sessionSetModel, model)
  },
  auth: {
    getProviders: async () => {
      return ipcRenderer.invoke(IPC_CHANNELS.authGetProviders)
    },
    setKey: async (provider: AuthProvider, key: string) => {
      return ipcRenderer.invoke(IPC_CHANNELS.authSetKey, provider, key)
    },
    removeKey: async (provider: AuthProvider) => {
      return ipcRenderer.invoke(IPC_CHANNELS.authRemoveKey, provider)
    },
    validateKey: async (provider: AuthProvider, key: string) => {
      return ipcRenderer.invoke(IPC_CHANNELS.authValidateKey, provider, key)
    },
  },
}

contextBridge.exposeInMainWorld('api', api)
