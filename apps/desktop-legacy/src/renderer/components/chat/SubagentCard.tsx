import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { ToolCallView } from '@/atoms/chat'
import type { SubagentArgs, SubagentResult, SubagentResultItem } from '@shared/types'
import { asRecord, asString } from './toolCardUtils'

interface SubagentCardProps {
  tool: ToolCallView
}

// ── View model ────────────────────────────────────────────────────────────────

export interface SubagentViewModel {
  agentName: string
  task: string
  mode: 'single' | 'parallel' | 'chain'
  status: ToolCallView['status']
  results: SubagentResultItemView[]
}

export interface SubagentResultItemView {
  agent: string
  task: string
  taskExcerpt: string
  exitCode: number
  errorMessage?: string
  model?: string
  step?: number
  status: 'running' | 'done' | 'error'
}

/** Truncate task text to maxLen characters, adding ellipsis if needed */
export function truncateTask(task: string, maxLen = 60): string {
  if (task.length <= maxLen) return task
  return `${task.slice(0, maxLen)}…`
}

/** Determine the display mode from args/result */
function deriveMode(args: SubagentArgs | null, result: SubagentResult | null): 'single' | 'parallel' | 'chain' {
  const resultMode = result?.mode
  if (resultMode === 'parallel' || resultMode === 'chain' || resultMode === 'single') {
    return resultMode
  }
  return args?.mode ?? 'single'
}

/** Determine the agent name to show in the header */
function deriveAgentName(args: SubagentArgs | null, results: SubagentResultItem[]): string {
  if (args?.agent) return args.agent
  const first = results[0]
  if (results.length === 1 && first) return first.agent
  return 'subagent'
}

/** Determine the task text to show */
function deriveTask(args: SubagentArgs | null, results: SubagentResultItem[]): string {
  if (args?.task) return args.task
  const first = results[0]
  if (results.length === 1 && first?.task) return first.task
  return ''
}

/** Map a result item to a view-model item with status derived from exitCode */
function mapResultItem(item: SubagentResultItem, toolStatus: ToolCallView['status']): SubagentResultItemView {
  // If the tool is still running and this result has no exit code info yet, it's running
  // exitCode -1 means "not yet available" (set by adapter when absent)
  const status: 'running' | 'done' | 'error' =
    item.exitCode === -1 && toolStatus === 'running'
      ? 'running'
      : item.exitCode === -1
        ? 'done'
        : item.exitCode !== 0
          ? 'error'
          : 'done'

  return {
    agent: item.agent,
    task: item.task,
    taskExcerpt: truncateTask(item.task),
    exitCode: item.exitCode,
    errorMessage: item.errorMessage,
    model: item.model,
    step: item.step,
    status,
  }
}

/** Check if an object looks like SubagentArgs (has mode field with known value) */
function isSubagentArgs(args: unknown): args is SubagentArgs {
  const rec = asRecord(args)
  if (!rec) return false
  const mode = asString(rec.mode)
  return mode === 'single' || mode === 'parallel' || mode === 'chain'
}

/** Check if an object looks like SubagentResult (has mode + results array) */
function isSubagentResult(result: unknown): result is SubagentResult {
  const rec = asRecord(result)
  if (!rec) return false
  return typeof rec.mode === 'string' && Array.isArray(rec.results)
}

export function buildSubagentViewModel(tool: ToolCallView): SubagentViewModel {
  const args = isSubagentArgs(tool.args) ? tool.args : null
  const result = isSubagentResult(tool.result) ? tool.result : null

  const resultItems: SubagentResultItem[] = result?.results ?? []
  const mode = deriveMode(args, result)
  const agentName = deriveAgentName(args, resultItems)
  const task = deriveTask(args, resultItems)

  const results = resultItems.map((item) => mapResultItem(item, tool.status))

  return {
    agentName,
    task,
    mode,
    status: tool.status,
    results,
  }
}

// ── Style helpers ─────────────────────────────────────────────────────────────

export function getStatusBadgeClass(status: ToolCallView['status']): string {
  return cn(
    'border uppercase tracking-wide text-[10px]',
    status === 'error' && 'border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300',
    status === 'done' && 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    status === 'running' && 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  )
}

export function getModeBadgeClass(): string {
  return 'border-border bg-muted text-muted-foreground'
}

export function formatStatusLabel(status: ToolCallView['status'], agentName: string): string {
  switch (status) {
    case 'running':
      return `Running ${agentName}…`
    case 'done':
      return 'Done'
    case 'error':
      return 'Error'
  }
}

