import { type ReactNode } from 'react'

type CenterPanelProps = {
  children: ReactNode
}

export function CenterPanel({ children }: CenterPanelProps) {
  return (
    <section
      data-testid="center-panel"
      className="relative flex h-full min-h-0 flex-col overflow-hidden p-4"
    >
      <p className="relative text-xs uppercase tracking-wide text-muted-foreground">
        Center Column
      </p>
      <h1 className="relative mt-2 text-2xl font-semibold tracking-tight">
        Orchestrator Chat
      </h1>
      <div className="relative mt-4 min-h-0 flex-1">{children}</div>
    </section>
  )
}
