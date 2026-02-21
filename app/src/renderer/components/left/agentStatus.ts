import type { AgentSummary } from '../../types/agent'

export const agentStatusLabel: Record<AgentSummary['status'], string> = {
  idle: 'Idle',
  running: 'Running',
  blocked: 'Blocked',
  complete: 'Complete'
}

export const statusDotClassName: Record<AgentSummary['status'], string> = {
  idle: 'bg-status-todo/55',
  running: 'bg-status-in-progress',
  blocked: 'bg-status-blocked',
  complete: 'bg-status-done'
}
