import type { SessionListItem as SessionListItemType } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface SessionListItemProps {
  session: SessionListItemType
  isCurrent: boolean
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

function sessionModelLabel(session: SessionListItemType): string {
  if (session.model) {
    return session.model
  }

  if (session.provider) {
    return session.provider
  }

  return 'Unknown model'
}

export function SessionListItem({ session, isCurrent }: SessionListItemProps) {
  const model = sessionModelLabel(session)

  return (
    <div
      title={session.title}
      className={cn(
        'w-full rounded-md border bg-card/70 px-2 py-2 text-left',
        isCurrent ? 'border-primary/60 bg-accent/40' : 'border-border',
      )}
    >
      <div className="flex flex-col gap-1.5">
        <p
          className="text-xs font-medium text-card-foreground"
          style={{
            display: '-webkit-box',
            overflow: 'hidden',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {session.title}
        </p>

        {session.firstMessagePreview && (
          <p
            className="text-[11px] text-muted-foreground"
            style={{
              display: '-webkit-box',
              overflow: 'hidden',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {session.firstMessagePreview}
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary" className="max-w-[9rem] truncate font-normal">
            {model}
          </Badge>

          <span className="text-[10px] text-muted-foreground">{formatRelativeTime(session.modified)}</span>
        </div>

        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="truncate">{session.provider ?? 'provider: n/a'}</span>
          <Badge variant="outline" className="text-[10px] font-normal">
            {session.messageCount} msgs
          </Badge>
        </div>
      </div>
    </div>
  )
}
