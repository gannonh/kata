import { MarkdownRenderer } from '../shared/MarkdownRenderer'
import { cn } from '../../lib/cn'
import { type ChatMessage } from '../../types/chat'

type MessageBubbleProps = {
  message: ChatMessage
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <article className={cn('flex flex-col gap-2', isUser ? 'items-end' : 'items-start')}>
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {isUser ? 'You' : 'Kata'}
      </span>
      <div
        className={cn(
          'max-w-[85%] rounded-lg border p-4',
          isUser
            ? 'border-primary/20 bg-primary/10 text-foreground'
            : 'bg-card text-muted-foreground'
        )}
      >
        {isUser ? (
          <p className="m-0 whitespace-pre-wrap text-sm">{message.content}</p>
        ) : (
          <MarkdownRenderer content={message.content} />
        )}
      </div>
    </article>
  )
}
