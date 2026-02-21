import type { AgentSummary } from '../../types/agent'

export const agentStatusLabel: Record<AgentSummary['status'], string> = {
  idle: 'Idle',
  running: 'Running',
  blocked: 'Blocked',
  complete: 'Complete'
}

export const statusDotClassName: Record<AgentSummary['status'], string> = {
  idle: 'bg-muted-foreground/45',
  running: 'bg-emerald-400',
  blocked: 'bg-amber-400',
  complete: 'bg-sky-400'
}
