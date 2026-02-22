import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'

import { cn } from '../../lib/cn'
import { Button } from '../ui/button'
import { LEFT_PANEL_TYPOGRAPHY } from './left-typography'

type LeftSectionProps = {
  title: string
  description?: string
  addActionLabel: string
  onAddAction?: () => void
  titleClassName?: string
  descriptionClassName?: string
  children: ReactNode
}

/**
 * Shared scaffold for left-panel sections with heading, optional description, and add action.
 */
export function LeftSection({
  title,
  description,
  addActionLabel,
  onAddAction,
  titleClassName,
  descriptionClassName,
  children
}: LeftSectionProps) {
  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h2 className={cn(LEFT_PANEL_TYPOGRAPHY.sectionTitle, titleClassName)}>{title}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="-mr-2"
          aria-label={addActionLabel}
          onClick={onAddAction}
          disabled={!onAddAction}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {description ? (
        <p className={cn('mt-2', LEFT_PANEL_TYPOGRAPHY.sectionDescription, descriptionClassName)}>{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  )
}
