import { useAtomValue, useSetAtom } from 'jotai'
import {
  createSessionAtom,
  currentSessionIdAtom,
  refreshSessionListAtom,
  sessionCreatingAtom,
  sessionListAtom,
  sessionListErrorAtom,
  sessionListLoadingAtom,
  sessionWarningsAtom,
} from '@/atoms/session'
import { SessionListItem } from './SessionListItem'

interface SessionSidebarProps {
  open: boolean
}

export function SessionSidebar({ open }: SessionSidebarProps) {
  const sessions = useAtomValue(sessionListAtom)
  const currentSessionId = useAtomValue(currentSessionIdAtom)
  const loading = useAtomValue(sessionListLoadingAtom)
  const creatingSession = useAtomValue(sessionCreatingAtom)
  const error = useAtomValue(sessionListErrorAtom)
  const warnings = useAtomValue(sessionWarningsAtom)

  const createSession = useSetAtom(createSessionAtom)
  const refreshSessions = useSetAtom(refreshSessionListAtom)

  if (!open) {
    return null
  }

  return (
    <aside className="flex h-full w-[16rem] shrink-0 flex-col border-r border-slate-800 bg-slate-950/80">
      <div className="border-b border-slate-800 p-3">
        <button
          type="button"
          onClick={() => {
            void createSession()
          }}
          disabled={creatingSession}
          className="inline-flex w-full items-center justify-center rounded-md bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {creatingSession ? 'Creating…' : '+ New Session'}
        </button>

        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
          <span>{sessions.length} sessions</span>
          <button
            type="button"
            onClick={() => {
              void refreshSessions()
            }}
            className="rounded border border-slate-700 px-1.5 py-0.5 hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>

        <p className="mt-2 text-[10px] text-slate-500">Session switching is not available yet in Desktop.</p>

        {warnings.length > 0 && (
          <p className="mt-2 rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">
            {warnings.length} corrupted session file{warnings.length === 1 ? '' : 's'} skipped
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && <p className="p-2 text-xs text-slate-400">Loading sessions…</p>}

        {!loading && error && (
          <p className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200">
            Unable to load sessions: {error}
          </p>
        )}

        {!loading && !error && sessions.length === 0 && (
          <p className="p-2 text-xs text-slate-400">No sessions for this workspace yet.</p>
        )}

        <div className="space-y-2">
          {sessions.map((session) => (
            <SessionListItem
              key={session.id}
              session={session}
              isCurrent={session.id === currentSessionId}
            />
          ))}
        </div>
      </div>
    </aside>
  )
}
