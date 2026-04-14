import { type ReactNode, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface MessageInputProps {
  disabled?: boolean
  stopDisabled?: boolean
  footerControls?: ReactNode
  onSubmit: (value: string) => Promise<void>
  onStop: () => Promise<void>
}

export function MessageInput({
  disabled = false,
  stopDisabled = disabled,
  footerControls,
  onSubmit,
  onStop,
}: MessageInputProps) {
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const sendingRef = useRef(false)

  const send = async (): Promise<void> => {
    const trimmed = value.trim()
    if (!trimmed || disabled || submitting || sendingRef.current) {
      return
    }

    sendingRef.current = true
    setSubmitting(true)
    try {
      await onSubmit(trimmed)
      setValue('')
    } finally {
      sendingRef.current = false
      setSubmitting(false)
    }
  }

  const handleSend = (): void => {
    void send().catch((error: unknown) => {
      console.error('[MessageInput] failed to send message', error)
    })
  }

  const handleStop = (): void => {
    void onStop().catch((error: unknown) => {
      console.error('[MessageInput] failed to stop session', error)
    })
  }

  return (
    <div className="border-t border-border p-4">
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-input/30 p-3">
        <Textarea
          data-testid="chat-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) {
              return
            }

            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              handleSend()
            }
          }}
          className="min-h-[5rem] resize-none overflow-hidden rounded-none border-0 bg-transparent px-0 py-0 text-sm text-foreground shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
          placeholder="Ask Kata to help with your code..."
          disabled={disabled || submitting}
        />

        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">{footerControls}</div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleStop}
              disabled={stopDisabled}
            >
              Stop
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleSend}
              disabled={disabled || submitting}
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
