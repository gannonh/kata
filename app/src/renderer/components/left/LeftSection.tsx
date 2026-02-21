import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'

import { Button } from '../ui/button'

type LeftSectionProps = {
  title: string
  description: string
  addActionLabel: string
  children: ReactNode
}

export function LeftSection({ title, description, addActionLabel, children }: LeftSectionProps) {
  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={addActionLabel}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <p className="mt-2 max-w-[32ch] truncate text-sm text-muted-foreground">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}
