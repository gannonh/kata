import type { SessionListItem as SessionListItemType } from '@shared/types'
import { cn } from '@/lib/utils'

interface SessionListItemProps {
  session: SessionListItemType
  isCurrent: boolean
  disabled?: boolean
  onSelect: (sessionId: string) => void
}

function formatRelativeTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }

  const now = Date.now()
  const deltaMs = date.getTime() - now
  const absDeltaMs = Math.abs(deltaMs)

  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

  if (absDeltaMs < hour) {
    return rtf.format(Math.round(deltaMs / minute), 'minute')
  }

  if (absDeltaMs < day) {
    return rtf.format(Math.round(deltaMs / hour), 'hour')
  }

  if (absDeltaMs < 7 * day) {
    return rtf.format(Math.round(deltaMs / day), 'day')
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

/**
 * Extract a short model display name from the full model string.
 * "anthropic/claude-sonnet-4-6" → "claude-sonnet-4-6"
 * "openai-codex/gpt-5.4" → "gpt-5.4"
 */
function shortModelName(session: SessionListItemType): string {
  const model = session.model ?? session.provider ?? null
  if (!model) {
    return ''
  }

  const slashIndex = model.indexOf('/')
  return slashIndex >= 0 ? model.slice(slashIndex + 1) : model
}

export function SessionListItem({
  session,
  isCurrent,
  disabled = false,
  onSelect,
}: SessionListItemProps) {
  const model = shortModelName(session)

  return (
    <button
      type="button"
      title={session.title}
      disabled={disabled}
      onClick={() => onSelect(session.id)}
      className={cn(
        'w-full min-w-0 overflow-hidden rounded-lg px-2.5 py-2 text-left transition-colors',
        isCurrent
          ? 'bg-accent/50'
          : 'hover:bg-accent/20',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <p
        className="text-xs font-medium leading-snug text-card-foreground"
        style={{
          display: '-webkit-box',
          overflow: 'hidden',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {session.title}
      </p>

      <p className="mt-1 truncate text-[10px] text-muted-foreground">
        {[model, formatRelativeTime(session.modified), `${session.messageCount} msgs`]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </button>
  )
}
