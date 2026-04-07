import { Markdown } from '@kata-ui/components/markdown/Markdown'
import { Spinner } from '@/components/ui/spinner'

interface StreamingMessageProps {
  content: string
  isStreaming: boolean
}

export function StreamingMessage({ content, isStreaming }: StreamingMessageProps) {
  if (isStreaming && !content) {
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
        <Spinner className="size-3.5" />
        <span>Working…</span>
      </div>
    )
  }

  return (
    <div className="prose prose-sm prose-invert max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-a:text-foreground prose-code:text-foreground">
      <Markdown mode="minimal">{content}</Markdown>
      {isStreaming && (
        <span className="ml-1 inline-block h-3 w-1 animate-pulse rounded bg-muted-foreground align-middle" />
      )}
    </div>
  )
}
