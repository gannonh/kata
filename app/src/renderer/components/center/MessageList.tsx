import { type ReactNode, useEffect, useRef } from 'react'

type MessageListProps = {
  children: ReactNode
}

export function MessageList({ children }: MessageListProps) {
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [children])

  return (
    <div
      ref={listRef}
      data-testid="message-list"
      className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-2xl border border-[color:var(--line)]/90 bg-[color:var(--surface-elevated)]/50 p-4"
    >
      {children}
    </div>
  )
}
