import type { AgentSummary } from '../../types/agent'
import { StatusBadge } from '../shared/StatusBadge'

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
    <article className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-elevated)]/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base uppercase tracking-[0.06em] text-[color:var(--text-primary)]">
            {agent.name}
          </h3>
          <p className="font-body text-xs text-[color:var(--text-muted)]">{agent.role}</p>
        </div>
        <StatusBadge
          label={statusLabel[agent.status]}
          tone={statusTone[agent.status]}
        />
      </div>
      <p className="mt-3 font-body text-sm text-[color:var(--text-secondary)]">Model: {agent.model}</p>
      <p className="font-body text-sm text-[color:var(--text-secondary)]">
        Tokens: {agent.tokenUsage.total.toLocaleString()}
      </p>
      <p className="mt-2 font-body text-sm text-[color:var(--text-primary)]">{agent.currentTask}</p>
    </article>
  )
}
