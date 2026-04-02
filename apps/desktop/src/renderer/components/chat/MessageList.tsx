import type { ChatMessageView, ToolCallView } from '@/atoms/chat'
import { StreamingMessage } from './StreamingMessage'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolCallCard } from './ToolCallCard'

interface MessageListProps {
  messages: ChatMessageView[]
  tools: ToolCallView[]
}

export function MessageList({ messages, tools }: MessageListProps) {
  // Index tool calls by parentMessageId so we can render them inline after their
  // triggering assistant message. Tools without a parentMessageId (older format or
  // edge cases) fall into the 'unparented' bucket rendered after all messages.
  const toolsByParent = new Map<string, ToolCallView[]>()
  const unparentedTools: ToolCallView[] = []

  for (const tool of tools) {
    if (tool.parentMessageId) {
      const existing = toolsByParent.get(tool.parentMessageId) ?? []
      existing.push(tool)
      toolsByParent.set(tool.parentMessageId, existing)
    } else {
      unparentedTools.push(tool)
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      {messages.map((message) => {
        const ownedTools = toolsByParent.get(message.id) ?? []

        // Filter ghost entries: assistant messages with no visible content and no tool calls
        const isGhost =
          message.role === 'assistant' &&
          message.content.length === 0 &&
          !message.streaming &&
          message.thinking === undefined &&
          !message.isThinking &&
          ownedTools.length === 0
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
                {/* Skip the text bubble for pure-tool messages with no text content */}
                {(message.content.length > 0 || message.streaming || message.thinking !== undefined || message.isThinking) && (
                  <StreamingMessage content={message.content} isStreaming={message.streaming} />
                )}
                {/* Tool cards owned by this message, rendered inline after any text */}
                {ownedTools.length > 0 && (
                  <div className="flex flex-col gap-2 pt-1">
                    {ownedTools.map((tool) => (
                      <ToolCallCard key={tool.id} tool={tool} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">{message.content}</div>
            )}
          </article>
        )
      })}

      {/* Fallback section for tool calls without a parent message (pre-parentMessageId data) */}
      {unparentedTools.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tool calls</p>
          {unparentedTools.map((tool) => (
            <ToolCallCard key={tool.id} tool={tool} />
          ))}
        </section>
      )}
    </div>
  )
}
