import { type ReactNode, useState } from 'react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import { Separator } from '../ui/separator'
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

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn('rounded-lg border bg-card', className)}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <CollapsibleTrigger className="flex flex-1 items-center justify-between gap-3 text-left text-sm font-medium">
          <span>{title}</span>
          <span
            aria-hidden="true"
            className={cn(
              'text-xs text-muted-foreground transition-transform',
              isOpen ? 'rotate-180' : 'rotate-0'
            )}
          >
            ▾
          </span>
        </CollapsibleTrigger>
        {rightSlot ? <div>{rightSlot}</div> : null}
      </div>
      <CollapsibleContent>
        <Separator />
        <div className="px-4 py-3">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
