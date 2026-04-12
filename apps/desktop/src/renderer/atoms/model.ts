import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { AvailableModel, ThinkingLevel } from '@shared/types'

export const SELECTED_MODEL_STORAGE_KEY = 'kata-desktop:selected-model'
export const THINKING_LEVEL_STORAGE_KEY = 'kata-desktop:thinking-level'

// Keep this `null` on startup so `ModelSelector.refreshModels` can adopt the
// model selected by the CLI runtime itself (via pi's defaultProvider/defaultModel
// settings) instead of injecting a separate Desktop-only default.
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
