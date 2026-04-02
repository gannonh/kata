import { useEffect, useState } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { initializeSessionsAtom, sessionSidebarOpenAtom } from '@/atoms/session'
import { SettingsPanel } from '../settings/SettingsPanel'
import { ChatPanel } from '../chat/ChatPanel'
import { ModelSelector } from './ModelSelector'
import { SessionSidebar } from './SessionSidebar'
import { WorkspaceIndicator } from './WorkspaceIndicator'

export function LeftPane() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sessionSidebarOpen, setSessionSidebarOpen] = useAtom(sessionSidebarOpenAtom)
  const initializeSessions = useSetAtom(initializeSessionsAtom)

  useEffect(() => {
    void initializeSessions()
  }, [initializeSessions])

  return (
    <section className="flex h-full flex-col border-r border-slate-800 bg-slate-950">
      <div className="flex h-14 items-center justify-between gap-3 border-b border-slate-800 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setSessionSidebarOpen((open) => !open)}
            className="inline-flex h-8 items-center rounded-md border border-slate-700 px-2 text-xs text-slate-200 hover:bg-slate-800"
            title={sessionSidebarOpen ? 'Hide session history' : 'Show session history'}
          >
            ☰
          </button>

          <h1 className="text-sm font-semibold tracking-wide uppercase text-slate-200">Kata Desktop</h1>
          <WorkspaceIndicator />
        </div>

        <div className="flex flex-1 items-center justify-end gap-3">
          <ModelSelector />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex h-8 items-center rounded-md border border-slate-700 px-3 text-xs text-slate-200 hover:bg-slate-800"
          >
            ⚙ Settings
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <SessionSidebar open={sessionSidebarOpen} />

        <div className="min-h-0 min-w-0 flex-1">
          <ChatPanel />
        </div>
      </div>

      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />
    </section>
  )
}
