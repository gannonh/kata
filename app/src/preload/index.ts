import { contextBridge, ipcRenderer } from 'electron'

const OPEN_EXTERNAL_URL_CHANNEL = 'kata:openExternalUrl'

const kataApi = {
  getAgents: async () => [],
  getMessages: async () => [],
  getProject: async () => null,
  getGitStatus: async () => null,
  openExternalUrl: async (url: string): Promise<boolean> => {
    try {
      return await ipcRenderer.invoke(OPEN_EXTERNAL_URL_CHANNEL, url) as boolean
    } catch {
      return false
    }
  }
}

contextBridge.exposeInMainWorld('kata', kataApi)

export type KataApi = typeof kataApi
