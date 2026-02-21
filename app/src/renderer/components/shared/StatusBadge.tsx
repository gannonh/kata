import { Badge } from '../ui/badge'

export type StatusBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

type StatusBadgeProps = {
  label: string
  tone?: StatusBadgeTone
  className?: string
}

const toneVariant: Record<StatusBadgeTone, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  neutral: 'outline',
  info: 'outline',
  success: 'outline',
  warning: 'outline',
  danger: 'destructive'
}

const toneClassName: Partial<Record<StatusBadgeTone, string>> = {
  info: 'border-status-in-progress/50 bg-status-in-progress/15 text-status-in-progress',
  success: 'border-status-done/50 bg-status-done/15 text-status-done',
  warning: 'border-status-blocked/50 bg-status-blocked/15 text-status-blocked'
}

export function StatusBadge({ label, tone = 'neutral', className }: StatusBadgeProps) {
  return (
    <Badge
      variant={toneVariant[tone]}
      className={[toneClassName[tone], className].filter(Boolean).join(' ')}
    >
      {label}
    </Badge>
  )
}
