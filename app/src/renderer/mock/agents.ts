import type { AgentSummary } from '../types/agent'

export const mockAgents: AgentSummary[] = [
  {
    id: 'orchestrator',
    name: 'Kata Orchestrator',
    role: 'Coordinator',
    status: 'running',
    model: 'gpt-5',
    tokenUsage: {
      prompt: 3812,
      completion: 1544,
      total: 5356
    },
    currentTask: 'Preparing Wave 2A contracts and shared primitives',
    lastUpdated: '2026-02-20T15:10:00.000Z'
  },
  {
    id: 'left-panel-agent',
    name: 'Panel Agent A',
    role: 'Left Panel UI',
    status: 'idle',
    model: 'gpt-5-mini',
    tokenUsage: {
      prompt: 1140,
      completion: 308,
      total: 1448
    },
    currentTask: 'Waiting for Wave 2A baseline merge',
    lastUpdated: '2026-02-20T15:02:00.000Z'
  },
  {
    id: 'chat-agent',
    name: 'Panel Agent B',
    role: 'Chat UI',
    status: 'blocked',
    model: 'gpt-5-mini',
    tokenUsage: {
      prompt: 920,
      completion: 177,
      total: 1097
    },
    currentTask: 'Blocked on shared MarkdownRenderer contract',
    lastUpdated: '2026-02-20T14:58:00.000Z'
  }
]
