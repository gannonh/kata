import { useAtomValue } from 'jotai'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SlashCommandEntry } from '@shared/types'
import { commandsLoadableAtom, commandsLoadingAtom } from '@/atoms/commands'

function normalizeCommandName(name: string): string {
  return name.startsWith('/') ? name : `/${name}`
}

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

  const hasSlashPrefix = input.startsWith('/')

  const commandsData = commandsState.state === 'hasData' ? commandsState.data : null

  const suggestions = useMemo(() => {
    if (!hasSlashPrefix) {
      return []
    }

    const commands = (commandsData ?? []).map((entry) => ({
      ...entry,
      name: normalizeCommandName(entry.name),
    }))
    const normalizedInput = input.toLowerCase()

    if (normalizedInput === '/') {
      return commands
    }

    return commands.filter((entry) => entry.name.toLowerCase().startsWith(normalizedInput))
  }, [commandsData, hasSlashPrefix, input])

  useEffect(() => {
    if (!hasSlashPrefix) {
      setSelectedIndex(0)
      return
    }

    setSelectedIndex((current) => {
      if (suggestions.length === 0) {
        return 0
      }

      return Math.min(current, suggestions.length - 1)
    })
  }, [hasSlashPrefix, suggestions])

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
