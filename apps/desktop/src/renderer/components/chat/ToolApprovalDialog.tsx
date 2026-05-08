import { useEffect, useMemo, useState } from 'react'
import type { ExtensionUIConfirmRequest } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

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
    <Dialog open={open}>
      <DialogContent className="max-w-2xl p-0" showCloseButton={false}>
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogDescription className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Tool approval requested
          </DialogDescription>
          <DialogTitle className="text-sm">{toolName}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">{message}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Arguments</p>
            <pre className="max-h-56 overflow-auto rounded-md border border-border bg-background p-3 text-xs text-foreground">
              {formatArgs(request.args ?? {})}
            </pre>
          </div>

          <Badge
            variant="outline"
            className="w-fit border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          >
            Auto-rejects in {formatTime(remainingMs)}
          </Badge>
        </div>

        <DialogFooter className="border-t border-border bg-muted/30 px-4 py-3">
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => onReject(request.id)}
          >
            Reject
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onApprove(request.id)}
          >
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
