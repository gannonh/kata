import { Markdown } from '@kata-ui/components/markdown/Markdown'

interface StreamingMessageProps {
  content: string
  isStreaming: boolean
}

export function StreamingMessage({ content, isStreaming }: StreamingMessageProps) {
  return (
    <div className="prose prose-sm prose-invert max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-a:text-foreground prose-code:text-foreground">
      <Markdown mode="minimal">{content || (isStreaming ? '…' : '')}</Markdown>
      {isStreaming && (
        <span className="ml-1 inline-block h-3 w-1 animate-pulse rounded bg-muted-foreground align-middle" />
      )}
    </div>
  )
}
