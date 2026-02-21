import { type FormEvent, type KeyboardEvent, useState } from 'react'
import { ArrowUpRight, Plus, Send } from 'lucide-react'

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
    <div className="-mx-4 shrink-0 border-t bg-background px-4 py-3">
      <form
        onSubmit={onSubmit}
        className="rounded-lg border bg-card"
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm text-muted-foreground">orchestrator@kata.local</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-2 text-xs"
            disabled={disabled}
          >
            Cc
          </Button>
        </div>

        <Textarea
          aria-label="Message input"
          className="min-h-[96px] resize-none border-0 bg-transparent focus-visible:ring-0"
          value={value}
          disabled={disabled}
          onChange={(event) => {
            setValue(event.target.value)
          }}
          onKeyDown={onKeyDown}
          placeholder="Write a reply..."
        />

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-8 w-8"
              disabled={disabled}
              aria-label="Add attachment"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <span>
              Use <kbd className="rounded bg-muted px-1">/</kbd> for shortcuts
            </span>
          </div>

          <Button
            type="submit"
            size="sm"
            className="gap-1.5"
            disabled={disabled || value.trim().length === 0}
          >
            <Send className="h-3.5 w-3.5" />
            Send
          </Button>
        </div>
      </form>
    </div>
  )
}
