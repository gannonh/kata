import { useState } from 'react'

interface MessageInputProps {
  disabled?: boolean
  onSubmit: (value: string) => Promise<void>
  onStop: () => Promise<void>
}

export function MessageInput({ disabled = false, onSubmit, onStop }: MessageInputProps) {
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const send = async (): Promise<void> => {
    const trimmed = value.trim()
    if (!trimmed || submitting || disabled) {
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(trimmed)
      setValue('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="border-t border-slate-800 p-4">
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
          className="h-20 w-full resize-none border-none bg-transparent text-sm text-slate-100 outline-none disabled:opacity-50"
          placeholder="Ask Kata to help with your code..."
          disabled={disabled || submitting}
        />

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => void onStop()}
            disabled={disabled}
            className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            Stop
          </button>

          <button
            type="button"
            onClick={() => void send()}
            disabled={disabled || submitting}
            className="rounded bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-900 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
