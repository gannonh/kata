import { useCallback } from 'react'
import { Plus, RefreshCw, Settings } from 'lucide-react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  createSessionAtom,
  currentSessionIdAtom,
  refreshSessionListAtom,
  sessionCreatingAtom,
  sessionListAtom,
  sessionListErrorAtom,
  sessionListLoadingAtom,
  sessionSwitchingAtom,
  sessionWarningsAtom,
  switchSessionAtom,
} from '@/atoms/session'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { SessionListItem } from './SessionListItem'

interface SessionSidebarProps {
  open: boolean
  onOpenSettings: () => void
}

export function SessionSidebar({ open, onOpenSettings }: SessionSidebarProps) {
  const sessions = useAtomValue(sessionListAtom)
  const currentSessionId = useAtomValue(currentSessionIdAtom)
  const loading = useAtomValue(sessionListLoadingAtom)
  const creatingSession = useAtomValue(sessionCreatingAtom)
  const switchingSession = useAtomValue(sessionSwitchingAtom)
  const error = useAtomValue(sessionListErrorAtom)
  const warnings = useAtomValue(sessionWarningsAtom)

  const createSession = useSetAtom(createSessionAtom)
  const switchSession = useSetAtom(switchSessionAtom)
  const refreshSessions = useSetAtom(refreshSessionListAtom)

  const handleSelectSession = useCallback((sessionId: string) => {
    void switchSession(sessionId)
  }, [switchSession])

  if (!open) {
    return null
  }

  return (
    <aside className="flex h-full w-[17rem] shrink-0 flex-col overflow-hidden border-r border-border bg-background/80">
      <div className="flex min-w-0 flex-col gap-2 p-3">
        <Button
          type="button"
          onClick={() => {
            void createSession()
          }}
          disabled={creatingSession || switchingSession}
          className="w-full"
        >
          <Plus data-icon="inline-start" />
          {creatingSession ? 'Creating…' : 'New Session'}
        </Button>

        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary" className="font-normal">
            {sessions.length} sessions
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => {
              void refreshSessions()
            }}
            disabled={switchingSession}
          >
            <RefreshCw data-icon="inline-start" />
            Refresh
          </Button>
        </div>

        {switchingSession && (
          <p className="text-[10px] text-muted-foreground">Switching session…</p>
        )}

        {warnings.length > 0 && (
          <p className="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">
            {warnings.length} corrupted session file{warnings.length === 1 ? '' : 's'} skipped
          </p>
        )}
      </div>

      <Separator />

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-w-0 flex-col gap-1.5 overflow-hidden p-2">
          {loading && <p className="p-2 text-xs text-muted-foreground">Loading sessions…</p>}

          {!loading && error && (
            <p className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200">
              Unable to load sessions: {error}
            </p>
          )}

          {!loading && !error && sessions.length === 0 && (
            <p className="p-2 text-xs text-muted-foreground">No sessions for this workspace yet.</p>
          )}

          {sessions.map((session) => (
            <SessionListItem
              key={session.id}
              session={session}
              isCurrent={session.id === currentSessionId}
              disabled={switchingSession || creatingSession}
              onSelect={handleSelectSession}
            />
          ))}
        </div>
      </ScrollArea>

      <Separator />

      <div className="p-3">
        <Button type="button" variant="outline" className="w-full" onClick={onOpenSettings}>
          <Settings data-icon="inline-start" />
          Settings
        </Button>
      </div>
    </aside>
  )
}
