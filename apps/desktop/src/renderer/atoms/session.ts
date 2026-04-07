import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { SessionListResponse, SessionListItem } from '@shared/types'
import { applyChatEventAtom, isStreamingAtom, messagesAtom, resetChatStateAtom } from './chat'
import { requestPlanningReloadAtom, resetPlanningSessionStateAtom } from './planning'

const CURRENT_SESSION_STORAGE_KEY = 'kata-desktop:current-session-id'
const WORKING_DIRECTORY_STORAGE_KEY = 'kata-desktop:working-directory'
const SESSION_SIDEBAR_OPEN_STORAGE_KEY = 'kata-desktop:session-sidebar-open'

export const sessionListAtom = atom<SessionListItem[]>([])
export const sessionWarningsAtom = atom<string[]>([])
export const sessionDirectoryAtom = atom<string>('')
export const sessionListLoadingAtom = atom<boolean>(false)
export const sessionListErrorAtom = atom<string | null>(null)
export const sessionHistoryErrorAtom = atom<string | null>(null)
export const sessionCreatingAtom = atom<boolean>(false)
export const sessionSwitchingAtom = atom<boolean>(false)
export const sessionHistoryLoadingAtom = atom<boolean>(false)

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
    const existingSessionId = get(currentSessionIdAtom)

    // Check if the current session ID exists in the pre-overwrite list
    // (which may contain a placeholder from createSessionAtom) BEFORE
    // we replace it with the disk response.
    const previousList = get(sessionListAtom)
    const inPreviousList = existingSessionId
      ? previousList.some((session) => session.id === existingSessionId)
      : false

    // Merge: if the current session has a placeholder in the previous list
    // but isn't on disk yet, preserve the placeholder in the new list.
    const inDiskResponse = existingSessionId
      ? response.sessions.some((session) => session.id === existingSessionId)
      : false

    if (existingSessionId && inPreviousList && !inDiskResponse) {
      const placeholder = previousList.find((s) => s.id === existingSessionId)
      set(sessionListAtom, placeholder ? [placeholder, ...response.sessions] : response.sessions)
    } else {
      set(sessionListAtom, response.sessions)
    }

    set(sessionWarningsAtom, response.warnings)
    set(sessionDirectoryAtom, response.directory)

    // Current session is accounted for — either in disk response or preserved.
    if (existingSessionId && (inDiskResponse || inPreviousList)) {
      return
    }

    set(currentSessionIdAtom, response.sessions[0]?.id ?? null)
  },
)

