import { useAtomValue, useSetAtom } from 'jotai'
import { AlertCircle, Loader2, RotateCcw, Square, Play } from 'lucide-react'
import { symphonyCommandPendingAtom, symphonyStatusAtom, runSymphonyCommandAtom } from '@/atoms/symphony'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const PHASE_LABELS: Record<string, string> = {
  idle: 'Idle',
  starting: 'Starting',
  ready: 'Ready',
  disconnected: 'Disconnected',
  restarting: 'Restarting',
  stopping: 'Stopping',
  stopped: 'Stopped',
  failed: 'Failed',
  config_error: 'Config Error',
}

export function formatSymphonyPhaseLabel(phase: string): string {
  return PHASE_LABELS[phase] ?? phase
}

export function phaseBadgeVariant(phase: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (phase === 'ready') return 'default'
  if (phase === 'failed' || phase === 'config_error') return 'destructive'
  if (phase === 'starting' || phase === 'restarting' || phase === 'stopping') return 'secondary'
  return 'outline'
}

export function deriveSymphonyControlState(options: {
  phase: string
  managedProcessRunning: boolean
  pending: boolean
}): { canStart: boolean; canStop: boolean; canRestart: boolean } {
  const canStart =
    !options.pending && !options.managedProcessRunning && options.phase !== 'starting'
  const canStop = !options.pending && options.managedProcessRunning
  const canRestart =
    !options.pending && (options.managedProcessRunning || options.phase === 'ready')

  return {
    canStart,
    canStop,
    canRestart,
  }
}

export function SymphonyRuntimePanel() {
  const status = useAtomValue(symphonyStatusAtom)
  const pending = useAtomValue(symphonyCommandPendingAtom)
  const runCommand = useSetAtom(runSymphonyCommandAtom)

  const controls = deriveSymphonyControlState({
    phase: status.phase,
    managedProcessRunning: status.managedProcessRunning,
    pending,
  })

  return (
    <Card className="border border-border bg-card/60 py-0" data-testid="symphony-runtime-panel">
      <CardHeader className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm text-foreground">Symphony Runtime</CardTitle>
          <Badge variant={phaseBadgeVariant(status.phase)} data-testid="symphony-phase-badge">
            {formatSymphonyPhaseLabel(status.phase)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 p-4 pt-2 text-xs">
        <div className="grid gap-1 text-muted-foreground">
          <span>
            URL: <span className="font-mono text-foreground">{status.url ?? 'Not configured'}</span>
          </span>
          <span>
            Process: <span className="font-mono text-foreground">{status.pid ?? 'Not running'}</span>
          </span>
          {status.launch?.command ? (
            <span>
              Command: <span className="font-mono text-foreground">{status.launch.command}</span>
            </span>
          ) : null}
        </div>

        {status.lastError ? (
          <Alert variant="destructive" data-testid="symphony-runtime-error">
            <AlertCircle />
            <AlertTitle>{status.lastError.code}</AlertTitle>
            <AlertDescription>{status.lastError.message}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void runCommand('start')}
            disabled={!controls.canStart}
            data-testid="symphony-start-button"
          >
            <Play className="size-3.5" />
            Start
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void runCommand('restart')}
            disabled={!controls.canRestart}
            data-testid="symphony-restart-button"
          >
            <RotateCcw className="size-3.5" />
            Restart
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void runCommand('stop')}
            disabled={!controls.canStop}
            data-testid="symphony-stop-button"
          >
            <Square className="size-3.5" />
            Stop
          </Button>

          {pending ? (
            <span className={cn('inline-flex items-center gap-1 text-muted-foreground')}>
              <Loader2 className="size-3 animate-spin" />
              Applying runtime command…
            </span>
          ) : null}
        </div>

        {status.phase === 'config_error' ? (
          <p className="text-muted-foreground" data-testid="symphony-config-guidance">
            Configure <code>symphony.url</code> and <code>symphony.workflow_path</code> in
            <code> .kata/preferences.md</code> or ensure <code>WORKFLOW.md</code> exists.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
