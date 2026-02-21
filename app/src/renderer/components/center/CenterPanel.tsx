import { type ReactNode } from 'react'

type CenterPanelProps = {
  children: ReactNode
}

export function CenterPanel({ children }: CenterPanelProps) {
  return (
    <section
      data-testid="center-panel"
      className="relative flex h-full min-h-0 flex-col overflow-hidden"
    >
      <header className="flex h-14 shrink-0 items-center gap-2 bg-background px-4">
        <p className="text-sm text-muted-foreground">Center Column</p>
        <span className="text-sm text-muted-foreground">&rsaquo;</span>
        <h1 className="text-lg font-semibold tracking-tight">Orchestrator Chat</h1>
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col p-4">{children}</div>
    </section>
  )
}
