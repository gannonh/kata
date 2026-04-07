import { useAtomValue, useSetAtom } from 'jotai'
import { Spinner } from '@/components/ui/spinner'
import { symphonyCommandPendingAtom, symphonyStatusAtom, runSymphonyCommandAtom } from '@/atoms/symphony'
import { formatSymphonyPhaseLabel } from '../settings/SymphonyRuntimePanel'

function statusDotColor(phase: string): string {
  if (phase === 'ready') return 'bg-emerald-500'
  if (phase === 'starting' || phase === 'restarting' || phase === 'stopping') return 'bg-amber-500'
  return 'bg-red-500'
}

export function SymphonyStatusBadge() {
  const status = useAtomValue(symphonyStatusAtom)
  const pending = useAtomValue(symphonyCommandPendingAtom)
  const runCommand = useSetAtom(runSymphonyCommandAtom)

  const isRunning = status.phase === 'ready'
  const isTransitioning = pending || status.phase === 'starting' || status.phase === 'restarting' || status.phase === 'stopping'

  const handleClick = async () => {
    if (isTransitioning) return
    try {
      if (isRunning) {
        await runCommand('stop')
      } else {
        await runCommand('start')
      }
    } catch (error) {
      console.error('[SymphonyStatusBadge] command failed', error)
    }
  }

  return (
    <button
      type="button"
      className="flex items-center gap-2 rounded-md border border-border/70 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
      onClick={() => { void handleClick() }}
      disabled={isTransitioning}
      title={isTransitioning ? 'Symphony is transitioning…' : isRunning ? 'Click to stop Symphony' : 'Click to start Symphony'}
      data-testid="symphony-status-badge"
    >
      {isTransitioning ? (
        <Spinner className="size-2.5" />
      ) : (
        <span className={`size-2.5 rounded-full ${statusDotColor(status.phase)}`} />
      )}
      Symphony: {formatSymphonyPhaseLabel(status.phase)}
    </button>
  )
}
