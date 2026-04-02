import type { ParsedRoadmap, ParsedRoadmapSlice } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

function riskBadgeClass(risk: ParsedRoadmapSlice['risk']): string {
  if (risk === 'high') {
    return 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
  }

  if (risk === 'medium') {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
  }

  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
}

export interface RoadmapViewProps {
  roadmap: ParsedRoadmap
}

export function RoadmapView({ roadmap }: RoadmapViewProps) {
  return (
    <div className="space-y-4">
      {roadmap.vision ? (
        <section className="rounded-lg border border-border bg-background px-3 py-2">
          <p className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">Vision</p>
          <p className="mt-1 text-sm leading-relaxed">{roadmap.vision}</p>
        </section>
      ) : null}

      {roadmap.successCriteria.length > 0 ? (
        <section className="rounded-lg border border-border bg-background px-3 py-2">
          <p className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
            Success Criteria
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
            {roadmap.successCriteria.map((criterion) => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        {roadmap.slices.map((slice) => (
          <Card
            key={slice.id}
            size="sm"
            className={cn(slice.done && 'border-dashed bg-muted/40 text-muted-foreground')}
          >
            <CardHeader className="gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={slice.done}
                    readOnly
                    aria-label={`${slice.id} completion state`}
                    className="mt-0.5 size-4 rounded border-border"
                  />
                  <Badge variant="secondary">{slice.id}</Badge>
                  <CardTitle className={cn('text-sm', slice.done && 'line-through')}>
                    {slice.title}
                  </CardTitle>
                </div>

                <Badge className={cn('capitalize', riskBadgeClass(slice.risk))}>{slice.risk} risk</Badge>
              </div>

              {slice.depends.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {slice.depends.map((dependency) => (
                    <Badge key={`${slice.id}-${dependency}`} variant="outline">
                      depends: {dependency}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardHeader>

            {slice.demo ? (
              <CardContent className="pt-0 text-sm italic text-muted-foreground">{slice.demo}</CardContent>
            ) : null}
          </Card>
        ))}
      </section>

      {roadmap.boundaryMap.length > 0 ? (
        <Collapsible defaultOpen={false} className="rounded-lg border border-border bg-background">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold tracking-wide uppercase text-muted-foreground"
            >
              Boundary Map
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent className="space-y-2 border-t border-border px-3 py-2">
            {roadmap.boundaryMap.map((section) => (
              <div key={section.heading} className="space-y-1">
                <p className="text-sm font-medium">{section.heading}</p>
                <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
                  {section.content}
                </pre>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  )
}
