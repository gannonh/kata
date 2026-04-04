import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { WorkflowBoardSliceCard } from '@shared/types'
import { TaskList } from '@/components/kanban/TaskList'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

interface SliceCardProps {
  card: WorkflowBoardSliceCard
}

function executionTone(freshness: 'fresh' | 'stale' | 'disconnected' | 'unknown'): string {
  if (freshness === 'fresh') return 'text-emerald-700 dark:text-emerald-300'
  if (freshness === 'stale') return 'text-amber-700 dark:text-amber-300'
  if (freshness === 'disconnected') return 'text-destructive'
  return 'text-muted-foreground'
}

export function formatSliceSymphonyHint(symphony: WorkflowBoardSliceCard['symphony']): string {
  if (!symphony) {
    return 'Symphony context unavailable'
  }

  if (symphony.provenance === 'runtime-disconnected') {
    return 'Symphony runtime disconnected'
  }

  if (symphony.provenance === 'operator-stale') {
    return 'Symphony context is stale'
  }

  if (symphony.assignmentState === 'assigned') {
    return `Execution: ${symphony.toolName ?? 'active'}`
  }

  return 'No active Symphony execution'
}

export function SliceCard({ card }: SliceCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const symphony = card.symphony

  return (
    <Card size="sm" className="gap-3 rounded-xl border border-border/70 py-3 shadow-none">
      <CardHeader className="px-3 pb-0">
        <CardTitle className="text-sm leading-tight">
          {card.url ? (
            <a href={card.url} target="_blank" rel="noreferrer" className="hover:underline">
              {card.identifier} · {card.title}
            </a>
          ) : (
            <>{card.identifier} · {card.title}</>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-2 px-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{card.stateName}</span>
          <Badge variant="outline" className="text-[10px]">
            {card.taskCounts.done}/{card.taskCounts.total} tasks done
          </Badge>
        </div>

        {symphony ? (
          <div className="space-y-1 text-[11px]">
            <div className="flex flex-wrap items-center gap-1">
              <Badge variant={symphony.assignmentState === 'assigned' ? 'default' : 'outline'} className="text-[10px]">
                {symphony.assignmentState === 'assigned'
                  ? `Worker ${symphony.identifier ?? 'assigned'}`
                  : 'Unassigned'}
              </Badge>
              {symphony.workerState ? (
                <Badge variant="outline" className="text-[10px]">
                  {symphony.workerState}
                </Badge>
              ) : null}
              {symphony.pendingEscalations > 0 ? (
                <Badge variant="destructive" className="text-[10px]">
                  {symphony.pendingEscalations} escalation{symphony.pendingEscalations === 1 ? '' : 's'}
                </Badge>
              ) : null}
            </div>
            <p className={executionTone(symphony.freshness)} data-testid={`slice-symphony-${card.identifier}`}>
              {formatSliceSymphonyHint(symphony)}
            </p>
          </div>
        ) : null}

        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <ChevronDown className={`size-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            {isOpen ? 'Hide tasks' : 'Show tasks'}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <TaskList tasks={card.tasks} />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
