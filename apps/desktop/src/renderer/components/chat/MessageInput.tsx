import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SlashCommandEntry } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CommandSuggestionDropdown } from './CommandSuggestionDropdown'
import { useCommandSuggestions } from '@/hooks/useCommandSuggestions'

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
  const [isSuggestionDismissed, setIsSuggestionDismissed] = useState(false)
  const sendingRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const composerRef = useRef<HTMLDivElement | null>(null)

  const {
    suggestions,
    selectedIndex,
    setSelectedIndex,
    isOpen,
    isLoading,
    moveSelection,
  } = useCommandSuggestions(value)

  const adjustTextareaHeight = useCallback((): void => {
    const textarea = textareaRef.current
    if (!textarea) {
      return
    }

    textarea.style.height = '0px'
    const nextHeight = Math.max(textarea.scrollHeight, 80)
    textarea.style.height = `${nextHeight}px`
  }, [])

  useLayoutEffect(() => {
    adjustTextareaHeight()
  }, [adjustTextareaHeight, value])

  useEffect(() => {
    setIsSuggestionDismissed(false)
  }, [value])

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

  const showSuggestions =
    isOpen && !isSuggestionDismissed && (isLoading || suggestions.length > 0)

  const activeSuggestionId =
    showSuggestions && suggestions.length > 0 && selectedIndex >= 0 && selectedIndex < suggestions.length
      ? `command-suggestion-${selectedIndex}`
      : undefined

  const applyCommandSuggestion = (command: SlashCommandEntry): void => {
    const textarea = textareaRef.current
    const selectionStart = textarea?.selectionStart ?? value.length
    const selectionEnd = textarea?.selectionEnd ?? value.length
    const tokenStart = value.lastIndexOf('/', selectionStart)

    const replaceStart = tokenStart >= 0 ? tokenStart : 0
    const tokenEnd = value.indexOf(' ', Math.max(selectionEnd, replaceStart))
    const replaceEnd = tokenStart >= 0 ? (tokenEnd === -1 ? value.length : tokenEnd) : value.length

    const nextValue = `${value.slice(0, replaceStart)}${command.name} ${value.slice(replaceEnd)}`
    const nextCaret = replaceStart + command.name.length + 1

    setValue(nextValue)
    setSelectedIndex(0)
    setIsSuggestionDismissed(true)

    queueMicrotask(() => {
      const element = textareaRef.current
      if (!element) {
        return
      }

      element.focus()
      element.setSelectionRange(nextCaret, nextCaret)
    })
  }

  return (
    <div className="border-t border-border p-4">
      <div ref={composerRef} className="relative flex flex-col gap-2 rounded-lg border border-border bg-input/30 p-3">
        <Textarea
          ref={textareaRef}
          data-testid="chat-input"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls={showSuggestions ? 'command-suggestion-listbox' : undefined}
          aria-activedescendant={activeSuggestionId}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) {
              return
            }

            if (showSuggestions && suggestions.length > 0 && event.key === 'ArrowDown') {
              event.preventDefault()
              moveSelection(1)
              return
            }

            if (showSuggestions && suggestions.length > 0 && event.key === 'ArrowUp') {
              event.preventDefault()
              moveSelection(-1)
              return
            }

            if (showSuggestions && event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              setIsSuggestionDismissed(true)
              return
            }

            if (showSuggestions && suggestions.length > 0 && event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              event.stopPropagation()

              const selectedSuggestion = suggestions[selectedIndex]
              if (selectedSuggestion) {
                applyCommandSuggestion(selectedSuggestion)
              }
              return
            }

            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              handleSend()
            }
          }}
          className="min-h-[5rem] resize-none overflow-hidden rounded-none border-0 bg-transparent px-0 py-0 text-sm text-foreground shadow-none [field-sizing:fixed] focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
          placeholder="Ask Kata to help with your code..."
          disabled={disabled || submitting}
        />

        {showSuggestions ? (
          <CommandSuggestionDropdown
            suggestions={suggestions}
            selectedIndex={selectedIndex}
            anchorRef={composerRef}
            isOpen={showSuggestions}
            isLoading={isLoading}
            onSelect={(command) => {
              const index = suggestions.findIndex((suggestion) => suggestion.name === command.name)
              if (index >= 0) {
                setSelectedIndex(index)
              }

              applyCommandSuggestion(command)
            }}
          />
        ) : null}

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
