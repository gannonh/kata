import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import type { AgentSummary } from '../../types/agent'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import { AgentCard } from './AgentCard'
import { LeftSection } from './LeftSection'
import { statusDotClassName } from './agentStatus'

type AgentsTabProps = {
  agents: AgentSummary[]
}

export function AgentsTab({ agents }: AgentsTabProps) {
  const [backgroundExpanded, setBackgroundExpanded] = useState(false)

  const coordinator = agents[0]
  const backgroundAgents = useMemo(() => {
    if (!coordinator) {
      return []
    }
    return coordinator.children ?? agents.slice(1)
  }, [agents])
  const runningCount = backgroundAgents.filter((agent) => agent.status === 'running').length

  return (
    <LeftSection
      title="Agents"
      description="Agents write code, maintain notes, and coordinate tasks."
      addActionLabel="Create new agent"
    >
      <div className="space-y-3 pr-0">
        {coordinator ? (
          <AgentCard agent={coordinator} />
        ) : null}

        {backgroundAgents.length ? (
          <Collapsible
            open={backgroundExpanded}
            onOpenChange={setBackgroundExpanded}
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between overflow-hidden rounded-md border border-border/70 bg-muted/20 pl-2.5 pr-0 py-2 text-left"
                aria-label={`${runningCount} / ${backgroundAgents.length} background agents running`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex shrink-0 items-center gap-1">
                    {backgroundAgents.map((agent) => (
                      <span
                        key={agent.id}
                        className={[
                          'inline-flex h-2.5 w-2.5 rounded-[2px]',
                          statusDotClassName[agent.status]
                        ].join(' ')}
                        aria-hidden="true"
                      />
                    ))}
                  </span>
                  <span className="max-w-[20ch] truncate text-xs font-medium text-muted-foreground">
                    {runningCount} / {backgroundAgents.length} background agents running
                  </span>
                </div>
                <ChevronDown
                  aria-hidden="true"
                  className={[
                    'h-4 w-4 text-muted-foreground transition-transform duration-150',
                    backgroundExpanded ? 'rotate-180' : ''
                  ].join(' ')}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-2 grid gap-2 pl-3">
                {backgroundAgents.map((agent) => (
                  <li key={agent.id}>
                    <AgentCard agent={agent} />
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>
    </LeftSection>
  )
}
