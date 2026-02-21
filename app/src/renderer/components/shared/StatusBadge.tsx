import { Badge } from '../ui/badge'
import { cn } from '../../lib/cn'

export type StatusBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

type StatusBadgeProps = {
  label: string
  tone?: StatusBadgeTone
  className?: string
}

const toneVariant: Record<StatusBadgeTone, 'outline' | 'info' | 'success' | 'warning' | 'danger'> = {
  neutral: 'outline',
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'danger'
}

export function StatusBadge({ label, tone = 'neutral', className }: StatusBadgeProps) {
  return (
    <Badge
      variant={toneVariant[tone]}
      className={cn('uppercase tracking-wide', className)}
    >
      {label}
    </Badge>
  )
}
