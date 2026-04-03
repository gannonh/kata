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
  // triggering assistant message.
  const toolsByParent = new Map<string, ToolCallView[]>()

  for (const tool of tools) {
    if (tool.parentMessageId) {
      const existing = toolsByParent.get(tool.parentMessageId) ?? []
      existing.push(tool)
      toolsByParent.set(tool.parentMessageId, existing)
    }
  }

  return (
    <div className="flex flex-col gap-6 px-5 py-6">
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

        if (message.role === 'user') {
          return (
            <article key={message.id} className="flex justify-end">
              <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-3 text-sm text-foreground">
                {message.content}
              </div>
            </article>
          )
        }

        // Assistant messages — no container, flat against background
        return (
          <article key={message.id} className="flex flex-col gap-3">
            {(message.thinking !== undefined || message.isThinking) && (
              <ThinkingBlock
                content={message.thinking ?? ''}
                isThinking={message.isThinking}
              />
            )}
            {(message.content.length > 0 || message.streaming) && (
              <StreamingMessage content={message.content} isStreaming={message.streaming} />
            )}
            {ownedTools.length > 0 && (
              <div className="flex flex-col gap-2.5 pt-2">
                {ownedTools.map((tool) => (
                  <ToolCallCard key={tool.id} tool={tool} />
                ))}
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}
