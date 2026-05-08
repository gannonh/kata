import { useMemo, useState } from 'react'
import { ShikiDiffViewer, getLanguageFromPath, truncateFilePath } from '@kata/ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { ToolCallView } from '@/atoms/chat'
import { asNumber, asRecord, asString, countTextLines } from './toolCardUtils'

interface FileEditCardProps {
  tool: ToolCallView
}

interface DiffViewModel {
  filePath: string
  original: string
  modified: string
  additions: number
  deletions: number
  parseError?: string
}

function parseUnifiedDiff(diffText: string): Omit<DiffViewModel, 'filePath'> | null {
  const rawLines = diffText
    .replace(/^```diff\n?/i, '')
    .replace(/```\s*$/i, '')
    .split('\n')

  const original: string[] = []
  const modified: string[] = []
  let additions = 0
  let deletions = 0
  let inHunk = false

  for (const line of rawLines) {
    if (
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ')
    ) {
      continue
    }

    if (line.startsWith('@@')) {
      inHunk = true
      continue
    }

    if (!inHunk) {
      continue
    }

    if (line.startsWith('\\ No newline at end of file')) {
      continue
    }

    if (line.startsWith('+')) {
      modified.push(line.slice(1))
      additions += 1
      continue
    }

    if (line.startsWith('-')) {
      original.push(line.slice(1))
      deletions += 1
      continue
    }

    if (line.startsWith(' ')) {
      const content = line.slice(1)
      original.push(content)
      modified.push(content)
      continue
    }

    // Graceful fallback for malformed hunks.
    original.push(line)
    modified.push(line)
  }

  if (!inHunk) {
    return null
  }

  return {
    original: original.join('\n'),
    modified: modified.join('\n'),
    additions,
    deletions,
  }
}

function buildFromEditsArray(edits: unknown): Omit<DiffViewModel, 'filePath'> | null {
  if (!Array.isArray(edits) || edits.length === 0) {
    return null
  }

  const originalChunks: string[] = []
  const modifiedChunks: string[] = []
  let additions = 0
  let deletions = 0

  edits.forEach((editEntry, index) => {
    const editRecord = asRecord(editEntry)
    if (!editRecord) {
      return
    }

    const oldText = asString(editRecord.oldText) ?? ''
    const newText = asString(editRecord.newText) ?? ''

    const separator = `\n// --- edit ${index + 1} ---\n`
    if (originalChunks.length > 0) {
      originalChunks.push(separator)
      modifiedChunks.push(separator)
    }

    originalChunks.push(oldText)
    modifiedChunks.push(newText)

    additions += countTextLines(newText)
    deletions += countTextLines(oldText)
  })

  return {
    original: originalChunks.join(''),
    modified: modifiedChunks.join(''),
    additions,
    deletions,
  }
}

function createDiffViewModel(tool: ToolCallView): DiffViewModel {
  const args = asRecord(tool.args)
  const result = asRecord(tool.result)

  const filePath =
    asString(result?.path) ??
    asString(args?.path) ??
    asString(result?.filePath) ??
    asString(args?.filePath) ??
    'unknown-file'

  const diff = asString(result?.diff)
  const explicitOriginal = asString(result?.original)
  const explicitModified = asString(result?.modified)

  if (explicitOriginal !== undefined && explicitModified !== undefined) {
    return {
      filePath,
      original: explicitOriginal,
      modified: explicitModified,
      additions: asNumber(result?.linesAdded) ?? countTextLines(explicitModified),
      deletions: asNumber(result?.linesRemoved) ?? countTextLines(explicitOriginal),
    }
  }

  if (diff) {
    const parsed = parseUnifiedDiff(diff)
    if (parsed) {
      return {
        filePath,
        original: parsed.original,
        modified: parsed.modified,
        additions: asNumber(result?.linesAdded) ?? parsed.additions,
        deletions: asNumber(result?.linesRemoved) ?? parsed.deletions,
      }
    }
  }

  const fromEdits = buildFromEditsArray(args?.edits)
  if (fromEdits) {
    return {
      filePath,
      original: fromEdits.original,
      modified: fromEdits.modified,
      additions: fromEdits.additions,
      deletions: fromEdits.deletions,
      parseError: diff ? 'Unable to parse unified diff; showing reconstructed edit preview.' : undefined,
    }
  }

  return {
    filePath,
    original: '',
    modified: '',
    additions: 0,
    deletions: 0,
    parseError: 'Diff payload missing or malformed. Falling back to raw tool payload.',
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

export function FileEditCard({ tool }: FileEditCardProps) {
  const diffModel = useMemo(() => createDiffViewModel(tool), [tool])
  const [isOpen, setIsOpen] = useState(tool.status !== 'done')

  const fileLabel = truncateFilePath(diffModel.filePath, 68)
  const language = getLanguageFromPath(diffModel.filePath)

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
                <p className="truncate text-xs font-semibold text-foreground">edit · {fileLabel}</p>
                <p className="text-[11px] text-muted-foreground">
                  +{diffModel.additions} / -{diffModel.deletions} · {language}
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
            {diffModel.parseError && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">
                rendering failed: {diffModel.parseError}
              </p>
            )}

            {diffModel.original || diffModel.modified ? (
              <div className="h-[20rem] overflow-hidden rounded-md border border-border bg-background">
                <ShikiDiffViewer
                  filePath={diffModel.filePath}
                  language={language}
                  original={diffModel.original}
                  modified={diffModel.modified}
                  diffStyle="unified"
                  theme="dark"
                  disableFileHeader={false}
                />
              </div>
            ) : (
              <pre className="max-h-60 overflow-auto rounded-md border border-border bg-background p-2 text-xs text-foreground">
                {JSON.stringify({ args: tool.args, result: tool.result, error: tool.error }, null, 2)}
              </pre>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
