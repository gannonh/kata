import { type FormEvent, type KeyboardEvent, useState } from 'react'

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
      className="flex items-end gap-3 rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-panel)]/80 p-3"
    >
      <textarea
        aria-label="Message input"
        className="min-h-20 flex-1 resize-none rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-bg)]/60 px-3 py-2 font-body text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--line-strong)]"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          setValue(event.target.value)
        }}
        onKeyDown={onKeyDown}
      />
      <button
        type="submit"
        className="rounded-xl border border-[color:var(--line-strong)] bg-[color:var(--line-strong)]/20 px-4 py-2 font-display text-xs uppercase tracking-[0.16em] text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || value.trim().length === 0}
      >
        Send
      </button>
    </form>
  )
}
