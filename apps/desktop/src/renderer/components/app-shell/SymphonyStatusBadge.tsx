import { useAtomValue } from 'jotai'
import { Badge } from '@/components/ui/badge'
import { symphonyStatusAtom } from '@/atoms/symphony'
import { formatSymphonyPhaseLabel, phaseBadgeVariant } from '../settings/SymphonyRuntimePanel'

export function SymphonyStatusBadge() {
  const status = useAtomValue(symphonyStatusAtom)

  return (
    <Badge variant={phaseBadgeVariant(status.phase)} data-testid="symphony-status-badge">
      Symphony: {formatSymphonyPhaseLabel(status.phase)}
    </Badge>
  )
}
