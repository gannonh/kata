import { cn } from '../../lib/cn'

export type StatusBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

type StatusBadgeProps = {
  label: string
  tone?: StatusBadgeTone
  className?: string
}

const toneClasses: Record<StatusBadgeTone, string> = {
  neutral: 'border-[color:var(--line)] bg-[color:var(--surface-elevated)] text-[color:var(--text-secondary)]',
  info: 'border-sky-400/40 bg-sky-500/15 text-sky-100',
  success: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100',
  warning: 'border-amber-400/40 bg-amber-500/15 text-amber-100',
  danger: 'border-rose-400/40 bg-rose-500/15 text-rose-100'
}

export function StatusBadge({ label, tone = 'neutral', className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 font-body text-xs uppercase tracking-wide',
        toneClasses[tone],
        className
      )}
    >
      {label}
    </span>
  )
}