export function formatResultStatusIcon(status: SubagentResultItemView['status']): string {
  switch (status) {
    case 'running':
      return '⏳'
    case 'done':
      return '✓'
    case 'error':
      return '✗'
  }
}

export function formatResultStatusLabel(item: SubagentResultItemView): string {
  if (item.status === 'error' && item.errorMessage) {
    return `exit ${item.exitCode}: ${item.errorMessage}`
  }
  if (item.status === 'error') {
    return `exit ${item.exitCode}`
  }
  if (item.status === 'running') {
    return 'running…'
  }
  return 'done'
}

// ── React component ───────────────────────────────────────────────────────────

export function SubagentCard({ tool }: SubagentCardProps) {
  const [isOpen, setIsOpen] = useState(tool.status !== 'done')
  // Auto-collapse when the tool finishes
  useEffect(() => {
    if (tool.status === 'done') setIsOpen(false)
  }, [tool.status])
  const view = useMemo(() => buildSubagentViewModel(tool), [tool])

  const showResultList = (view.mode === 'parallel' || view.mode === 'chain') && view.results.length > 0

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
              <div className="flex min-w-0 items-center gap-2">
                {/* Agent name badge */}
                <Badge variant="outline" className="border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300 text-[10px]">
                  {view.agentName}
                </Badge>

                {/* Mode badge (only for non-single) */}
                {view.mode !== 'single' && (
                  <Badge variant="outline" className={getModeBadgeClass()}>
                    {view.mode}
                  </Badge>
                )}

                {/* Running spinner */}
                {view.status === 'running' && (
                  <Spinner className="size-3" aria-label="Running" />
                )}
              </div>

              <Badge variant="outline" className={getStatusBadgeClass(view.status)}>
                {view.status}
              </Badge>
            </Button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="flex flex-col gap-2 border-t border-border px-3 py-2">
            {/* Task summary */}
            {view.task && (
              <p className="text-xs text-foreground leading-relaxed">{view.task}</p>
            )}

            {/* Per-result list for parallel/chain */}
            {showResultList && (
              <div className="flex flex-col gap-1">
                {view.results.map((item, index) => (
                  <div
                    key={`${item.agent}-${index}`}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-2 py-1 text-xs',
                      item.status === 'error'
                        ? 'border-red-500/30 bg-red-500/5'
                        : item.status === 'done'
                          ? 'border-emerald-500/30 bg-emerald-500/5'
                          : 'border-amber-500/30 bg-amber-500/5',
                    )}
                  >
                    {/* Step number for chain mode */}
                    {view.mode === 'chain' && (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {item.step ?? index + 1}.
                      </span>
                    )}

                    {/* Status icon */}
                    <span className={cn(
                      'text-xs font-medium',
                      item.status === 'error' && 'text-red-600 dark:text-red-400',
                      item.status === 'done' && 'text-emerald-600 dark:text-emerald-400',
                      item.status === 'running' && 'text-amber-600 dark:text-amber-400',
                    )}>
                      {item.status === 'running' ? '⏳' : item.status === 'done' ? '✓' : '✗'}
                    </span>

                    {/* Agent name */}
                    <span className="font-medium text-foreground">{item.agent}</span>

                    {/* Task excerpt */}
                    <span className="truncate text-muted-foreground">{item.taskExcerpt}</span>

                    {/* Error info */}
                    {item.status === 'error' && item.errorMessage && (
                      <span className="ml-auto text-red-600 dark:text-red-400 shrink-0">
                        exit {item.exitCode}: {truncateTask(item.errorMessage, 40)}
                      </span>
                    )}
                    {item.status === 'error' && !item.errorMessage && (
                      <span className="ml-auto text-red-600 dark:text-red-400 shrink-0">
                        exit {item.exitCode}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Single-mode error details */}
            {view.mode === 'single' && view.results.length === 1 && (() => {
              const singleResult = view.results[0]!
              return singleResult.status === 'error' ? (
                <div className="rounded-md border border-red-500/30 bg-red-500/5 px-2 py-1 text-xs text-red-700 dark:text-red-300">
                  <span className="font-medium">exit {singleResult.exitCode}</span>
                  {singleResult.errorMessage && (
                    <span>: {singleResult.errorMessage}</span>
                  )}
                </div>
              ) : null
            })()}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
