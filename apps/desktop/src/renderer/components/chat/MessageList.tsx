import type { ChatMessageView, ToolCallView } from '@/atoms/chat'
import { StreamingMessage } from './StreamingMessage'
import { ToolCallCard } from './ToolCallCard'

interface MessageListProps {
  messages: ChatMessageView[]
  tools: ToolCallView[]
}

export function MessageList({ messages, tools }: MessageListProps) {
  return (
    <div className="space-y-4 px-4 py-4">
      {messages.map((message) => (
        <article key={message.id} className="space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">{message.role}</p>

          {message.role === 'assistant' ? (
            <StreamingMessage content={message.content} isStreaming={message.streaming} />
          ) : (
            <div className="rounded-lg bg-slate-700/80 px-3 py-2 text-sm text-slate-100">{message.content}</div>
          )}
        </article>
      ))}

      {tools.length > 0 && (
        <section className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Tool calls</p>
          {tools.map((tool) => (
            <ToolCallCard key={tool.id} tool={tool} />
          ))}
        </section>
      )}
    </div>
  )
}
