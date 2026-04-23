import { useEffect, useMemo, useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  agentActivityLoadingAtom,
  agentActivityAutoFollowAtom,
  agentActivityModeAtom,
  agentActivityUnseenCountAtom,
  filteredAgentActivityEventsAtom,
  jumpToLatestAgentActivityAtom,
  setAgentActivityAutoFollowAtom,
} from '@/atoms/agent-activity'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

function formatTime(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'unknown'
  }

  return parsed.toLocaleTimeString()
}

function severityVariant(severity: 'info' | 'warning' | 'error'): 'secondary' | 'destructive' | 'default' {
  if (severity === 'error') {
    return 'destructive'
  }
  if (severity === 'warning') {
    return 'default'
  }
  return 'secondary'
}

export function ActivityTimeline() {
  const mode = useAtomValue(agentActivityModeAtom)
  const loading = useAtomValue(agentActivityLoadingAtom)
  const autoFollow = useAtomValue(agentActivityAutoFollowAtom)
  const events = useAtomValue(filteredAgentActivityEventsAtom)
  const unseenCount = useAtomValue(agentActivityUnseenCountAtom)
  const setAutoFollow = useSetAtom(setAgentActivityAutoFollowAtom)
  const jumpToLatest = useSetAtom(jumpToLatestAgentActivityAtom)
  const scrollViewportRef = useRef<HTMLDivElement | null>(null)
  const shouldAutoFollow = autoFollow

  useEffect(() => {
    if (!shouldAutoFollow) {
      return
    }

    const viewport = scrollViewportRef.current
    if (!viewport) {
      return
    }

    viewport.scrollTop = viewport.scrollHeight
  }, [events.length, shouldAutoFollow])

  const streamLabel = useMemo(() => (mode === 'events' ? 'Events' : 'Verbose'), [mode])

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2" data-testid="agent-activity-timeline">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{streamLabel} Timeline</h3>
        {unseenCount > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => jumpToLatest()}
            data-testid="agent-activity-jump-latest"
          >
            Jump to latest ({unseenCount})
          </Button>
        ) : null}
      </div>

      <div
        ref={scrollViewportRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md border border-border p-3"
        onScroll={(event) => {
          const element = event.currentTarget
          const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight
          setAutoFollow(distanceToBottom < 24)
        }}
        data-testid="agent-activity-scroll-area"
      >
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-3.5" />
              Loading activity…
            </div>
          ) : null}

          {!loading && events.length === 0 ? (
            <p className="text-xs text-muted-foreground">No activity yet. New events appear here in real time.</p>
          ) : null}

          {events.map((event) => (
            <div key={`${event.stream}:${event.id}`} className="rounded-md border border-border/80 bg-card/40 p-2" data-testid={`agent-activity-row-${event.id}`}>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">{formatTime(event.timestamp)}</span>
                <Badge variant="outline">{event.source}</Badge>
                <Badge variant={severityVariant(event.severity)}>{event.severity}</Badge>
                <Badge variant="secondary">{event.kind}</Badge>
              </div>
              <p className="mt-1 text-xs text-foreground">{event.message}</p>
              {event.details ? (
                <details className="mt-1 text-[11px] text-muted-foreground">
                  <summary className="cursor-pointer">Details</summary>
                  <pre className="mt-1 whitespace-pre-wrap break-words">{JSON.stringify(event.details, null, 2)}</pre>
                </details>
              ) : null}
            </div>
          ))}
      </div>
    </section>
  )
}
