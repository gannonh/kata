import { type FormEvent, type KeyboardEvent, useState } from 'react'

import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'

type ChatInputProps = {
  onSend: (message: string) => void
  disabled?: boolean
}

export function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [value, setValue] = useState('')

  const submit = (): void => {
    const trimmed = value.trim()
    if (!trimmed || disabled) {
      return
    }

    onSend(trimmed)
    setValue('')
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    submit()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return
    }

    event.preventDefault()
    submit()
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex items-end gap-3 rounded-lg border bg-card p-3"
    >
      <Textarea
        aria-label="Message input"
        className="min-h-20 flex-1 resize-none"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          setValue(event.target.value)
        }}
        onKeyDown={onKeyDown}
      />
      <Button
        type="submit"
        size="sm"
        disabled={disabled || value.trim().length === 0}
      >
        Send
      </Button>
    </form>
  )
}
