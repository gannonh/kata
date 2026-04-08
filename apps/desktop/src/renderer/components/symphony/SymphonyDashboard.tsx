import { useAtomValue, useSetAtom } from 'jotai'
import { RefreshCcw } from 'lucide-react'
import type { ReliabilitySignal } from '@shared/types'
import { Spinner } from '@/components/ui/spinner'
import {
  refreshSymphonyDashboardAtom,
  respondToEscalationAtom,
  setSymphonyEscalationDraftAtom,
  symphonyDashboardLoadingAtom,
  symphonyEscalationDraftsAtom,
  useSymphonyDashboardSnapshot,
} from '@/atoms/symphony-dashboard'
import {
  formatReliabilityActionLabel,
  formatReliabilityClassLabel,
  reliabilityRecoveryPendingAtom,
  reliabilitySeverityTone,
  requestReliabilityRecoveryActionAtom,
  useReliabilitySurfaceState,
} from '@/atoms/reliability'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EscalationList } from './EscalationList'
import { WorkerTable } from './WorkerTable'

export function connectionBadgeVariant(
  state: 'connected' | 'reconnecting' | 'disconnected',
): 'default' | 'secondary' | 'destructive' {
  if (state === 'connected') return 'default'
  if (state === 'reconnecting') return 'secondary'
  return 'destructive'
}

export function formatSymphonyReliabilityNotice(signal: ReliabilitySignal): string {
  return `${signal.message} Recommended recovery: ${formatReliabilityActionLabel(signal.recoveryAction)}.`
}

export function SymphonyDashboard() {
  const snapshot = useSymphonyDashboardSnapshot()
  const loading = useAtomValue(symphonyDashboardLoadingAtom)
  const drafts = useAtomValue(symphonyEscalationDraftsAtom)
  const reliabilityPendingBySurface = useAtomValue(reliabilityRecoveryPendingAtom)
  const symphonyReliability = useReliabilitySurfaceState('symphony')
  const refresh = useSetAtom(refreshSymphonyDashboardAtom)
  const setDraft = useSetAtom(setSymphonyEscalationDraftAtom)
  const respond = useSetAtom(respondToEscalationAtom)
  const requestRecoveryAction = useSetAtom(requestReliabilityRecoveryActionAtom)

  return (
    <Card className="border border-border bg-card/60 py-0" data-testid="symphony-dashboard-panel">
      <CardHeader className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm text-foreground">Live Symphony Dashboard</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={connectionBadgeVariant(snapshot.connection.state)} data-testid="symphony-dashboard-connection">
              {snapshot.connection.state}
            </Badge>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void refresh()}
              disabled={loading}
              data-testid="symphony-dashboard-refresh"
            >
              {loading ? <Spinner className="size-3.5" /> : <RefreshCcw className="size-3.5" />}
              Refresh
            </Button>
            {symphonyReliability.signal ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void requestRecoveryAction({
                    sourceSurface: 'symphony',
                    action: symphonyReliability.signal!.recoveryAction,
                  })
                }}
                disabled={reliabilityPendingBySurface.symphony}
                data-testid="symphony-dashboard-recovery"
              >
                {reliabilityPendingBySurface.symphony
                  ? 'Recovering…'
                  : formatReliabilityActionLabel(symphonyReliability.signal.recoveryAction)}
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 pt-2 text-xs">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4" data-testid="symphony-dashboard-summary">
          <SummaryStat label="Workers" value={snapshot.workers.length} />
          <SummaryStat label="Queue" value={snapshot.queueCount} />
          <SummaryStat label="Completed" value={snapshot.completedCount} />
          <SummaryStat label="Escalations" value={snapshot.escalations.length} />
        </div>

        {symphonyReliability.signal ? (
          <Alert
            variant={reliabilitySeverityTone(symphonyReliability.signal.severity) === 'error' ? 'destructive' : 'default'}
            data-testid="symphony-dashboard-reliability"
          >
            <AlertTitle>
              {formatReliabilityClassLabel(symphonyReliability.signal.class)} · {symphonyReliability.signal.code}
            </AlertTitle>
            <AlertDescription>{formatSymphonyReliabilityNotice(symphonyReliability.signal)}</AlertDescription>
          </Alert>
        ) : snapshot.freshness.status === 'stale' && !snapshot.connection.lastError ? (
          <Alert variant="destructive" data-testid="symphony-dashboard-stale">
            <AlertTitle>Dashboard is stale</AlertTitle>
            <AlertDescription>{snapshot.freshness.staleReason ?? 'No recent updates from Symphony.'}</AlertDescription>
          </Alert>
        ) : null}

        {snapshot.connection.lastError && !symphonyReliability.signal ? (
          <Alert variant="destructive" data-testid="symphony-dashboard-error">
            <AlertTitle>Connection issue</AlertTitle>
            <AlertDescription>{snapshot.connection.lastError}</AlertDescription>
          </Alert>
        ) : null}

        <WorkerTable workers={snapshot.workers} />

        <EscalationList
          escalations={snapshot.escalations}
          drafts={drafts}
          submittingRequestId={snapshot.response.submittingRequestId}
          lastResult={snapshot.response.lastResult}
          onDraftChange={(requestId, value) => setDraft({ requestId, value })}
          onSubmit={(requestId) => {
            void respond({ requestId }).catch((error) => {
              console.error('[SymphonyDashboard] escalation submit failed', error)
            })
          }}
        />
      </CardContent>
    </Card>
  )
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background/50 px-2 py-2" data-testid={`symphony-summary-${label.toLowerCase()}`}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}
