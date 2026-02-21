import { Badge } from '../ui/badge'

export type StatusBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

type StatusBadgeProps = {
  label: string
  tone?: StatusBadgeTone
  className?: string
}

const toneVariant: Record<StatusBadgeTone, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  neutral: 'outline',
  info: 'secondary',
  success: 'default',
  warning: 'secondary',
  danger: 'destructive'
}

export function StatusBadge({ label, tone = 'neutral', className }: StatusBadgeProps) {
  return (
    <Badge
      variant={toneVariant[tone]}
      className={className}
    >
      {label}
    </Badge>
  )
}
