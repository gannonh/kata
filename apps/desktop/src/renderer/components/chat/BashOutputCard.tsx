import { useMemo, useState } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { TerminalOutput } from '@kata-ui/components/terminal/TerminalOutput'
import type { ToolCallView } from '@/atoms/chat'

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

function toText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toText(entry)).join('\n')
  }

  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  if (value === null || value === undefined) {
    return ''
  }

  return String(value)
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

export function BashOutputCard({ tool }: BashOutputCardProps) {
  const [isOpen, setIsOpen] = useState(tool.status !== 'done')
  const view = useMemo(() => buildBashViewModel(tool), [tool])

  const statusClass =
    tool.status === 'error'
      ? 'border-red-500/40 bg-red-500/20 text-red-100'
      : tool.status === 'done'
        ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-100'
        : 'border-amber-500/40 bg-amber-500/20 text-amber-100'

  const exitClass =
    view.exitCode === undefined || view.exitCode === 0
      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
      : 'border-red-500/40 bg-red-500/15 text-red-200'

  return (
    <Collapsible.Root
      className="rounded-md border border-slate-700 bg-slate-900/60"
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <Collapsible.Trigger className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-100">bash · {view.command}</p>
          <div className="mt-1 flex items-center gap-2">
            {view.exitCode !== undefined && (
              <span className={`rounded border px-1.5 py-0.5 text-[10px] ${exitClass}`}>
                exit {view.exitCode}
              </span>
            )}
            <span className="text-[11px] text-slate-400">
              {(view.output || '').split('\n').filter(Boolean).length} lines
            </span>
          </div>
        </div>
        <span className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusClass}`}>
          {tool.status}
        </span>
      </Collapsible.Trigger>

      <Collapsible.Content className="border-t border-slate-700 px-3 py-2">
        <div className="max-h-[24rem] overflow-auto rounded border border-slate-700 bg-slate-950">
          <TerminalOutput command={view.command} output={view.output} exitCode={view.exitCode} theme="dark" toolType="bash" />
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
