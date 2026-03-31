import { useEffect, useMemo, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import {
  type ExtensionUIConfirmRequest,
  type ExtensionUIInputRequest,
  type ExtensionUIRequest,
  type ExtensionUIResponse,
  type ExtensionUISelectRequest,
} from '@shared/types'
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

  const sendResponse = async (requestId: string, response: ExtensionUIResponse): Promise<void> => {
    try {
      await window.api.sendExtensionUIResponse(requestId, response)
      console.debug('[ExtensionUIHandler] extension_ui_response sent', { requestId, response })
    } catch (error) {
      console.error('[ExtensionUIHandler] failed to send extension_ui_response', {
        requestId,
        response,
        error,
      })

      pushToast({
        title: 'Response failed',
        message: 'Could not send extension_ui_response to the agent subprocess.',
        level: 'error',
      })
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

    const timeoutId = window.setTimeout(() => {
      void sendResponse(activeRequest.id, { cancelled: true })
      pushToast({
        title: 'Request timed out',
        message: `${activeRequest.method} request expired without input.`,
        level: 'warning',
      })
      setActiveRequest(null)
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
          void sendResponse(requestId, { confirmed: true })
          setActiveRequest(null)
        }}
        onReject={(requestId) => {
          void sendResponse(requestId, { confirmed: false })
          setActiveRequest(null)
        }}
        onTimeout={(requestId) => {
          void sendResponse(requestId, { confirmed: false })
          pushToast({
            title: 'Approval timed out',
            message: 'Tool request was rejected after timeout.',
            level: 'warning',
          })
          setActiveRequest(null)
        }}
      />

      {activeSelectRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4">
          <div className="w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <header className="border-b border-slate-700 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Select value</p>
              <h2 className="mt-1 text-sm font-semibold text-slate-100">
                {activeSelectRequest.title ?? activeSelectRequest.message ?? 'Choose an option'}
              </h2>
            </header>

            <div className="max-h-72 space-y-2 overflow-auto p-4">
              {selectOptions.length === 0 && (
                <p className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300">
                  No options were provided for this select request.
                </p>
              )}

              {selectOptions.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-2 rounded border border-slate-700 bg-slate-950 px-3 py-2"
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
                    <span className="block text-sm text-slate-100">{option.label}</span>
                    {option.description && (
                      <span className="block text-xs text-slate-400">{option.description}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-slate-700 px-4 py-3">
              <button
                type="button"
                className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                onClick={() => {
                  void sendResponse(activeSelectRequest.id, { cancelled: true })
                  setActiveRequest(null)
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/20"
                onClick={() => {
                  void sendResponse(activeSelectRequest.id, { value: selectedValue })
                  setActiveRequest(null)
                }}
                disabled={!selectedValue}
              >
                Submit
              </button>
            </footer>
          </div>
        </div>
      )}

      {activeInputRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4">
          <div className="w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <header className="border-b border-slate-700 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Input requested</p>
              <h2 className="mt-1 text-sm font-semibold text-slate-100">
                {activeInputRequest.title ?? activeInputRequest.message ?? 'Provide input'}
              </h2>
            </header>

            <div className="space-y-2 p-4">
              <textarea
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder={typeof activeInputRequest.placeholder === 'string' ? activeInputRequest.placeholder : 'Type a response...'}
                className="h-28 w-full resize-none rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-slate-500"
              />
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-slate-700 px-4 py-3">
              <button
                type="button"
                className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                onClick={() => {
                  void sendResponse(activeInputRequest.id, { cancelled: true })
                  setActiveRequest(null)
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/20"
                onClick={() => {
                  void sendResponse(activeInputRequest.id, { value: inputValue })
                  setActiveRequest(null)
                }}
              >
                Submit
              </button>
            </footer>
          </div>
        </div>
      )}

      {toasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
          {toasts.map((toast) => {
            const levelClass =
              toast.level === 'error'
                ? 'border-red-500/50 bg-red-500/20 text-red-100'
                : toast.level === 'warning'
                  ? 'border-amber-500/50 bg-amber-500/20 text-amber-100'
                  : toast.level === 'success'
                    ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-100'
                    : 'border-slate-600 bg-slate-800/95 text-slate-100'

            return (
              <div key={toast.id} className={`rounded border px-3 py-2 text-xs shadow-xl ${levelClass}`}>
                <p className="font-semibold">{toast.title}</p>
                <p className="mt-0.5 text-[11px] opacity-90">{toast.message}</p>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
