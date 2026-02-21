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
    const scrollTarget = viewport ?? list
    scrollTarget.scrollTop = scrollTarget.scrollHeight
  }, [children])

  return (
    <ScrollArea
      ref={listRef}
      data-testid="message-list"
      className="min-h-0 flex-1 px-4 py-4"
    >
      <div className="space-y-6">{children}</div>
    </ScrollArea>
  )
}
