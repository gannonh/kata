import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { SessionListResponse, SessionListItem } from '@shared/types'
import { applyChatEventAtom, isStreamingAtom, messagesAtom, resetChatStateAtom } from './chat'
import { requestPlanningReloadAtom, resetPlanningSessionStateAtom } from './planning'

const CURRENT_SESSION_STORAGE_KEY = 'kata-desktop:current-session-id'
const WORKING_DIRECTORY_STORAGE_KEY = 'kata-desktop:working-directory'
const SESSION_SIDEBAR_OPEN_STORAGE_KEY = 'kata-desktop:session-sidebar-open'
const ARCHIVED_SESSIONS_STORAGE_KEY = 'kata-desktop:archived-sessions:v1'
const UNKNOWN_WORKSPACE_LABEL = 'Unknown workspace'

export interface ArchivedSessionRecord {
  sessionId: string
  title: string
  archivedAt: string
  modified: string
  projectDir: string
}

function normalizeWorkspacePath(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  return trimmed.replace(/[\\/]+$/, '') || trimmed
}

function isArchivedForWorkspace(
  archived: ArchivedSessionRecord,
  normalizedWorkspacePath: string,
): boolean {
  return normalizeWorkspacePath(archived.projectDir) === normalizedWorkspacePath
}

export const sessionListAtom = atom<SessionListItem[]>([])
export const sessionWarningsAtom = atom<string[]>([])
export const sessionDirectoryAtom = atom<string>('')
export const sessionListLoadingAtom = atom<boolean>(false)
export const sessionListErrorAtom = atom<string | null>(null)
export const sessionHistoryErrorAtom = atom<string | null>(null)
export const sessionCreatingAtom = atom<boolean>(false)
export const sessionSwitchingAtom = atom<boolean>(false)
export const sessionHistoryLoadingAtom = atom<boolean>(false)

const sessionHistoryRequestTokenAtom = atom<number>(0)

const invalidateSessionHistoryRequestAtom = atom(null, (get, set) => {
  set(sessionHistoryRequestTokenAtom, get(sessionHistoryRequestTokenAtom) + 1)
})

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

export const archivedSessionsAtom = atomWithStorage<ArchivedSessionRecord[]>(
  ARCHIVED_SESSIONS_STORAGE_KEY,
  [],
)

export const workspaceArchivedSessionIdsAtom = atom((get) => {
  const normalizedWorkspacePath =
    normalizeWorkspacePath(get(workingDirectoryAtom)) || UNKNOWN_WORKSPACE_LABEL
  const archived = get(archivedSessionsAtom)

  return new Set(
    archived
      .filter((entry) => isArchivedForWorkspace(entry, normalizedWorkspacePath))
      .map((entry) => entry.sessionId),
  )
})

export const visibleSessionListAtom = atom((get) => {
  const archivedIds = get(workspaceArchivedSessionIdsAtom)
  return get(sessionListAtom).filter((session) => !archivedIds.has(session.id))
})

export const archivedSessionsForSettingsAtom = atom((get) =>
  [...get(archivedSessionsAtom)].sort((a, b) => b.archivedAt.localeCompare(a.archivedAt)),
)

