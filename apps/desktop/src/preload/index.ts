import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type AuthProvider,
  type BridgeStatusEvent,
  type ChatEvent,
  type DesktopApi,
  type ExtensionUIRequest,
  type PermissionMode,
  type PlanningArtifact,
  type PlanningArtifactFetchStateEvent,
  type ThinkingLevel,
  type SymphonyRuntimeStatus,
  type SymphonyOperatorSnapshot,
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
  setThinkingLevel: async (level: ThinkingLevel) => {
    return ipcRenderer.invoke(IPC_CHANNELS.sessionSetThinkingLevel, level)
  },
  sessions: {
    list: async () => {
      return ipcRenderer.invoke(IPC_CHANNELS.sessionList)
    },
    create: async () => {
      return ipcRenderer.invoke(IPC_CHANNELS.sessionNew)
    },
    getInfo: async (sessionPath: string) => {
      return ipcRenderer.invoke(IPC_CHANNELS.sessionGetInfo, sessionPath)
    },
    switch: async (sessionId: string) => {
      return ipcRenderer.invoke(IPC_CHANNELS.sessionSwitch, sessionId)
    },
    getHistory: async (sessionId: string, sessionPath?: string) => {
      return ipcRenderer.invoke(IPC_CHANNELS.sessionGetHistory, sessionId, sessionPath)
    },
  },
  workspace: {
    get: async () => {
      return ipcRenderer.invoke(IPC_CHANNELS.workspaceGet)
    },
    set: async (workspacePath: string) => {
      return ipcRenderer.invoke(IPC_CHANNELS.workspaceSet, workspacePath)
    },
    pick: async () => {
      return ipcRenderer.invoke(IPC_CHANNELS.workspacePick)
    },
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
  planning: {
    onArtifactUpdated: (listener: (artifact: PlanningArtifact) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, artifact: PlanningArtifact) => {
        listener(artifact)
      }

      ipcRenderer.on(IPC_CHANNELS.planningArtifactUpdated, wrapped)

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.planningArtifactUpdated, wrapped)
      }
    },
    onArtifactFetchState: (listener: (event: PlanningArtifactFetchStateEvent) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, event: PlanningArtifactFetchStateEvent) => {
        listener(event)
      }

      ipcRenderer.on(IPC_CHANNELS.planningArtifactFetchState, wrapped)

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.planningArtifactFetchState, wrapped)
      }
    },
    fetchArtifact: async (title: string, artifactKey?: string) => {
      return ipcRenderer.invoke(IPC_CHANNELS.planningFetchArtifact, title, artifactKey)
    },
    listArtifacts: async () => {
      return ipcRenderer.invoke(IPC_CHANNELS.planningListArtifacts)
    },
  },
  workflow: {
    getBoard: async () => {
      return ipcRenderer.invoke(IPC_CHANNELS.workflowGetBoard)
    },
    refreshBoard: async () => {
      return ipcRenderer.invoke(IPC_CHANNELS.workflowRefreshBoard)
    },
    setBoardActive: async (active: boolean) => {
      return ipcRenderer.invoke(IPC_CHANNELS.workflowSetBoardActive, active)
    },
    setScope: async (scopeKey: string) => {
      return ipcRenderer.invoke(IPC_CHANNELS.workflowSetScope, scopeKey)
    },
    getContext: async () => {
      return ipcRenderer.invoke(IPC_CHANNELS.workflowGetContext)
    },
  },
  symphony: {
    getStatus: async () => {
      return ipcRenderer.invoke(IPC_CHANNELS.symphonyGetStatus)
    },
    start: async () => {
      return ipcRenderer.invoke(IPC_CHANNELS.symphonyStart)
    },
    stop: async () => {
      return ipcRenderer.invoke(IPC_CHANNELS.symphonyStop)
    },
    restart: async () => {
      return ipcRenderer.invoke(IPC_CHANNELS.symphonyRestart)
    },
    onStatus: (listener: (status: SymphonyRuntimeStatus) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, status: SymphonyRuntimeStatus) => {
        listener(status)
      }

      ipcRenderer.on(IPC_CHANNELS.symphonyStatus, wrapped)

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.symphonyStatus, wrapped)
      }
    },
    getDashboardSnapshot: async () => {
      return ipcRenderer.invoke(IPC_CHANNELS.symphonyGetDashboard)
    },
    refreshDashboardSnapshot: async () => {
      return ipcRenderer.invoke(IPC_CHANNELS.symphonyRefreshDashboard)
    },
    respondToEscalation: async (requestId: string, responseText: string) => {
      return ipcRenderer.invoke(IPC_CHANNELS.symphonyRespondEscalation, requestId, responseText)
    },
    onDashboardSnapshot: (listener: (snapshot: SymphonyOperatorSnapshot) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, snapshot: SymphonyOperatorSnapshot) => {
        listener(snapshot)
      }

      ipcRenderer.on(IPC_CHANNELS.symphonyDashboardSnapshot, wrapped)

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.symphonyDashboardSnapshot, wrapped)
      }
    },
  },
  mcp: {
    listServers: async () => {
      return ipcRenderer.invoke(IPC_CHANNELS.mcpListServers)
    },
    getServer: async (name: string) => {
      return ipcRenderer.invoke(IPC_CHANNELS.mcpGetServer, name)
    },
    saveServer: async (input: Parameters<DesktopApi['mcp']['saveServer']>[0]) => {
      return ipcRenderer.invoke(IPC_CHANNELS.mcpSaveServer, input)
    },
    deleteServer: async (name: string) => {
      return ipcRenderer.invoke(IPC_CHANNELS.mcpDeleteServer, name)
    },
    refreshStatus: async (name: string) => {
      return ipcRenderer.invoke(IPC_CHANNELS.mcpRefreshStatus, name)
    },
    reconnectServer: async (name: string) => {
      return ipcRenderer.invoke(IPC_CHANNELS.mcpReconnectServer, name)
    },
  },
}

contextBridge.exposeInMainWorld('api', api)
