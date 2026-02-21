import type { AgentSummary } from '../../types/agent'
import { AgentCard } from './AgentCard'

type AgentsTabProps = {
  agents: AgentSummary[]
}

export function AgentsTab({ agents }: AgentsTabProps) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight">
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
