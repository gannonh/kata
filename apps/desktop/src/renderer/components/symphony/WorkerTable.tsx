import type { SymphonyOperatorWorkerRow } from '@shared/types'

interface WorkerTableProps {
  workers: SymphonyOperatorWorkerRow[]
}

export function WorkerTable({ workers }: WorkerTableProps) {
  return (
    <section data-testid="symphony-worker-table" className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workers</h3>
      {workers.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground" data-testid="symphony-worker-empty">
          No active workers.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium">Issue</th>
                <th className="px-2 py-2 font-medium">State</th>
                <th className="px-2 py-2 font-medium">Tool</th>
                <th className="px-2 py-2 font-medium">Model</th>
                <th className="px-2 py-2 font-medium">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((worker) => (
                <tr key={worker.issueId} className="border-t border-border/80">
                  <td className="px-2 py-2 align-top">
                    <p className="font-medium text-foreground">{worker.identifier}</p>
                    <p className="text-muted-foreground">{worker.issueTitle}</p>
                  </td>
                  <td className="px-2 py-2 align-top text-foreground">{worker.state}</td>
                  <td className="px-2 py-2 align-top text-foreground">{worker.toolName}</td>
                  <td className="px-2 py-2 align-top text-foreground">{worker.model}</td>
                  <td className="px-2 py-2 align-top text-foreground">
                    {worker.lastActivityAt ? new Date(worker.lastActivityAt).toLocaleTimeString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
