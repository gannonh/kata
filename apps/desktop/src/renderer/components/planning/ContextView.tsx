import { ChevronDown } from 'lucide-react'
import type { ParsedContext } from '@shared/types'
import { Markdown } from '@kata/ui'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export interface ContextViewProps {
  context: ParsedContext
}

export function ContextView({ context }: ContextViewProps) {
  const sectionGroups = context.sections.reduce<
    Array<{ parent: ParsedContext['sections'][number]; children: ParsedContext['sections'][number][] }>
  >((groups, section) => {
    const currentGroup = groups[groups.length - 1]

    if (section.level === 2 || !currentGroup) {
      groups.push({ parent: section, children: [] })
      return groups
    }

    currentGroup.children.push(section)
    return groups
  }, [])

  return (
    <div className="space-y-3">
      {sectionGroups.map((group, index) => (
        <Collapsible
          key={`context-section-${index}`}
          defaultOpen
          className="group/section overflow-hidden rounded-lg border border-border"
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex w-full items-center justify-between gap-2 bg-muted/30 px-3 py-2 text-left text-sm font-medium',
                group.parent.level === 3 && 'pl-5 text-muted-foreground',
              )}
            >
              <span>{group.parent.heading}</span>
              <ChevronDown className="size-4 transition-transform group-data-[state=open]/section:rotate-180" />
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent className="space-y-2 border-t border-border bg-background px-3 py-2">
            {group.parent.content ? (
              <div className="prose prose-sm max-w-none text-foreground dark:prose-invert prose-headings:text-foreground prose-headings:font-semibold prose-h1:text-xl prose-h1:mb-3 prose-h2:text-lg prose-h3:text-base prose-strong:text-foreground prose-a:text-foreground prose-code:text-foreground">
                <Markdown mode="minimal">{group.parent.content}</Markdown>
              </div>
            ) : null}

            {group.children.length > 0 ? (
              <div className="space-y-2">
                {group.children.map((child, childIndex) => (
                  <Collapsible
                    key={`context-child-${index}-${childIndex}`}
                    defaultOpen
                    className="group/child overflow-hidden rounded-md border border-border"
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 bg-muted/20 px-3 py-2 text-left text-sm font-medium text-muted-foreground"
                      >
                        <span>{child.heading}</span>
                        <ChevronDown className="size-4 transition-transform group-data-[state=open]/child:rotate-180" />
                      </button>
                    </CollapsibleTrigger>

                    <CollapsibleContent className="border-t border-border bg-background px-3 py-2">
                      {child.content ? (
                        <div className="prose prose-sm max-w-none text-foreground dark:prose-invert prose-headings:text-foreground prose-headings:font-semibold prose-h1:text-xl prose-h1:mb-3 prose-h2:text-lg prose-h3:text-base prose-strong:text-foreground prose-a:text-foreground prose-code:text-foreground">
                          <Markdown mode="minimal">{child.content}</Markdown>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No content</p>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            ) : null}

            {!group.parent.content && group.children.length === 0 ? (
              <p className="text-xs text-muted-foreground">No content</p>
            ) : null}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  )
}
