import { useEffect, useState } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, Brain } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ThinkingBlockProps {
  content: string
  isThinking: boolean
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function ThinkingBlock({ content, isThinking }: ThinkingBlockProps) {
  const [isOpen, setIsOpen] = useState(isThinking)

  // Auto-collapse when thinking stream completes
  useEffect(() => {
    if (!isThinking) {
      setIsOpen(false)
    }
  }, [isThinking])

  const label = isThinking
    ? 'Thinking…'
    : `Thought for ${wordCount(content)} words`

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'flex h-auto items-center gap-1.5 rounded-md px-2 py-1 text-xs font-normal',
            'text-amber-700 dark:text-amber-400',
            'hover:bg-amber-500/10',
          )}
        >
          <Brain className="h-3 w-3 shrink-0" />
          <span>{label}</span>
          {isOpen
            ? <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
            : <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
          }
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div
          className={cn(
            'mt-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2',
            'text-xs italic leading-relaxed text-amber-800/80 dark:text-amber-300/70',
            'max-h-48 overflow-y-auto whitespace-pre-wrap font-mono',
          )}
        >
          {content || (isThinking ? '…' : '')}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
