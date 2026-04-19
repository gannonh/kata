import { atom } from 'jotai'
import { loadable } from 'jotai/utils'
import type { SlashCommandEntry } from '@shared/types'

const refreshCommandsNonceAtom = atom(0)

type DebugCommandsWindow = Window & {
  __KATA_DEBUG_COMMANDS__?: SlashCommandEntry[]
}

function updateDebugCommands(commands: SlashCommandEntry[]): void {
  if (typeof window === 'undefined' || !import.meta.env.DEV) {
    return
  }

  ;(window as DebugCommandsWindow).__KATA_DEBUG_COMMANDS__ = commands
}

export const commandsAtom = atom(async (get): Promise<SlashCommandEntry[]> => {
  get(refreshCommandsNonceAtom)

  try {
    const response = await window.api.getSlashCommands()
    if (!response.success) {
      console.error('[CommandSuggestions] Failed to load slash commands', response.error)
      updateDebugCommands([])
      return []
    }

    const commands = response.commands ?? []
    updateDebugCommands(commands)

    return commands
  } catch (error) {
    console.error('[CommandSuggestions] Failed to load slash commands', error)
    updateDebugCommands([])
    return []
  }
})

export const commandsLoadableAtom = loadable(commandsAtom)

export const commandsLoadingAtom = atom((get) => get(commandsLoadableAtom).state === 'loading')

export const refreshCommandsAtom = atom(null, (_get, set) => {
  set(refreshCommandsNonceAtom, (current) => current + 1)
})
