import { useMemo, useState } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ShikiDiffViewer } from '@kata-ui/components/code-viewer/ShikiDiffViewer'
import { getLanguageFromPath, truncateFilePath } from '@kata-ui/components/code-viewer/language-map'
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

export function FileEditCard({ tool }: FileEditCardProps) {
  const diffModel = useMemo(() => createDiffViewModel(tool), [tool])
  const [isOpen, setIsOpen] = useState(tool.status !== 'done')

  const statusClass =
    tool.status === 'error'
      ? 'border-red-500/40 bg-red-500/20 text-red-100'
      : tool.status === 'done'
        ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-100'
        : 'border-amber-500/40 bg-amber-500/20 text-amber-100'

  const fileLabel = truncateFilePath(diffModel.filePath, 68)
  const language = getLanguageFromPath(diffModel.filePath)

  return (
    <Collapsible.Root
      className="rounded-md border border-slate-700 bg-slate-900/60"
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <Collapsible.Trigger className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-100">edit · {fileLabel}</p>
          <p className="text-[11px] text-slate-400">
            +{diffModel.additions} / -{diffModel.deletions} · {language}
          </p>
        </div>
        <span className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusClass}`}>
          {tool.status}
        </span>
      </Collapsible.Trigger>

      <Collapsible.Content className="space-y-2 border-t border-slate-700 px-3 py-2">
        {diffModel.parseError && (
          <p className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
            rendering failed: {diffModel.parseError}
          </p>
        )}

        {diffModel.original || diffModel.modified ? (
          <div className="h-[20rem] overflow-hidden rounded border border-slate-700 bg-slate-950">
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
          <pre className="max-h-60 overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-200">
            {JSON.stringify({ args: tool.args, result: tool.result, error: tool.error }, null, 2)}
          </pre>
        )}
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
