export function StreamingIndicator() {
  return (
    <div
      data-testid="streaming-indicator"
      className="animate-pulse rounded-md border border-border bg-muted px-4 py-2 text-sm text-muted-foreground"
    >
      Kata is streaming a response...
    </div>
  )
}
