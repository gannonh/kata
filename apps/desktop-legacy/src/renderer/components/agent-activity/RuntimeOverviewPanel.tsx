import { useSymphonyDashboardSnapshot } from '@/atoms/symphony-dashboard'
import { useSymphonyStatus } from '@/atoms/symphony'

function formatTime(value?: string): string {
  if (!value) {
    return '—'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '—'
  }
  return parsed.toLocaleTimeString()
}

function formatAge(value?: string): string {
  if (!value) {
    return '—'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '—'
  }
  const seconds = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 1000))
  return `${seconds}s ago`
}

export function RuntimeOverviewPanel() {
  const snapshot = useSymphonyDashboardSnapshot()
  const status = useSymphonyStatus()

  return (
    <section className="space-y-2" data-testid="agent-activity-runtime-overview">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Runtime Overview</h3>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <SummaryStat label="Running" value={snapshot.workers.length} />
        <SummaryStat label="Queue" value={snapshot.queueCount} />
        <SummaryStat label="Completed" value={snapshot.completedCount} />
        <SummaryStat label="Escalations" value={snapshot.escalations.length} />
      </div>

      <div className="rounded-md border border-border/80 bg-card/40 px-3 py-2 text-xs text-muted-foreground">
        <p>
          Runtime phase: <span className="text-foreground">{status.phase}</span> · Connection:{' '}
          <span className="text-foreground">{snapshot.connection.state}</span> · Freshness:{' '}
          <span className="text-foreground">{snapshot.freshness.status}</span>
        </p>
        <p>
          Snapshot fetched {formatAge(snapshot.fetchedAt)} ({formatTime(snapshot.fetchedAt)}) · Status updated{' '}
          {formatAge(status.updatedAt)} ({formatTime(status.updatedAt)})
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-2 py-2 font-medium">ID</th>
              <th className="px-2 py-2 font-medium">State</th>
              <th className="px-2 py-2 font-medium">Tool</th>
              <th className="px-2 py-2 font-medium">Last Activity</th>
              <th className="px-2 py-2 font-medium">Model</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.workers.length === 0 ? (
              <tr>
                <td className="px-2 py-2 text-muted-foreground" colSpan={5}>
                  No running sessions.
                </td>
              </tr>
            ) : (
              snapshot.workers.map((worker) => (
                <tr key={worker.issueId} className="border-t border-border/80">
                  <td className="px-2 py-2 align-top text-foreground">{worker.identifier}</td>
                  <td className="px-2 py-2 align-top text-foreground">{worker.state}</td>
                  <td className="px-2 py-2 align-top text-foreground">{worker.toolName}</td>
                  <td className="px-2 py-2 align-top text-foreground">{formatAge(worker.lastActivityAt)}</td>
                  <td className="px-2 py-2 align-top text-foreground">{worker.model}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background/50 px-2 py-2" data-testid={`agent-activity-runtime-${label.toLowerCase()}`}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}
