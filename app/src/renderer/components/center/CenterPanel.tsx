import { type ReactNode } from 'react'

type CenterPanelProps = {
  children: ReactNode
}

export function CenterPanel({ children }: CenterPanelProps) {
  return (
    <section
      data-testid="center-panel"
      className="relative flex h-full min-h-0 flex-col overflow-hidden p-6"
    >
      <div className="pointer-events-none absolute inset-0 opacity-70 [background:linear-gradient(120deg,transparent_0%,rgba(214,252,194,0.07)_34%,transparent_70%)]" />
      <p className="relative font-display text-xs uppercase tracking-[0.32em] text-[color:var(--text-muted)]">
        Center Column
      </p>
      <h1 className="relative mt-4 font-display text-5xl uppercase tracking-[0.08em]">
        Orchestrator Chat
      </h1>
      <div className="relative mt-6 min-h-0 flex-1">{children}</div>
    </section>
  )
}
