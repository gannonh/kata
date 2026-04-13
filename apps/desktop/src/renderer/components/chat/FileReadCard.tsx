import { useMemo, useState } from 'react'
import { ShikiCodeViewer, getLanguageFromPath, truncateFilePath } from '@kata/ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { ToolCallView } from '@/atoms/chat'
import { asBoolean, asNumber, asRecord, asString } from './toolCardUtils'

interface FileReadCardProps {
  tool: ToolCallView
}

interface ReadViewModel {
  filePath: string
  content: string
  language: string
  totalLines: number
  truncated: boolean
}

function buildReadViewModel(tool: ToolCallView): ReadViewModel {
  const args = asRecord(tool.args)
  const result = asRecord(tool.result)

  // Use || not ?? so empty string ('') falls through to args.path
  // The root fix is in the adapter (tool args cache), but this guards against any future regression
  const filePath = (asString(result?.path) || asString(args?.path)) ?? 'unknown-file'
  const content = asString(result?.content) ?? asString(result?.text) ?? ''
  const lineCount = asNumber(result?.totalLines) ?? content.split('\n').length
  const language = asString(result?.language) ?? getLanguageFromPath(filePath)
  const truncated = asBoolean(result?.truncated) ?? false

  return {
    filePath,
    content,
    language,
    totalLines: lineCount,
    truncated,
  }
}

function getStatusBadgeClass(status: ToolCallView['status']): string {
  return cn(
    'border uppercase tracking-wide text-[10px]',
    status === 'error' && 'border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300',
    status === 'done' && 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    status === 'running' && 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  )
}

export function FileReadCard({ tool }: FileReadCardProps) {
  const view = useMemo(() => buildReadViewModel(tool), [tool])
  const isLongFile = view.totalLines > 80
  const [isOpen, setIsOpen] = useState(!isLongFile || tool.status !== 'done')

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
                <p className="truncate text-xs font-semibold text-foreground">read · {truncateFilePath(view.filePath, 68)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {view.language} · {view.totalLines} lines{view.truncated ? ' · truncated' : ''}
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
            {view.truncated && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">
                File output was truncated by the tool.
              </p>
            )}

            <div className="h-[22rem] overflow-hidden rounded-md border border-border bg-background">
              <ShikiCodeViewer
                code={view.content}
                language={view.language}
                filePath={view.filePath}
                theme="dark"
              />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
