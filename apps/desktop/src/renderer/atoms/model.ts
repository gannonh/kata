import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { AvailableModel } from '@shared/types'

export const SELECTED_MODEL_STORAGE_KEY = 'kata-desktop:selected-model'

export const selectedModelAtom = atomWithStorage<string | null>(
  SELECTED_MODEL_STORAGE_KEY,
  null,
)

export const availableModelsAtom = atom<AvailableModel[]>([])
export const modelLoadingAtom = atom<boolean>(false)
export const modelErrorAtom = atom<string | null>(null)
