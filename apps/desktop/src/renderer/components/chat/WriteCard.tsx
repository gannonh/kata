import { useMemo, useState } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ShikiCodeViewer } from '@kata-ui/components/code-viewer/ShikiCodeViewer'
import { getLanguageFromPath, truncateFilePath } from '@kata-ui/components/code-viewer/language-map'
import type { ToolCallView } from '@/atoms/chat'

interface WriteCardProps {
  tool: ToolCallView
}

interface WriteViewModel {
  filePath: string
  content: string
  bytesWritten?: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
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

export function WriteCard({ tool }: WriteCardProps) {
  const view = useMemo(() => buildWriteViewModel(tool), [tool])
  const [isOpen, setIsOpen] = useState(tool.status !== 'done')
  const [showFullContent, setShowFullContent] = useState(false)

  const statusClass =
    tool.status === 'error'
      ? 'border-red-500/40 bg-red-500/20 text-red-100'
      : tool.status === 'done'
        ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-100'
        : 'border-amber-500/40 bg-amber-500/20 text-amber-100'

  const isLarge = view.content.split('\n').length > 20
  const language = getLanguageFromPath(view.filePath)
  const contentToShow = showFullContent ? view.content : toPreview(view.content, 20)

  return (
    <Collapsible.Root
      className="rounded-md border border-slate-700 bg-slate-900/60"
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <Collapsible.Trigger className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-100">write · {truncateFilePath(view.filePath, 68)}</p>
          <p className="text-[11px] text-slate-400">
            {tool.status === 'done' ? 'created/overwritten' : 'pending write'}
            {view.bytesWritten !== undefined ? ` · ${view.bytesWritten} bytes` : ''}
          </p>
        </div>
        <span className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusClass}`}>
          {tool.status}
        </span>
      </Collapsible.Trigger>

      <Collapsible.Content className="space-y-2 border-t border-slate-700 px-3 py-2">
        <div className="h-[18rem] overflow-hidden rounded border border-slate-700 bg-slate-950">
          <ShikiCodeViewer
            code={contentToShow}
            language={language}
            filePath={view.filePath}
            theme="dark"
          />
        </div>

        {isLarge && (
          <button
            type="button"
            className="text-xs text-slate-300 underline decoration-dotted underline-offset-2 hover:text-slate-100"
            onClick={() => setShowFullContent((value) => !value)}
          >
            {showFullContent ? 'Show preview' : 'Show full content'}
          </button>
        )}
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
