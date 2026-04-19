import { useAtomValue } from 'jotai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SlashCommandEntry } from '@shared/types'
import { commandsLoadableAtom, commandsLoadingAtom } from '@/atoms/commands'

interface CommandSuggestionsResult {
  suggestions: SlashCommandEntry[]
  selectedIndex: number
  setSelectedIndex: (index: number) => void
  isOpen: boolean
  isLoading: boolean
  moveSelection: (delta: number) => void
}

export function useCommandSuggestions(input: string): CommandSuggestionsResult {
  const commandsState = useAtomValue(commandsLoadableAtom)
  const isLoading = useAtomValue(commandsLoadingAtom)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const lastFilterRef = useRef<string>('')

  const hasSlashPrefix = input.startsWith('/')

  const suggestions = useMemo(() => {
    if (!hasSlashPrefix) {
      return []
    }

    const commands = commandsState.state === 'hasData' ? commandsState.data : []
    const normalizedInput = input.toLowerCase()

    if (normalizedInput === '/') {
      return commands
    }

    return commands.filter((entry) => entry.name.toLowerCase().startsWith(normalizedInput))
  }, [commandsState, hasSlashPrefix, input])

  useEffect(() => {
    if (!hasSlashPrefix) {
      setSelectedIndex(0)
      lastFilterRef.current = ''
      return
    }

    const filterKey = `${input.toLowerCase()}|${suggestions.length}`
    if (import.meta.env.DEV && filterKey !== lastFilterRef.current) {
      console.debug('[CommandSuggestions] filter', {
        input,
        matchCount: suggestions.length,
      })
      lastFilterRef.current = filterKey
    }

    setSelectedIndex((current) => {
      if (suggestions.length === 0) {
        return 0
      }

      return Math.min(current, suggestions.length - 1)
    })
  }, [hasSlashPrefix, input, suggestions])

  const moveSelection = useCallback(
    (delta: number) => {
      if (suggestions.length === 0) {
        return
      }

      setSelectedIndex((current) => {
        const normalized = ((current + delta) % suggestions.length + suggestions.length) % suggestions.length
        return normalized
      })
    },
    [suggestions.length],
  )

  return {
    suggestions,
    selectedIndex,
    setSelectedIndex,
    isOpen: hasSlashPrefix,
    isLoading: hasSlashPrefix && isLoading,
    moveSelection,
  }
}
