import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface MessageInputProps {
  disabled?: boolean
  stopDisabled?: boolean
  onSubmit: (value: string) => Promise<void>
  onStop: () => Promise<void>
}

export function MessageInput({ disabled = false, stopDisabled = disabled, onSubmit, onStop }: MessageInputProps) {
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
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2">
        <Textarea
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
          className="h-20 resize-none rounded-none border-0 bg-transparent px-0 py-0 text-sm text-foreground shadow-none focus-visible:border-transparent focus-visible:ring-0"
          placeholder="Ask Kata to help with your code..."
          disabled={disabled || submitting}
        />

        <div className="flex justify-end gap-2">
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
  )
}
