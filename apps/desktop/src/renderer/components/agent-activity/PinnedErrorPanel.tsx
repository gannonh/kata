import { useSetAtom } from 'jotai'
import { useAgentActivitySnapshot, setPinnedEventAtom } from '@/atoms/agent-activity'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

function formatTime(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'unknown'
  }

  return parsed.toLocaleTimeString()
}

function alertVariant(severity: 'info' | 'warning' | 'error'): 'default' | 'destructive' {
  return severity === 'error' ? 'destructive' : 'default'
}

export function PinnedErrorPanel() {
  const snapshot = useAgentActivitySnapshot()
  const setPinnedEvent = useSetAtom(setPinnedEventAtom)

  return (
    <section className="space-y-2" data-testid="agent-activity-pinned-errors">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pinned Events</h3>

      {snapshot.pinnedEvents.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          No pinned events.
        </p>
      ) : (
        <div className="space-y-2">
          {snapshot.pinnedEvents.map((event) => (
            <Alert key={event.eventId} variant={alertVariant(event.severity)} data-testid={`agent-activity-pinned-${event.eventId}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <AlertTitle>{event.kind}</AlertTitle>
                  <AlertDescription>{event.message}</AlertDescription>
                  <p className="text-[11px] text-muted-foreground">
                    Event at {formatTime(event.timestamp)} · Pinned at {formatTime(event.pinnedAt)}
                    {event.automatic ? ' · Auto-pinned error' : ' · Manually pinned'}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void setPinnedEvent({ eventId: event.eventId, pinned: false })
                  }}
                  data-testid={`agent-activity-dismiss-${event.eventId}`}
                >
                  Unpin
                </Button>
              </div>
            </Alert>
          ))}
        </div>
      )}
    </section>
  )
}
