import { ChevronDown } from 'lucide-react'
import type { PlanningSliceData } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export interface SliceViewProps {
  slice?: PlanningSliceData
}

export function SliceView({ slice }: SliceViewProps) {
  if (!slice) {
    return (
      <div className="rounded-lg border border-border bg-background px-3 py-4 text-sm text-muted-foreground">
        Slice details are not available yet.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-background px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{slice.id}</Badge>
          <h3 className="text-sm font-semibold text-foreground">{slice.title}</h3>
        </div>

        <div className="mt-3">
          <p className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">Description</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {slice.description || 'No description provided.'}
          </p>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">Task Checklist</p>
          <span className="text-xs text-muted-foreground">{slice.tasks.length} tasks</span>
        </div>

        {slice.tasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-background px-3 py-4 text-sm text-muted-foreground">
            No tasks created yet.
          </div>
        ) : (
          <div className="space-y-2">
            {slice.tasks.map((task) => {
              const isDone = task.status === 'done'
              const isInProgress = task.status === 'in_progress'

              return (
                <Collapsible
                  key={`${slice.id}-${task.id}-${task.title}`}
                  defaultOpen={false}
                  className="group/task overflow-hidden rounded-lg border border-border bg-background"
                >
                  <CollapsibleTrigger asChild>
                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left">
                      <input
                        type="checkbox"
                        checked={isDone}
                        readOnly
                        aria-label={`${task.id} completion state`}
                        className="size-4 rounded border-border"
                      />

                      <Badge variant="outline">{task.id}</Badge>

                      <div className="min-w-0 flex-1">
                        <p className={cn('truncate text-sm font-medium', isDone && 'line-through text-muted-foreground')}>
                          {task.title}
                        </p>
                      </div>

                      <Badge
                        className={cn(
                          'capitalize',
                          isDone && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
                          isInProgress &&
                            'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
                          !isDone && !isInProgress &&
                            'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300',
                        )}
                      >
                        {task.status.replace('_', ' ')}
                      </Badge>

                      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/task:rotate-180" />
                    </button>
                  </CollapsibleTrigger>

                  <CollapsibleContent className="border-t border-border px-3 py-2">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                      {task.description || 'No description provided.'}
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
