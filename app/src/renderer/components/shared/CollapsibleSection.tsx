import { type ReactNode, useId, useState } from 'react'

import { cn } from '../../lib/cn'

type CollapsibleSectionProps = {
  title: string
  defaultOpen?: boolean
  rightSlot?: ReactNode
  children: ReactNode
  className?: string
}

export function CollapsibleSection({
  title,
  defaultOpen = true,
  rightSlot,
  children,
  className
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const contentId = useId()

  return (
    <section className={cn('rounded-2xl border border-[color:var(--line)]/90', className)}>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          className="flex flex-1 items-center justify-between gap-3 text-left"
          aria-controls={contentId}
          aria-expanded={isOpen}
          onClick={() => {
            setIsOpen((current) => !current)
          }}
        >
          <span className="font-display text-sm uppercase tracking-[0.16em] text-[color:var(--text-primary)]">
            {title}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'text-xs text-[color:var(--text-muted)] transition-transform',
              isOpen ? 'rotate-180' : 'rotate-0'
            )}
          >
            ▾
          </span>
        </button>
        {rightSlot ? <div>{rightSlot}</div> : null}
      </div>
      {isOpen ? (
        <div
          id={contentId}
          className="border-t border-[color:var(--line)]/80 px-4 py-3"
        >
          {children}
        </div>
      ) : null}
    </section>
  )
}
