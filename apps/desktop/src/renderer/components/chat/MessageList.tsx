import { useEffect, useMemo, useState } from 'react'
import type { ChatMessageView, ToolCallView } from '@/atoms/chat'
import { Button } from '@/components/ui/button'
import { StreamingMessage } from './StreamingMessage'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolCallCard } from './ToolCallCard'

interface MessageListProps {
  messages: ChatMessageView[]
  tools: ToolCallView[]
}

const MAX_RENDERED_MESSAGES = 80

export function MessageList({ messages, tools }: MessageListProps) {
  const [showAllMessages, setShowAllMessages] = useState(false)

  const oldestMessageId = messages[0]?.id ?? null

  useEffect(() => {
    setShowAllMessages(false)
  }, [oldestMessageId])

  const hiddenMessageCount = Math.max(0, messages.length - MAX_RENDERED_MESSAGES)
  const visibleMessages =
    showAllMessages || hiddenMessageCount === 0
      ? messages
      : messages.slice(-MAX_RENDERED_MESSAGES)

  // Index tool calls by parentMessageId so we can render them inline after their
  // triggering assistant message.
  const toolsByParent = useMemo(() => {
    const map = new Map<string, ToolCallView[]>()

    for (const tool of tools) {
      if (tool.parentMessageId) {
        const existing = map.get(tool.parentMessageId) ?? []
        existing.push(tool)
        map.set(tool.parentMessageId, existing)
      }
    }

    return map
  }, [tools])

  return (
    <div className="flex flex-col gap-6 px-5 py-6">
      {hiddenMessageCount > 0 && !showAllMessages ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAllMessages(true)}
          >
            Show {hiddenMessageCount} older message{hiddenMessageCount === 1 ? '' : 's'}
          </Button>
        </div>
      ) : null}

      {visibleMessages.map((message) => {
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
