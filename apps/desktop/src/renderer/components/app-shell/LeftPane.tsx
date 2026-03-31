import { useState } from 'react'
import { SettingsPanel } from '../settings/SettingsPanel'
import { ChatPanel } from '../chat/ChatPanel'
import { ModelSelector } from './ModelSelector'

export function LeftPane() {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <section className="h-full border-r border-slate-800 bg-slate-950">
      <div className="flex h-14 items-center justify-between gap-3 border-b border-slate-800 px-4">
        <h1 className="text-sm font-semibold tracking-wide uppercase text-slate-200">Kata Desktop</h1>

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

      <ChatPanel />

      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />
    </section>
  )
}
