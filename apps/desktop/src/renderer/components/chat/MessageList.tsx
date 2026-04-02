import type { ChatMessageView, ToolCallView } from '@/atoms/chat'
import { StreamingMessage } from './StreamingMessage'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolCallCard } from './ToolCallCard'

interface MessageListProps {
  messages: ChatMessageView[]
  tools: ToolCallView[]
}

export function MessageList({ messages, tools }: MessageListProps) {
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      {messages.map((message) => {
        // Filter ghost entries: assistant messages with no visible content
        const isGhost =
          message.role === 'assistant' &&
          message.content.length === 0 &&
          !message.streaming &&
          message.thinking === undefined &&
          !message.isThinking
        if (isGhost) return null

        return (
        <article key={message.id} className="flex flex-col gap-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{message.role}</p>

          {message.role === 'assistant' ? (
            <>
              {(message.thinking !== undefined || message.isThinking) && (
                <ThinkingBlock
                  content={message.thinking ?? ''}
                  isThinking={message.isThinking}
                />
              )}
              {/* Skip the text bubble entirely for ghost entries: no content, not streaming, no thinking */}
              {(message.content.length > 0 || message.streaming || message.thinking !== undefined || message.isThinking) && (
                <StreamingMessage content={message.content} isStreaming={message.streaming} />
              )}
            </>
          ) : (
            <div className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">{message.content}</div>
          )}
        </article>
        )
      })}

      {tools.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tool calls</p>
          {tools.map((tool) => (
            <ToolCallCard key={tool.id} tool={tool} />
          ))}
        </section>
      )}
    </div>
  )
}
