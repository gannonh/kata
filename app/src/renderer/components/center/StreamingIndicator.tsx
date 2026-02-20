export function StreamingIndicator() {
  return (
    <div
      data-testid="streaming-indicator"
      className="animate-pulse rounded-xl border border-[color:var(--line-strong)]/70 bg-[color:var(--line-strong)]/10 px-4 py-2 font-body text-sm text-[color:var(--text-secondary)]"
    >
      Kata is streaming a response...
    </div>
  )
}
