import type { SessionListItem as SessionListItemType } from '@shared/types'

interface SessionListItemProps {
  session: SessionListItemType
  isCurrent: boolean
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

function sessionModelLabel(session: SessionListItemType): string {
  if (session.model) {
    return session.model
  }

  if (session.provider) {
    return session.provider
  }

  return 'Unknown model'
}

export function SessionListItem({ session, isCurrent, onSelect }: SessionListItemProps) {
  const model = sessionModelLabel(session)

  return (
    <button
      type="button"
      onClick={() => onSelect(session.id)}
      title={session.title}
      className={`w-full rounded-md border px-2 py-2 text-left transition ${
        isCurrent
          ? 'border-sky-500/80 bg-sky-500/15'
          : 'border-slate-800 bg-slate-900/70 hover:border-slate-700 hover:bg-slate-800/70'
      }`}
    >
      <div className="space-y-1.5">
        <p
          className="text-xs font-medium text-slate-100"
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
            className="text-[11px] text-slate-400"
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
          <span className="max-w-[9rem] truncate rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
            {model}
          </span>

          <span className="text-[10px] text-slate-400">{formatRelativeTime(session.modified)}</span>
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span>{session.provider ?? 'provider: n/a'}</span>
          <span>{session.messageCount} msgs</span>
        </div>
      </div>
    </button>
  )
}
