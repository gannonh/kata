import type { AgentSummary } from '../../types/agent'

type AgentCardProps = {
  agent: AgentSummary
}

const statusLabel: Record<AgentSummary['status'], string> = {
  idle: 'Idle',
  running: 'Running',
  blocked: 'Blocked',
  complete: 'Complete'
}

const statusDotClassName: Record<AgentSummary['status'], string> = {
  idle: 'bg-muted-foreground/45',
  running: 'bg-emerald-400',
  blocked: 'bg-amber-400',
  complete: 'bg-sky-400'
}

function toRelativeTime(isoDate: string, now = Date.now()): string {
  const timestamp = Date.parse(isoDate)
  if (!Number.isFinite(timestamp)) {
    return ''
  }

  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000))
  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h`
  }

  return `${Math.floor(hours / 24)}d`
}

export function AgentCard({ agent }: AgentCardProps) {
  const updatedLabel = toRelativeTime(agent.lastUpdated)
  const delegatedLabel = agent.delegatedBy ? `Delegated by ${agent.delegatedBy}` : null

  return (
    <article className="w-full overflow-hidden rounded-md border border-border/70 bg-card/40 px-3 py-2">
      <div className="flex items-start gap-2">
        <span
          data-testid="agent-row-status-dot"
          className={[
            'mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full',
            statusDotClassName[agent.status]
          ].join(' ')}
        >
          <span className="sr-only">{statusLabel[agent.status]}</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="max-w-[18ch] truncate text-sm font-medium text-foreground">{agent.name}</p>
            {updatedLabel ? (
              <span className="text-xs text-muted-foreground">{updatedLabel}</span>
            ) : null}
          </div>
          <p className="mt-1 max-w-[22ch] truncate text-xs text-muted-foreground">{agent.currentTask}</p>
          {delegatedLabel ? (
            <p className="mt-1 max-w-[22ch] truncate text-xs text-muted-foreground">{delegatedLabel}</p>
          ) : null}
        </div>
      </div>
    </article>
  )
}
