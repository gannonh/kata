import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { SessionListResponse, SessionListItem } from '@shared/types'
import { resetChatStateAtom } from './chat'

const CURRENT_SESSION_STORAGE_KEY = 'kata-desktop:current-session-id'
const WORKING_DIRECTORY_STORAGE_KEY = 'kata-desktop:working-directory'
const SESSION_SIDEBAR_OPEN_STORAGE_KEY = 'kata-desktop:session-sidebar-open'

export const sessionListAtom = atom<SessionListItem[]>([])
export const sessionWarningsAtom = atom<string[]>([])
export const sessionDirectoryAtom = atom<string>('')
export const sessionListLoadingAtom = atom<boolean>(false)
export const sessionListErrorAtom = atom<string | null>(null)

export const currentSessionIdAtom = atomWithStorage<string | null>(
  CURRENT_SESSION_STORAGE_KEY,
  null,
)

export const workingDirectoryAtom = atomWithStorage<string>(
  WORKING_DIRECTORY_STORAGE_KEY,
  '',
)

export const sessionSidebarOpenAtom = atomWithStorage<boolean>(
  SESSION_SIDEBAR_OPEN_STORAGE_KEY,
  true,
)

const applySessionListResponseAtom = atom(
  null,
  (get, set, response: SessionListResponse) => {
    set(sessionListAtom, response.sessions)
    set(sessionWarningsAtom, response.warnings)
    set(sessionDirectoryAtom, response.directory)

    const existingSessionId = get(currentSessionIdAtom)
    if (
      existingSessionId &&
      response.sessions.some((session) => session.id === existingSessionId)
    ) {
      return
    }

    set(currentSessionIdAtom, response.sessions[0]?.id ?? null)
  },
)

export const refreshSessionListAtom = atom(null, async (_get, set) => {
  set(sessionListLoadingAtom, true)
  set(sessionListErrorAtom, null)

  try {
    const response = await window.api.sessions.list()
    set(applySessionListResponseAtom, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    set(sessionListErrorAtom, message)
  } finally {
    set(sessionListLoadingAtom, false)
  }
})

export const initializeSessionsAtom = atom(null, async (_get, set) => {
  set(sessionListLoadingAtom, true)
  set(sessionListErrorAtom, null)

  try {
    const workspace = await window.api.workspace.get()
    set(workingDirectoryAtom, workspace.path)

    const response = await window.api.sessions.list()
    set(applySessionListResponseAtom, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    set(sessionListErrorAtom, message)
  } finally {
    set(sessionListLoadingAtom, false)
  }
})

export const createSessionAtom = atom(null, async (_get, set) => {
  set(sessionListErrorAtom, null)

  const response = await window.api.sessions.create()
  if (!response.success) {
    set(sessionListErrorAtom, response.error ?? 'Unable to create session')
    return
  }

  set(resetChatStateAtom)

  await set(refreshSessionListAtom)

  if (response.sessionId) {
    set(currentSessionIdAtom, response.sessionId)
  }
})

export const selectSessionAtom = atom(null, (_get, set, sessionId: string) => {
  set(currentSessionIdAtom, sessionId)
})

export const pickWorkspaceAtom = atom(null, async () => {
  return window.api.workspace.pick()
})

export const switchWorkspaceAtom = atom(null, async (_get, set, workspacePath: string) => {
  const response = await window.api.workspace.set(workspacePath)
  set(workingDirectoryAtom, response.path)
  set(currentSessionIdAtom, null)
  set(resetChatStateAtom)
  await set(refreshSessionListAtom)
})
