import { useEffect, useMemo, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import {
  type ExtensionUIConfirmRequest,
  type ExtensionUIInputRequest,
  type ExtensionUIRequest,
  type ExtensionUIResponse,
  type ExtensionUISelectRequest,
} from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { permissionModeAtom } from '@/atoms/permissions'
import { ToolApprovalDialog } from './ToolApprovalDialog'

interface ToastItem {
  id: string
  title: string
  message: string
  level: 'info' | 'success' | 'warning' | 'error'
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

function getTimeoutMs(request: ExtensionUIRequest): number {
  const value = request.timeoutMs ?? request.timeout_ms
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }

  return DEFAULT_TIMEOUT_MS
}

function isConfirmRequest(request: ExtensionUIRequest): request is ExtensionUIConfirmRequest {
  return request.method === 'confirm'
}

function isSelectRequest(request: ExtensionUIRequest): request is ExtensionUISelectRequest {
  return request.method === 'select'
}

function isInputRequest(request: ExtensionUIRequest): request is ExtensionUIInputRequest {
  return request.method === 'input'
}

function isSupportedInteractiveRequest(
  request: ExtensionUIRequest,
): request is ExtensionUIConfirmRequest | ExtensionUISelectRequest | ExtensionUIInputRequest {
  return isConfirmRequest(request) || isSelectRequest(request) || isInputRequest(request)
}

function isNotifyLevel(value: unknown): value is ToastItem['level'] {
  return value === 'info' || value === 'success' || value === 'warning' || value === 'error'
}

function normalizeOptions(request: ExtensionUISelectRequest): Array<{ label: string; value: string; description?: string }> {
  if (!Array.isArray(request.options)) {
    return []
  }

  const options: Array<{ label: string; value: string; description?: string }> = []

  request.options.forEach((option, index) => {
    if (typeof option === 'string') {
      options.push({
        label: option,
        value: option,
      })
      return
    }

    if (!option || typeof option !== 'object') {
      return
    }

    const record = option as Record<string, unknown>
    const label = typeof record.label === 'string' ? record.label : `Option ${index + 1}`
    const value = typeof record.value === 'string' ? record.value : label
    const description = typeof record.description === 'string' ? record.description : undefined

    options.push({
      label,
      value,
      description,
    })
  })

  return options
}

function makeToastId(prefix: string): string {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
}

function getToastClass(level: ToastItem['level']): string {
  return cn(
    'rounded-md border px-3 py-2 text-xs shadow-xl',
    level === 'error' && 'border-red-500/50 bg-red-500/15 text-red-700 dark:text-red-200',
    level === 'warning' && 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-200',
    level === 'success' && 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200',
    level === 'info' && 'border-border bg-card text-foreground',
  )
}

function getToastBadgeClass(level: ToastItem['level']): string {
  return cn(
    'border text-[10px] uppercase tracking-wide',
    level === 'error' && 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-200',
    level === 'warning' && 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200',
    level === 'success' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
    level === 'info' && 'border-border bg-muted text-muted-foreground',
  )
}

export function ExtensionUIHandler() {
  const permissionMode = useAtomValue(permissionModeAtom)
  const permissionModeRef = useRef(permissionMode)
  const [queue, setQueue] = useState<ExtensionUIRequest[]>([])
  const [activeRequest, setActiveRequest] = useState<ExtensionUIRequest | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [selectedValue, setSelectedValue] = useState('')
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    permissionModeRef.current = permissionMode
  }, [permissionMode])

  const enqueue = (request: ExtensionUIRequest) => {
    setQueue((current) => [...current, request])
  }

  const dismissToast = (id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }

  const pushToast = (toast: Omit<ToastItem, 'id'>) => {
    const id = makeToastId('toast')
    const next: ToastItem = { id, ...toast }

    setToasts((current) => [...current, next])
    window.setTimeout(() => dismissToast(id), 4_500)
  }

  const sendResponse = async (requestId: string, response: ExtensionUIResponse): Promise<boolean> => {
    try {
      await window.api.sendExtensionUIResponse(requestId, response)
      console.debug('[ExtensionUIHandler] extension_ui_response sent', { requestId, response })
      return true
    } catch (error) {
      console.error('[ExtensionUIHandler] failed to send extension_ui_response', {
        requestId,
        response,
        error,
      })

      pushToast({
        title: 'Response failed',
        message: 'Could not send extension_ui_response to the agent subprocess. Request remains open for retry.',
        level: 'error',
      })

      return false
    }
  }

  useEffect(() => {
    const unsubscribe = window.api.onExtensionUIRequest((request) => {
      console.debug('[ExtensionUIHandler] extension_ui_request received', {
        id: request.id,
        method: request.method,
      })

      if (request.method === 'notify') {
        const title = typeof request.title === 'string' ? request.title : 'Notification'
        const message =
          typeof request.message === 'string'
            ? request.message
            : typeof request.description === 'string'
              ? request.description
              : 'Agent emitted a notification.'
        const level = isNotifyLevel(request.level) ? request.level : 'info'

        pushToast({ title, message, level })
        return
      }

      if (!isSupportedInteractiveRequest(request)) {
        console.debug('[ExtensionUIHandler] unsupported extension_ui_request method; auto-cancelling', {
          id: request.id,
          method: request.method,
        })
        void sendResponse(request.id, { cancelled: true })
        return
      }

      if (isConfirmRequest(request)) {
        const mode = permissionModeRef.current

        if (mode === 'auto') {
          void sendResponse(request.id, { confirmed: true })
          return
        }

        if (mode === 'explore') {
          void sendResponse(request.id, { confirmed: false })
          return
        }
      }

      enqueue(request)
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (activeRequest || queue.length === 0) {
      return
    }

    const [next, ...rest] = queue
    setActiveRequest(next ?? null)
    setQueue(rest)
  }, [activeRequest, queue])

  useEffect(() => {
    if (!activeRequest) {
      return
    }

    if (isInputRequest(activeRequest)) {
      setInputValue(typeof activeRequest.defaultValue === 'string' ? activeRequest.defaultValue : '')
      return
    }

    if (isSelectRequest(activeRequest)) {
      const options = normalizeOptions(activeRequest)
      setSelectedValue(options[0]?.value ?? '')
      return
    }

    setInputValue('')
    setSelectedValue('')
  }, [activeRequest])

  useEffect(() => {
    if (!activeRequest || isConfirmRequest(activeRequest)) {
      return
    }

    const requestId = activeRequest.id
    const requestMethod = activeRequest.method

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        const sent = await sendResponse(requestId, { cancelled: true })
        if (!sent) {
          return
        }

        pushToast({
          title: 'Request timed out',
          message: `${requestMethod} request expired without input.`,
          level: 'warning',
        })
        setActiveRequest((current) => (current?.id === requestId ? null : current))
      })()
    }, getTimeoutMs(activeRequest))

    return () => window.clearTimeout(timeoutId)
  }, [activeRequest])

  const activeConfirmRequest =
    activeRequest && isConfirmRequest(activeRequest) ? activeRequest : null
  const activeSelectRequest = activeRequest && isSelectRequest(activeRequest) ? activeRequest : null
  const activeInputRequest = activeRequest && isInputRequest(activeRequest) ? activeRequest : null

  const selectOptions = useMemo(() => {
    if (!activeSelectRequest) {
      return []
    }

    return normalizeOptions(activeSelectRequest)
  }, [activeSelectRequest])

  return (
    <>
      <ToolApprovalDialog
        open={Boolean(activeConfirmRequest)}
        request={activeConfirmRequest}
        onApprove={(requestId) => {
          void (async () => {
            const sent = await sendResponse(requestId, { confirmed: true })
            if (sent) {
              setActiveRequest((current) => (current?.id === requestId ? null : current))
            }
          })()
        }}
        onReject={(requestId) => {
          void (async () => {
            const sent = await sendResponse(requestId, { confirmed: false })
            if (sent) {
              setActiveRequest((current) => (current?.id === requestId ? null : current))
            }
          })()
        }}
        onTimeout={(requestId) => {
          void (async () => {
            const sent = await sendResponse(requestId, { confirmed: false })
            if (!sent) {
              return
            }

            pushToast({
              title: 'Approval timed out',
              message: 'Tool request was rejected after timeout.',
              level: 'warning',
            })
            setActiveRequest((current) => (current?.id === requestId ? null : current))
          })()
        }}
      />

      {activeSelectRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-xl border border-border bg-card shadow-2xl">
            <header className="border-b border-border px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Select value</p>
              {(() => {
                const raw = activeSelectRequest.title ?? activeSelectRequest.message ?? 'Choose an option'
                const [heading, ...subtitleParts] = raw.split('\n')
                const subtitle = subtitleParts.join(' ').trim()
                return (
                  <>
                    <h2 className="mt-1 text-sm font-semibold text-foreground">{heading}</h2>
                    {subtitle && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
                    )}
                  </>
                )
              })()}
            </header>

            <div className="flex max-h-72 flex-col gap-2 overflow-auto p-4">
              {selectOptions.length === 0 && (
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  No options were provided for this select request.
                </p>
              )}

              {selectOptions.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-background px-3 py-2"
                >
                  <input
                    type="radio"
                    name={`extension-select-${activeSelectRequest.id}`}
                    value={option.value}
                    checked={selectedValue === option.value}
                    onChange={(event) => setSelectedValue(event.target.value)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm text-foreground">{option.label}</span>
                    {option.description && (
                      <span className="block text-xs text-muted-foreground">{option.description}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void (async () => {
                    const requestId = activeSelectRequest.id
                    const sent = await sendResponse(requestId, { cancelled: true })
                    if (sent) {
                      setActiveRequest((current) => (current?.id === requestId ? null : current))
                    }
                  })()
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-200"
                onClick={() => {
                  void (async () => {
                    const requestId = activeSelectRequest.id
                    const sent = await sendResponse(requestId, { value: selectedValue })
                    if (sent) {
                      setActiveRequest((current) => (current?.id === requestId ? null : current))
                    }
                  })()
                }}
                disabled={!selectedValue}
              >
                Submit
              </Button>
            </footer>
          </div>
        </div>
      )}

      {activeInputRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-xl border border-border bg-card shadow-2xl">
            <header className="border-b border-border px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Input requested</p>
              <h2 className="mt-1 text-sm font-semibold text-foreground">
                {activeInputRequest.title ?? activeInputRequest.message ?? 'Provide input'}
              </h2>
            </header>

            <div className="flex flex-col gap-2 p-4">
              <Textarea
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder={typeof activeInputRequest.placeholder === 'string' ? activeInputRequest.placeholder : 'Type a response...'}
                className="h-28 resize-none bg-background"
              />
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void (async () => {
                    const requestId = activeInputRequest.id
                    const sent = await sendResponse(requestId, { cancelled: true })
                    if (sent) {
                      setActiveRequest((current) => (current?.id === requestId ? null : current))
                    }
                  })()
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-200"
                onClick={() => {
                  void (async () => {
                    const requestId = activeInputRequest.id
                    const sent = await sendResponse(requestId, { value: inputValue })
                    if (sent) {
                      setActiveRequest((current) => (current?.id === requestId ? null : current))
                    }
                  })()
                }}
              >
                Submit
              </Button>
            </footer>
          </div>
        </div>
      )}

      {toasts.length > 0 && (
        <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
          {toasts.map((toast) => (
            <div key={toast.id} className={getToastClass(toast.level)}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{toast.title}</p>
                <Badge variant="outline" className={getToastBadgeClass(toast.level)}>
                  {toast.level}
                </Badge>
              </div>
              <p className="mt-0.5 text-[11px] opacity-90">{toast.message}</p>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
