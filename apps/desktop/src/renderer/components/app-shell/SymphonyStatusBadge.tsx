import { useAtomValue, useSetAtom } from 'jotai'
import { Play, Square, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'
import { symphonyCommandPendingAtom, symphonyStatusAtom, runSymphonyCommandAtom } from '@/atoms/symphony'
import {
  formatSymphonyPhaseLabel,
  phaseBadgeVariant,
  deriveSymphonyControlState,
} from '../settings/SymphonyRuntimePanel'

export function SymphonyStatusBadge() {
  const status = useAtomValue(symphonyStatusAtom)
  const pending = useAtomValue(symphonyCommandPendingAtom)
  const runCommand = useSetAtom(runSymphonyCommandAtom)

  const controls = deriveSymphonyControlState({
    phase: status.phase,
    managedProcessRunning: status.managedProcessRunning,
    pending,
  })

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="cursor-pointer" data-testid="symphony-status-badge">
          <Badge variant={phaseBadgeVariant(status.phase)}>
            Symphony: {formatSymphonyPhaseLabel(status.phase)}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start">
        <div className="flex flex-col gap-1">
          {pending ? (
            <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
              <Spinner className="size-3" />
              <span>Working…</span>
            </div>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 justify-start gap-2 text-xs"
                disabled={!controls.canStart}
                onClick={() => void runCommand('start')}
              >
                <Play className="size-3.5" />
                Start
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 justify-start gap-2 text-xs"
                disabled={!controls.canStop}
                onClick={() => void runCommand('stop')}
              >
                <Square className="size-3.5" />
                Stop
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 justify-start gap-2 text-xs"
                disabled={!controls.canRestart}
                onClick={() => void runCommand('restart')}
              >
                <RotateCcw className="size-3.5" />
                Restart
              </Button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
