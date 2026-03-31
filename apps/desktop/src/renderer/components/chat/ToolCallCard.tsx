import * as Collapsible from '@radix-ui/react-collapsible'
import type { ToolCallView } from '@/atoms/chat'

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

export function ToolCallCard({ tool }: ToolCallCardProps) {
  const badgeClass =
    tool.status === 'error'
      ? 'bg-red-500/20 text-red-200 border-red-500/40'
      : tool.status === 'done'
        ? 'bg-emerald-500/20 text-emerald-100 border-emerald-500/40'
        : 'bg-amber-500/20 text-amber-100 border-amber-500/40'

  const resultClass =
    tool.status === 'error'
      ? 'max-h-48 overflow-auto rounded border border-red-500/40 bg-red-950/30 p-2 text-xs text-red-100'
      : 'max-h-48 overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-200'

  return (
    <Collapsible.Root className="rounded-md border border-slate-700 bg-slate-900/60">
      <Collapsible.Trigger className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left">
        <span className="text-xs font-medium text-slate-100">{tool.name}</span>
        <span className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide ${badgeClass}`}>
          {tool.status}
        </span>
      </Collapsible.Trigger>

      <Collapsible.Content className="space-y-2 border-t border-slate-700 px-3 py-2">
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">Args</p>
          <pre className="max-h-40 overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-200">
            {formatJson(tool.args)}
          </pre>
        </div>

        {(tool.result !== undefined || tool.error) && (
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">Result</p>
            <pre className={resultClass}>{tool.error ?? formatJson(tool.result)}</pre>
          </div>
        )}
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
