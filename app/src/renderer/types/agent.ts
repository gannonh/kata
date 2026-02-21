export type AgentStatus = 'idle' | 'running' | 'blocked' | 'complete'

export type AgentTokenUsage = {
  prompt: number
  completion: number
  total: number
}

export type AgentSummary = {
  id: string
  name: string
  role: string
  status: AgentStatus
  model: string
  tokenUsage: AgentTokenUsage
  currentTask: string
  lastUpdated: string
  delegatedBy?: string
  children?: AgentSummary[]
}
