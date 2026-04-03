import { useMemo, useState } from 'react'
import { ShikiCodeViewer } from '@kata-ui/components/code-viewer/ShikiCodeViewer'
import { getLanguageFromPath, truncateFilePath } from '@kata-ui/components/code-viewer/language-map'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { ToolCallView } from '@/atoms/chat'
import { asNumber, asRecord, asString } from './toolCardUtils'

interface WriteCardProps {
  tool: ToolCallView
}

interface WriteViewModel {
  filePath: string
  content: string
  bytesWritten?: number
}

function buildWriteViewModel(tool: ToolCallView): WriteViewModel {
  const args = asRecord(tool.args)
  const result = asRecord(tool.result)

  return {
    filePath: asString(result?.path) ?? asString(args?.path) ?? 'unknown-file',
    content: asString(result?.content) ?? asString(args?.content) ?? '',
    bytesWritten: asNumber(result?.bytesWritten),
  }
}

function toPreview(content: string, lines = 20): string {
  const split = content.split('\n')
  if (split.length <= lines) {
    return content
  }

  return `${split.slice(0, lines).join('\n')}\n… (${split.length - lines} more lines)`
}

function getStatusBadgeClass(status: ToolCallView['status']): string {
  return cn(
    'border uppercase tracking-wide text-[10px]',
    status === 'error' && 'border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300',
    status === 'done' && 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    status === 'running' && 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  )
}

export function WriteCard({ tool }: WriteCardProps) {
  const view = useMemo(() => buildWriteViewModel(tool), [tool])
  const [isOpen, setIsOpen] = useState(tool.status !== 'done')
  const [showFullContent, setShowFullContent] = useState(false)

  const isLarge = view.content.split('\n').length > 20
  const language = getLanguageFromPath(view.filePath)
  const contentToShow = showFullContent ? view.content : toPreview(view.content, 20)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="gap-0 py-0">
        <CardHeader className="px-0 py-0">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-between rounded-none px-3 py-2 hover:bg-accent"
            >
              <div className="min-w-0 text-left">
                <p className="truncate text-xs font-semibold text-foreground">write · {truncateFilePath(view.filePath, 68)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {tool.status === 'done' ? 'created/overwritten' : 'pending write'}
                  {view.bytesWritten !== undefined ? ` · ${view.bytesWritten} bytes` : ''}
                </p>
              </div>
              <Badge variant="outline" className={getStatusBadgeClass(tool.status)}>
                {tool.status}
              </Badge>
            </Button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="flex flex-col gap-2 border-t border-border px-3 py-2">
            <div className="h-[18rem] overflow-hidden rounded-md border border-border bg-background">
              <ShikiCodeViewer
                code={contentToShow}
                language={language}
                filePath={view.filePath}
                theme="dark"
              />
            </div>

            {isLarge && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto w-fit px-0 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowFullContent((value) => !value)}
              >
                {showFullContent ? 'Show preview' : 'Show full content'}
              </Button>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