const applySessionListResponseAtom = atom(
  null,
  (get, set, response: SessionListResponse) => {
    const existingSessionId = get(currentSessionIdAtom)

    // Check if the current session has an unsaved placeholder in the list
    // (injected by createSessionAtom before the file is flushed to disk).
    // Only placeholders (path === '') are preserved; stale persisted sessions
    // that disappeared from the disk response are not reinserted.
    const previousList = get(sessionListAtom)
    const placeholder = existingSessionId
      ? previousList.find(
          (session) => session.id === existingSessionId && session.path === '',
        )
      : undefined

    const inDiskResponse = existingSessionId
      ? response.sessions.some((session) => session.id === existingSessionId)
      : false

    const nextSessions = placeholder && !inDiskResponse
      ? [placeholder, ...response.sessions]
      : response.sessions

    set(sessionListAtom, nextSessions)
    set(sessionWarningsAtom, response.warnings)
    set(sessionDirectoryAtom, response.directory)

    const archivedSessionIds = get(workspaceArchivedSessionIdsAtom)

    // Current session is accounted for — either in disk response or preserved as placeholder.
    // If the current session is archived, fall through and pick the first visible session.
    if (existingSessionId && (inDiskResponse || Boolean(placeholder)) && !archivedSessionIds.has(existingSessionId)) {
      return
    }

    const nextVisibleSession = nextSessions.find((session) => !archivedSessionIds.has(session.id))
    set(currentSessionIdAtom, nextVisibleSession?.id ?? null)
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

    const requestToken = get(sessionHistoryRequestTokenAtom) + 1
    set(sessionHistoryRequestTokenAtom, requestToken)

    const isStaleRequest = (): boolean =>
      get(sessionHistoryRequestTokenAtom) !== requestToken ||
      get(currentSessionIdAtom) !== trimmedSessionId

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

      if (isStaleRequest()) {
        return
      }

      if (!historyResponse.success) {
        set(sessionHistoryErrorAtom, historyResponse.error ?? 'Unable to load session history')
        return
      }

      for (const event of historyResponse.events) {
        if (isStaleRequest()) {
          return
        }
        set(applyChatEventAtom, event)
      }

      if (isStaleRequest()) {
        return
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
      if (!isStaleRequest()) {
        const message = error instanceof Error ? error.message : String(error)
        set(sessionHistoryErrorAtom, `Unable to load history for ${trimmedSessionId}: ${message}`)
      }
    } finally {
      if (get(sessionHistoryRequestTokenAtom) === requestToken) {
        set(sessionHistoryLoadingAtom, false)
      }
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
  set(invalidateSessionHistoryRequestAtom)
  set(sessionHistoryLoadingAtom, false)

  try {
    const response = await window.api.sessions.create()
    if (!response.success) {
      set(sessionListErrorAtom, response.error ?? 'Unable to create session')
      return
    }

    // Set the new session ID FIRST, then clear chat state.
    // This ensures the sidebar selection updates before the chat clears,
    // preventing any re-render from rehydrating the old session.
    const newSessionId = response.sessionId ?? null
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

    // Do NOT call refreshSessionListAtom here. The new session file may not
    // be flushed to disk yet, and the refresh would trigger applySessionListResponseAtom
    // which can race with the placeholder and overwrite currentSessionIdAtom.
    // The placeholder in the list is sufficient. The next natural refresh
    // (agent_end, manual Refresh click, or session switch) will pick it up.

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
  set(invalidateSessionHistoryRequestAtom)

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

export const archiveSessionAtom = atom(
  null,
  async (get, set, session: SessionListItem) => {
    const sessionId = session.id.trim()
    if (!sessionId) {
      return
    }

    const isCurrentSession = get(currentSessionIdAtom) === sessionId
    if (isCurrentSession && get(isStreamingAtom)) {
      set(sessionListErrorAtom, 'Stop the active run before archiving this chat.')
      return
    }

    set(sessionListErrorAtom, null)

    const normalizedWorkspacePath = normalizeWorkspacePath(get(workingDirectoryAtom))
    const archivedAt = new Date().toISOString()
    const projectWorkspaceKey = normalizedWorkspacePath || UNKNOWN_WORKSPACE_LABEL
    const projectDir = projectWorkspaceKey

    set(archivedSessionsAtom, (current) => {
      const withoutExisting = current.filter(
        (entry) => !(entry.sessionId === sessionId && isArchivedForWorkspace(entry, projectWorkspaceKey)),
      )

      return [
        {
          sessionId,
          title: session.title,
          archivedAt,
          modified: session.modified,
          projectDir,
        },
        ...withoutExisting,
      ]
    })

    if (!isCurrentSession) {
      return
    }

    const archivedSessionIds = get(workspaceArchivedSessionIdsAtom)
    const nextSession = get(sessionListAtom).find((entry) => !archivedSessionIds.has(entry.id))

    if (nextSession) {
      await set(switchSessionAtom, nextSession.id)
      return
    }

    set(currentSessionIdAtom, null)
    set(resetChatStateAtom)
    set(resetPlanningSessionStateAtom)
  },
)

export const unarchiveSessionAtom = atom(
  null,
  (_get, set, { sessionId, projectDir }: { sessionId: string; projectDir: string }) => {
    const trimmedSessionId = sessionId.trim()
    const normalizedProjectDir = normalizeWorkspacePath(projectDir)

    set(archivedSessionsAtom, (current) =>
      current.filter(
        (entry) => !(entry.sessionId === trimmedSessionId && isArchivedForWorkspace(entry, normalizedProjectDir)),
      ),
    )
  },
)

export const pickWorkspaceAtom = atom(null, async () => {
  return window.api.workspace.pick()
})

export const switchWorkspaceAtom = atom(null, async (get, set, workspacePath: string) => {
  set(sessionListErrorAtom, null)
  set(sessionHistoryErrorAtom, null)
  set(invalidateSessionHistoryRequestAtom)
  set(sessionHistoryLoadingAtom, false)

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
