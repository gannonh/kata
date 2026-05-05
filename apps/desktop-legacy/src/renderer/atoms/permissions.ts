import { atom } from 'jotai'
import type { PermissionMode } from '@shared/types'

export const permissionModeAtom = atom<PermissionMode>('ask')
