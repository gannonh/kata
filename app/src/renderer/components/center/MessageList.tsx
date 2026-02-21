import { type ReactNode, useEffect, useRef } from 'react'

import { ScrollArea } from '../ui/scroll-area'

type MessageListProps = {
  children: ReactNode
}

export function MessageList({ children }: MessageListProps) {
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const list = listRef.current
    if (!list) {
      return
    }

    const viewport = list.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null
    const nextScrollTop = (viewport ?? list).scrollHeight

    if (viewport) {
      viewport.scrollTop = nextScrollTop
    }

    list.scrollTop = nextScrollTop
  }, [children])

  return (
    <ScrollArea
      ref={listRef}
      data-testid="message-list"
      className="min-h-0 flex-1 rounded-lg border bg-card p-4"
    >
      <div className="space-y-4">{children}</div>
    </ScrollArea>
  )
}
