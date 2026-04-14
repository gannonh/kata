import { useMemo, useState } from 'react'
import { TerminalOutput } from '@kata/ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { ToolCallView } from '@/atoms/chat'
import { asNumber, asRecord, asString } from './toolCardUtils'

interface BashOutputCardProps {
  tool: ToolCallView
}

interface BashViewModel {
  command: string
  stdout: string
  stderr: string
  output: string
  exitCode?: number
}

function truncateCommand(command: string, maxLength = 120): string {
  if (command.length <= maxLength) {
    return command
  }

  return `${command.slice(0, maxLength - 1)}…`
}

function buildBashViewModel(tool: ToolCallView): BashViewModel {
  const args = asRecord(tool.args)
  const result = asRecord(tool.result)

  const command = asString(result?.command) ?? asString(args?.command) ?? 'bash'

  const stdout =
    asString(result?.stdout) ??
    asString(result?.output) ??
    asString(tool.partialStdout) ??
    (tool.status === 'running' ? asString(result?.content) : undefined) ??
    ''

  const stderr = asString(result?.stderr) ?? ''

  const output = [stdout, stderr].filter(Boolean).join(stdout && stderr ? '\n' : '')

  const exitCode = asNumber(result?.exitCode)

  return {
    command,
    stdout,
    stderr,
    output,
    exitCode,
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

export function BashOutputCard({ tool }: BashOutputCardProps) {
  const [isOpen, setIsOpen] = useState(tool.status !== 'done')
  const view = useMemo(() => buildBashViewModel(tool), [tool])
  const commandLabel = useMemo(() => truncateCommand(view.command), [view.command])

  const exitClass = cn(
    'border text-[10px]',
    view.exitCode === undefined || view.exitCode === 0
      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      : 'border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300',
  )

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="gap-0 py-0">
        <CardHeader className="px-0 py-0">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full min-w-0 shrink justify-start whitespace-normal rounded-none px-3 py-2 hover:bg-accent"
            >
              <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <div className="min-w-0 overflow-hidden text-left">
                  <p className="truncate text-xs font-semibold text-foreground" title={view.command}>
                    bash · {commandLabel}
                  </p>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                    {view.exitCode !== undefined && (
                      <Badge variant="outline" className={exitClass}>
                        exit {view.exitCode}
                      </Badge>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      {(view.output || '').split('\n').filter(Boolean).length} lines
                    </span>
                  </div>
                </div>

                <Badge variant="outline" className={cn(getStatusBadgeClass(tool.status), 'shrink-0')}>
                  {tool.status}
                </Badge>
              </div>
            </Button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="border-t border-border px-3 py-2">
            <div className="max-h-[24rem] overflow-auto rounded-md border border-border bg-background">
              <TerminalOutput command={view.command} output={view.output} exitCode={view.exitCode} theme="dark" toolType="bash" />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
