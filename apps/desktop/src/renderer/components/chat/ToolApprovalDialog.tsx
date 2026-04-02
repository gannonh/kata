import { useEffect, useMemo, useState } from 'react'
import type { ExtensionUIConfirmRequest } from '@shared/types'

interface ToolApprovalDialogProps {
  request: ExtensionUIConfirmRequest | null
  open: boolean
  onApprove: (requestId: string) => void
  onReject: (requestId: string) => void
  onTimeout: (requestId: string) => void
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function truncateString(value: string, limit = 180): string {
  if (value.length <= limit) {
    return value
  }

  return `${value.slice(0, limit)}… [truncated ${value.length - limit} chars]`
}

function redactLargeContent(value: unknown): unknown {
  if (typeof value === 'string') {
    return truncateString(value)
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactLargeContent(entry))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const record = value as Record<string, unknown>
  const output: Record<string, unknown> = {}

  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === 'string' && /content|oldText|newText|diff/i.test(key)) {
      output[key] = truncateString(entry, 120)
      continue
    }

    output[key] = redactLargeContent(entry)
  }

  return output
}

function formatArgs(args: unknown): string {
  try {
    return JSON.stringify(redactLargeContent(args), null, 2)
  } catch {
    return String(args)
  }
}

function formatTime(ms: number): string {
  const clamped = Math.max(ms, 0)
  const totalSeconds = Math.floor(clamped / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function ToolApprovalDialog({
  request,
  open,
  onApprove,
  onReject,
  onTimeout,
}: ToolApprovalDialogProps) {
  const timeoutMs = useMemo(() => {
    if (!request) {
      return DEFAULT_TIMEOUT_MS
    }

    return asNumber(request.timeoutMs) ?? asNumber(request.timeout_ms) ?? DEFAULT_TIMEOUT_MS
  }, [request])

  const [deadlineAt, setDeadlineAt] = useState<number>(Date.now() + timeoutMs)
  const [remainingMs, setRemainingMs] = useState<number>(timeoutMs)

  useEffect(() => {
    if (!open || !request) {
      return
    }

    const deadline = Date.now() + timeoutMs
    setDeadlineAt(deadline)
    setRemainingMs(timeoutMs)
  }, [open, request, timeoutMs])

  useEffect(() => {
    if (!open || !request) {
      return
    }

    const interval = setInterval(() => {
      const now = Date.now()
      const next = Math.max(0, deadlineAt - now)
      setRemainingMs(next)

      if (next <= 0) {
        clearInterval(interval)
        onTimeout(request.id)
      }
    }, 250)

    return () => clearInterval(interval)
  }, [deadlineAt, onTimeout, open, request])

  if (!open || !request) {
    return null
  }

  const toolName = request.toolName ?? 'tool'
  const message = request.message ?? request.title ?? 'Approve this tool action?'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4">
      <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <header className="border-b border-slate-700 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Tool approval requested</p>
          <h2 className="mt-1 text-sm font-semibold text-slate-100">{toolName}</h2>
          <p className="mt-1 text-xs text-slate-300">{message}</p>
        </header>

        <div className="space-y-3 p-4">
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Arguments</p>
            <pre className="max-h-56 overflow-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200">
              {formatArgs(request.args ?? {})}
            </pre>
          </div>

          <p className="text-xs text-amber-200">Auto-rejects in {formatTime(remainingMs)}</p>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-700 px-4 py-3">
          <button
            type="button"
            className="rounded border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-500/20"
            onClick={() => onReject(request.id)}
          >
            Reject
          </button>
          <button
            type="button"
            className="rounded border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/20"
            onClick={() => onApprove(request.id)}
          >
            Approve
          </button>
        </footer>
      </div>
    </div>
  )
}
