import { Markdown } from '@kata-ui/components/markdown/Markdown'

interface StreamingMessageProps {
  content: string
  isStreaming: boolean
}

export function StreamingMessage({ content, isStreaming }: StreamingMessageProps) {
  return (
    <div className="rounded-lg bg-slate-800/70 px-3 py-2 text-sm text-slate-100">
      <Markdown mode="minimal">{content || (isStreaming ? '…' : '')}</Markdown>
      {isStreaming && <span className="ml-1 inline-block h-3 w-1 animate-pulse rounded bg-slate-300 align-middle" />}
    </div>
  )
}
