import { contextBridge } from 'electron'

const kataApi = {
  getAgents: async () => [],
  getMessages: async () => [],
  getProject: async () => null,
  getGitStatus: async () => null
}

contextBridge.exposeInMainWorld('kata', kataApi)

export type KataApi = typeof kataApi