const hydrateSessionHistoryAtom = atom(
  null,
  async (
    get,
    set,
    {
      sessionId,
      sessionPath,
      resetPlanning = true,
    }: { sessionId: string; sessionPath?: string | null; resetPlanning?: boolean },
  ) => {
    const trimmedSessionId = sessionId.trim()
    if (!trimmedSessionId) {
      return
    }

    set(sessionHistoryLoadingAtom, true)
    set(sessionHistoryErrorAtom, null)
    set(resetChatStateAtom)
    if (resetPlanning) {
      set(resetPlanningSessionStateAtom)
    }

    try {
      const resolvedSessionPath =
        sessionPath ?? get(sessionListAtom).find((session) => session.id === trimmedSessionId)?.path

      const historyResponse = await window.api.sessions.getHistory(
        trimmedSessionId,
        resolvedSessionPath,
      )

      if (!historyResponse.success) {
        set(sessionHistoryErrorAtom, historyResponse.error ?? 'Unable to load session history')
        return
      }

      for (const event of historyResponse.events) {
        set(applyChatEventAtom, event)
      }

      // History replay may leave isStreamingAtom true if the session ended
      // without a terminal event (agent_end/turn_end). Force it off — 
      // replayed history is never streaming. Also clear per-message streaming
      // flags so UI elements don't appear "in progress" after replay.
      set(isStreamingAtom, false)
      set(
        messagesAtom,
        get(messagesAtom).map((message) =>
          message.streaming ? { ...message, streaming: false } : message,
        ),
      )

      if (historyResponse.warnings.length > 0) {
        set(sessionWarningsAtom, (currentWarnings) => {
          const merged = [
            ...currentWarnings,
            ...historyResponse.warnings.map((warning) => `[history] ${warning}`),
          ]
          return Array.from(new Set(merged))
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      set(sessionHistoryErrorAtom, `Unable to load history for ${trimmedSessionId}: ${message}`)
    } finally {
      set(sessionHistoryLoadingAtom, false)
    }
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

export const initializeSessionsAtom = atom(null, async (get, set) => {
  set(sessionListLoadingAtom, true)
  set(sessionListErrorAtom, null)
  set(sessionHistoryErrorAtom, null)

  try {
    const workspace = await window.api.workspace.get()
    set(workingDirectoryAtom, workspace.path)

    const response = await window.api.sessions.list()
    set(applySessionListResponseAtom, response)

    const currentSessionId = get(currentSessionIdAtom)
    if (currentSessionId) {
      await set(hydrateSessionHistoryAtom, {
        sessionId: currentSessionId,
        resetPlanning: false,
      })
    } else {
      set(resetChatStateAtom)
      set(resetPlanningSessionStateAtom)
    }

    set(requestPlanningReloadAtom)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    set(sessionListErrorAtom, message)
  } finally {
    set(sessionListLoadingAtom, false)
  }
})

export const createSessionAtom = atom(null, async (get, set) => {
  if (get(sessionCreatingAtom)) {
    return
  }

  set(sessionCreatingAtom, true)
  set(sessionListErrorAtom, null)
  set(sessionHistoryErrorAtom, null)

  try {
    const response = await window.api.sessions.create()
    if (!response.success) {
      set(sessionListErrorAtom, response.error ?? 'Unable to create session')
      return
    }

    // Set the new session ID FIRST, then clear chat state.
    // This ensures the sidebar selection updates before the chat clears,
    // preventing any re-render from rehydrating the old session.
    const newSessionId = response.sessionId
    set(currentSessionIdAtom, newSessionId)
    set(resetChatStateAtom)
    set(resetPlanningSessionStateAtom)

    if (newSessionId) {
      // Inject a placeholder entry so the new session appears in the
      // sidebar immediately, before the file is flushed to disk.
      const now = new Date().toISOString()
      set(sessionListAtom, [
        {
          id: newSessionId,
          path: '',
          name: null,
          title: 'New session',
          model: null,
          provider: null,
          created: now,
          modified: now,
          messageCount: 0,
          firstMessagePreview: null,
        },
        ...get(sessionListAtom),
      ])
    }

    await set(refreshSessionListAtom)

    set(requestPlanningReloadAtom)
  } finally {
    set(sessionCreatingAtom, false)
  }
})

export const switchSessionAtom = atom(null, async (get, set, sessionId: string) => {
  const trimmedSessionId = sessionId.trim()
  if (!trimmedSessionId) {
    return
  }

  if (get(sessionSwitchingAtom) || get(sessionCreatingAtom)) {
    return
  }

  if (get(currentSessionIdAtom) === trimmedSessionId) {
    return
  }

  set(sessionSwitchingAtom, true)
  set(sessionListErrorAtom, null)
  set(sessionHistoryErrorAtom, null)

  try {
    const switchResponse = await window.api.sessions.switch(trimmedSessionId)
    if (!switchResponse.success) {
      set(sessionListErrorAtom, switchResponse.error ?? `Unable to switch to ${trimmedSessionId}`)
      return
    }

    const nextSessionId = switchResponse.sessionId ?? trimmedSessionId
    set(currentSessionIdAtom, nextSessionId)

    await set(hydrateSessionHistoryAtom, {
      sessionId: nextSessionId,
      sessionPath: switchResponse.sessionPath ?? null,
    })
    await set(refreshSessionListAtom)
    set(requestPlanningReloadAtom)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    set(sessionListErrorAtom, `Unable to switch session to ${trimmedSessionId}: ${message}`)
  } finally {
    set(sessionSwitchingAtom, false)
  }
})

export const pickWorkspaceAtom = atom(null, async () => {
  return window.api.workspace.pick()
})

export const switchWorkspaceAtom = atom(null, async (get, set, workspacePath: string) => {
  set(sessionListErrorAtom, null)
  set(sessionHistoryErrorAtom, null)

  try {
    const response = await window.api.workspace.set(workspacePath)
    set(workingDirectoryAtom, response.path)
    set(currentSessionIdAtom, null)
    set(resetChatStateAtom)
    set(resetPlanningSessionStateAtom)

    await set(refreshSessionListAtom)

    const currentSessionId = get(currentSessionIdAtom)
    if (currentSessionId) {
      await set(hydrateSessionHistoryAtom, { sessionId: currentSessionId })
    }

    set(requestPlanningReloadAtom)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    set(sessionListErrorAtom, `Unable to switch workspace to ${workspacePath}: ${message}`)
  }
})
