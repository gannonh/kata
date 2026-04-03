import { useState } from 'react'
import { Menu, Settings } from 'lucide-react'
import { useAtom } from 'jotai'
import { sessionSidebarOpenAtom } from '@/atoms/session'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SettingsPanel } from '../settings/SettingsPanel'
import { ChatPanel } from '../chat/ChatPanel'
import { ModelSelector } from './ModelSelector'
import { SessionSidebar } from './SessionSidebar'
import { WorkspaceIndicator } from './WorkspaceIndicator'

export function LeftPane() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sessionSidebarOpen, setSessionSidebarOpen] = useAtom(sessionSidebarOpenAtom)

  return (
    <section className="flex h-full flex-col border-r border-border bg-background">
      <div className="flex h-14 items-center justify-between gap-3 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant={sessionSidebarOpen ? 'secondary' : 'outline'}
            size="icon-sm"
            onClick={() => setSessionSidebarOpen((open) => !open)}
            title={sessionSidebarOpen ? 'Hide session history' : 'Show session history'}
            aria-label={sessionSidebarOpen ? 'Hide session history' : 'Show session history'}
          >
            <Menu />
          </Button>

          <h1 className="text-sm font-semibold tracking-wide uppercase text-foreground">Kata Desktop</h1>
          <WorkspaceIndicator />
        </div>

        <div className="flex flex-1 items-center justify-end gap-2">
          <ModelSelector />
          <Button type="button" variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings data-icon="inline-start" />
            Settings
          </Button>
        </div>
      </div>

      <Separator />

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
