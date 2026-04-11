import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { AvailableModel, ThinkingLevel } from '@shared/types'

export const SELECTED_MODEL_STORAGE_KEY = 'kata-desktop:selected-model'
export const THINKING_LEVEL_STORAGE_KEY = 'kata-desktop:thinking-level'

// The app-wide DEFAULT_MODEL is applied at the main-process layer
// (`loadPersistedModel()`) so the bridge launches with it on fresh installs.
// The atom itself must stay `null` on startup so `ModelSelector.refreshModels`
// picks up the bridge-reported model instead of overriding it with the
// compile-time default. See PR #313 review (chatgpt-codex-connector).
export const selectedModelAtom = atomWithStorage<string | null>(
  SELECTED_MODEL_STORAGE_KEY,
  null,
)

export const thinkingLevelAtom = atomWithStorage<ThinkingLevel>(
  THINKING_LEVEL_STORAGE_KEY,
  'medium',
)

export const availableModelsAtom = atom<AvailableModel[]>([])
export const modelLoadingAtom = atom<boolean>(false)
export const modelErrorAtom = atom<string | null>(null)
