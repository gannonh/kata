import { ChevronDown } from 'lucide-react'
import type { WorkflowBoardSliceCard } from '@shared/types'
import { TaskList } from '@/components/kanban/TaskList'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

interface SliceCardProps {
  card: WorkflowBoardSliceCard
}

export function SliceCard({ card }: SliceCardProps) {
  return (
    <Card size="sm" className="gap-3 rounded-xl border border-border/70 py-3 shadow-none">
      <CardHeader className="px-3 pb-0">
        <CardTitle className="text-sm leading-tight">
          {card.identifier} · {card.title}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-2 px-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{card.stateName}</span>
          <Badge variant="outline" className="text-[10px]">
            {card.taskCounts.done}/{card.taskCounts.total} tasks done
          </Badge>
        </div>

        <Collapsible>
          <CollapsibleTrigger className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <ChevronDown className="size-3" />
            Show tasks
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <TaskList tasks={card.tasks} />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
