import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { ToolCallView } from '@/atoms/chat'
import { BashOutputCard } from './BashOutputCard'
import { FileEditCard } from './FileEditCard'
import { FileReadCard } from './FileReadCard'
import { WriteCard } from './WriteCard'

interface ToolCallCardProps {
  tool: ToolCallView
}

function formatJson(value: unknown): string {
  try {
    const serialized = JSON.stringify(value, null, 2)
    return serialized ?? String(value)
  } catch {
    return String(value)
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

function GenericToolCallCard({ tool }: ToolCallCardProps) {
  const resultClass = cn(
    'max-h-48 overflow-auto rounded-md border p-2 text-xs',
    tool.status === 'error'
      ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
      : 'border-border bg-background text-foreground',
  )

  return (
    <Collapsible>
      <Card className="gap-0 py-0">
        <CardHeader className="px-0 py-0">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-between rounded-none px-3 py-2 hover:bg-accent"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-xs font-medium text-foreground">{tool.name}</span>
                <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                  generic
                </Badge>
              </div>
              <Badge variant="outline" className={getStatusBadgeClass(tool.status)}>
                {tool.status}
              </Badge>
            </Button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="flex flex-col gap-2 border-t border-border px-3 py-2">
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Args</p>
              <pre className="max-h-40 overflow-auto rounded-md border border-border bg-background p-2 text-xs text-foreground">
                {formatJson(tool.args)}
              </pre>
            </div>

            {(tool.result !== undefined || tool.error) && (
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Result</p>
                <pre className={resultClass}>{tool.error ?? formatJson(tool.result)}</pre>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

export function ToolCallCard({ tool }: ToolCallCardProps) {
  switch (tool.name) {
    case 'edit':
      return <FileEditCard tool={tool} />
    case 'bash':
      return <BashOutputCard tool={tool} />
    case 'read':
      return <FileReadCard tool={tool} />
    case 'write':
      return <WriteCard tool={tool} />
    default:
      return <GenericToolCallCard tool={tool} />
  }
}
