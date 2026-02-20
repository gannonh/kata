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
      <span className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {isUser ? 'You' : 'Kata'}
      </span>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl border p-4',
          isUser
            ? 'border-[color:var(--line-strong)] bg-[color:var(--line-strong)]/15 text-[color:var(--text-primary)]'
            : 'border-[color:var(--line)] bg-[color:var(--surface-panel)]/80 text-[color:var(--text-secondary)]'
        )}
      >
        {isUser ? (
          <p className="m-0 whitespace-pre-wrap font-body text-sm">{message.content}</p>
        ) : (
          <MarkdownRenderer content={message.content} />
        )}
      </div>
    </article>
  )
}
