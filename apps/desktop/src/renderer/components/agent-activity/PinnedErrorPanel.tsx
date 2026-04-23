import { useSetAtom } from 'jotai'
import { useAgentActivitySnapshot, dismissPinnedErrorAtom } from '@/atoms/agent-activity'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

function formatTime(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'unknown'
  }

  return parsed.toLocaleTimeString()
}

export function PinnedErrorPanel() {
  const snapshot = useAgentActivitySnapshot()
  const dismiss = useSetAtom(dismissPinnedErrorAtom)

  return (
    <section className="space-y-2" data-testid="agent-activity-pinned-errors">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pinned Errors</h3>

      {snapshot.pinnedErrors.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          No pinned errors.
        </p>
      ) : (
        <div className="space-y-2">
          {snapshot.pinnedErrors.map((incident) => (
            <Alert key={incident.incidentId} variant="destructive" data-testid={`agent-activity-pinned-${incident.incidentId}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <AlertTitle>{incident.kind}</AlertTitle>
                  <AlertDescription>{incident.message}</AlertDescription>
                  <p className="text-[11px] text-muted-foreground">
                    First seen {formatTime(incident.firstSeenAt)} · Last seen {formatTime(incident.lastSeenAt)} ·{' '}
                    {incident.occurrences} occurrence{incident.occurrences === 1 ? '' : 's'}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void dismiss(incident.incidentId)
                  }}
                  data-testid={`agent-activity-dismiss-${incident.incidentId}`}
                >
                  Dismiss
                </Button>
              </div>
            </Alert>
          ))}
        </div>
      )}
    </section>
  )
}
