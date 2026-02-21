import type { AgentSummary } from '../../types/agent'
import { StatusBadge } from '../shared/StatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

type AgentCardProps = {
  agent: AgentSummary
}

const statusLabel: Record<AgentSummary['status'], string> = {
  idle: 'Idle',
  running: 'Running',
  blocked: 'Blocked',
  complete: 'Complete'
}

const statusTone: Record<AgentSummary['status'], 'neutral' | 'success' | 'danger' | 'info'> = {
  idle: 'neutral',
  running: 'success',
  blocked: 'danger',
  complete: 'info'
}

export function AgentCard({ agent }: AgentCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">{agent.name}</CardTitle>
            <p className="text-xs text-muted-foreground">{agent.role}</p>
          </div>
          <StatusBadge
            label={statusLabel[agent.status]}
            tone={statusTone[agent.status]}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-1 text-sm text-muted-foreground">
        <p>Model: {agent.model}</p>
        <p>Tokens: {agent.tokenUsage.total.toLocaleString()}</p>
        <p className="pt-1 text-foreground">{agent.currentTask}</p>
      </CardContent>
    </Card>
  )
}
