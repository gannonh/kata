import { ChevronDown } from 'lucide-react'
import type { ParsedContext } from '@shared/types'
import { Markdown } from '@kata-ui/components/markdown/Markdown'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export interface ContextViewProps {
  context: ParsedContext
}

export function ContextView({ context }: ContextViewProps) {
  return (
    <div className="space-y-3">
      {context.sections.map((section) => (
        <Collapsible
          key={`${section.level}-${section.heading}`}
          defaultOpen
          className="group/section overflow-hidden rounded-lg border border-border"
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex w-full items-center justify-between gap-2 bg-muted/30 px-3 py-2 text-left text-sm font-medium',
                section.level === 3 && 'pl-5 text-muted-foreground',
              )}
            >
              <span>{section.heading}</span>
              <ChevronDown className="size-4 transition-transform group-data-[state=open]/section:rotate-180" />
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent className="border-t border-border bg-background px-3 py-2">
            {section.content ? (
              <Markdown mode="full" className="text-sm leading-relaxed">
                {section.content}
              </Markdown>
            ) : (
              <p className="text-xs text-muted-foreground">No content</p>
            )}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  )
}
