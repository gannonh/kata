import type { ReactNode } from 'react'

interface RightPaneHeaderProps {
  eyebrow: string
  title: ReactNode
  actions?: ReactNode
  'data-testid'?: string
}

export function RightPaneHeader({ eyebrow, title, actions, 'data-testid': testId }: RightPaneHeaderProps) {
  return (
    <div className="flex h-14 items-center justify-between px-4" data-testid={testId}>
      <div className="min-w-0">
        <h2 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">{eyebrow}</h2>
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
      </div>

      {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
    </div>
  )
}
