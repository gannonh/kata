import { useMemo, useState } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ShikiCodeViewer } from '@kata-ui/components/code-viewer/ShikiCodeViewer'
import { getLanguageFromPath, truncateFilePath } from '@kata-ui/components/code-viewer/language-map'
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

  const filePath = asString(result?.path) ?? asString(args?.path) ?? 'unknown-file'
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

export function FileReadCard({ tool }: FileReadCardProps) {
  const view = useMemo(() => buildReadViewModel(tool), [tool])
  const isLongFile = view.totalLines > 80
  const [isOpen, setIsOpen] = useState(!isLongFile || tool.status !== 'done')

  const statusClass =
    tool.status === 'error'
      ? 'border-red-500/40 bg-red-500/20 text-red-100'
      : tool.status === 'done'
        ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-100'
        : 'border-amber-500/40 bg-amber-500/20 text-amber-100'

  return (
    <Collapsible.Root
      className="rounded-md border border-slate-700 bg-slate-900/60"
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <Collapsible.Trigger className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-100">read · {truncateFilePath(view.filePath, 68)}</p>
          <p className="text-[11px] text-slate-400">
            {view.language} · {view.totalLines} lines{view.truncated ? ' · truncated' : ''}
          </p>
        </div>
        <span className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusClass}`}>
          {tool.status}
        </span>
      </Collapsible.Trigger>

      <Collapsible.Content className="space-y-2 border-t border-slate-700 px-3 py-2">
        {view.truncated && (
          <p className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
            File output was truncated by the tool.
          </p>
        )}

        <div className="h-[22rem] overflow-hidden rounded border border-slate-700 bg-slate-950">
          <ShikiCodeViewer
            code={view.content}
            language={view.language}
            filePath={view.filePath}
            theme="dark"
          />
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
