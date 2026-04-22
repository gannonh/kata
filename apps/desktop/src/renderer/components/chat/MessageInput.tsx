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

type SlashAcceptDiagnosticCode =
  | 'SLASH_ACCEPTED'
  | 'SLASH_ACCEPT_NO_SELECTION'
  | 'SLASH_ACCEPT_SUPPRESSED_DUPLICATE'

type SlashAcceptTriggerKey = 'Enter' | 'Tab' | 'Pointer'

interface LastAcceptedSuggestion {
  commandName: string
  acceptedAt: number
  valueAfterAccept: string
}

const SLASH_DUPLICATE_SUPPRESSION_WINDOW_MS = 64

function slashDiagnosticsEnabled(): boolean {
  return import.meta.env.DEV
}

function emitSlashDiagnostic(
  level: 'debug' | 'warn',
  code: SlashAcceptDiagnosticCode,
  details: Record<string, unknown>,
): void {
  if (!slashDiagnosticsEnabled()) {
    return
  }

  const payload = {
    code,
    ...details,
  }

  if (level === 'warn') {
    console.warn('[SlashAutocomplete]', payload)
    return
  }

  console.debug('[SlashAutocomplete]', payload)
}

function extractSlashPrefix(value: string, caret: number): string {
  const boundedCaret = Math.max(0, Math.min(caret, value.length))
  const tokenStart = value.lastIndexOf('/', Math.max(0, boundedCaret - 1))

  if (tokenStart < 0 || tokenStart >= boundedCaret) {
    return ''
  }

  const tokenBody = value.slice(tokenStart + 1, boundedCaret)
  if (/\s/.test(tokenBody)) {
    return ''
  }

  const tokenEnd = value.indexOf(' ', tokenStart)
  const end = tokenEnd === -1 ? value.length : tokenEnd

  if (boundedCaret > end) {
    return ''
  }

  return value.slice(tokenStart, end)
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
  const lastAcceptedSuggestionRef = useRef<LastAcceptedSuggestion | null>(null)

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

    const lastAccepted = lastAcceptedSuggestionRef.current
    if (!lastAccepted || value !== lastAccepted.valueAfterAccept) {
      lastAcceptedSuggestionRef.current = null
    }
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

  const applyCommandSuggestion = useCallback((command: SlashCommandEntry): { status: 'inserted' | 'no-op'; nextValue: string } => {
    const textarea = textareaRef.current
    const selectionStart = textarea?.selectionStart ?? value.length
    const selectionEnd = textarea?.selectionEnd ?? value.length
    const tokenStart = value.lastIndexOf('/', selectionStart)

    const replaceStart = tokenStart >= 0 ? tokenStart : 0
    const tokenEnd = value.indexOf(' ', Math.max(selectionEnd, replaceStart))
    const replaceEnd = tokenStart >= 0 ? (tokenEnd === -1 ? value.length : tokenEnd) : value.length

    const nextValue = `${value.slice(0, replaceStart)}${command.name} ${value.slice(replaceEnd)}`
    const nextCaret = replaceStart + command.name.length + 1

    if (nextValue === value) {
      setIsSuggestionDismissed(true)
      return { status: 'no-op', nextValue }
    }

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

    return { status: 'inserted', nextValue }
  }, [setSelectedIndex, value])

  const acceptSuggestion = useCallback(
    (key: SlashAcceptTriggerKey, command?: SlashCommandEntry): void => {
      const selectedSuggestion = command ?? suggestions[selectedIndex]
      const caret = textareaRef.current?.selectionStart ?? value.length
      const slashPrefix = extractSlashPrefix(value, caret)

      if (!selectedSuggestion) {
        emitSlashDiagnostic('warn', 'SLASH_ACCEPT_NO_SELECTION', {
          key,
          prefix: slashPrefix,
          selectedIndex,
          suggestionCount: suggestions.length,
        })
        return
      }

      const now = Date.now()
      const lastAccepted = lastAcceptedSuggestionRef.current
      if (
        lastAccepted &&
        lastAccepted.commandName === selectedSuggestion.name &&
        now - lastAccepted.acceptedAt <= SLASH_DUPLICATE_SUPPRESSION_WINDOW_MS
      ) {
        setIsSuggestionDismissed(true)
        emitSlashDiagnostic('debug', 'SLASH_ACCEPT_SUPPRESSED_DUPLICATE', {
          key,
          prefix: slashPrefix,
          command: selectedSuggestion.name,
          selectedIndex,
          suggestionCount: suggestions.length,
        })
        return
      }

      const result = applyCommandSuggestion(selectedSuggestion)

      if (result.status === 'inserted') {
        lastAcceptedSuggestionRef.current = {
          commandName: selectedSuggestion.name,
          acceptedAt: now,
          valueAfterAccept: result.nextValue,
        }

        emitSlashDiagnostic('debug', 'SLASH_ACCEPTED', {
          key,
          prefix: slashPrefix,
          command: selectedSuggestion.name,
          selectedIndex,
          suggestionCount: suggestions.length,
        })
        return
      }

      emitSlashDiagnostic('debug', 'SLASH_ACCEPT_SUPPRESSED_DUPLICATE', {
        key,
        prefix: slashPrefix,
        command: selectedSuggestion.name,
        selectedIndex,
        suggestionCount: suggestions.length,
      })
    },
    [applyCommandSuggestion, selectedIndex, suggestions, value],
  )

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

            const shouldAcceptWithEnter = event.key === 'Enter' && !event.shiftKey
            const shouldAcceptWithTab = event.key === 'Tab' && !event.shiftKey
            const hasSelectableSuggestion =
              suggestions.length > 0 && selectedIndex >= 0 && selectedIndex < suggestions.length

            if (showSuggestions && shouldAcceptWithEnter) {
              event.preventDefault()
              event.stopPropagation()
              acceptSuggestion('Enter')
              return
            }

            if (showSuggestions && shouldAcceptWithTab && hasSelectableSuggestion) {
              event.preventDefault()
              event.stopPropagation()
              acceptSuggestion('Tab')
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

              acceptSuggestion('Pointer', command)
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
