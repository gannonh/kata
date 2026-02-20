import type { AgentSummary } from '../../types/agent'
import { AgentCard } from './AgentCard'

type AgentsTabProps = {
  agents: AgentSummary[]
}

export function AgentsTab({ agents }: AgentsTabProps) {
  return (
    <section>
      <h2 className="font-display text-3xl uppercase tracking-[0.08em] text-[color:var(--text-primary)]">
        Agents
      </h2>
      <ul className="mt-4 grid gap-3">
        {agents.map((agent) => (
          <li key={agent.id}>
            <AgentCard agent={agent} />
          </li>
        ))}
      </ul>
    </section>
  )
}
