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
  success: 'default',
  warning: 'outline',
  danger: 'destructive'
}

const toneClassName: Partial<Record<StatusBadgeTone, string>> = {
  info: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  warning: 'border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-300'
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
