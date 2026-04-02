import { useState } from 'react'
import { ProviderAuthPanel } from './ProviderAuthPanel'

type SettingsTab = 'providers' | 'general' | 'appearance'

interface SettingsPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsPanel({ open, onOpenChange }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('providers')

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6 backdrop-blur-sm">
      <div className="flex h-[min(48rem,90vh)] w-[min(70rem,95vw)] flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-700 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-100">Settings</h2>
            <p className="text-xs text-slate-400">Manage providers, preferences, and desktop defaults.</p>
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-slate-600 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"
          >
            Close
          </button>
        </header>

        <div className="grid flex-1 overflow-hidden md:grid-cols-[12rem_minmax(0,1fr)]">
          <nav className="border-r border-slate-700 bg-slate-950/40 p-3">
            <div className="space-y-1 text-xs">
              {[
                { id: 'providers', label: 'Providers' },
                { id: 'general', label: 'General' },
                { id: 'appearance', label: 'Appearance' },
              ].map((tab) => {
                const id = tab.id as SettingsTab
                const active = activeTab === id

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={`w-full rounded-md px-3 py-2 text-left transition ${
                      active
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-300 hover:bg-slate-800/50'
                    }`}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </nav>

          <section className="overflow-auto p-4">
            {activeTab === 'providers' && <ProviderAuthPanel />}

            {activeTab === 'general' && (
              <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-300">
                <p className="font-semibold text-slate-100">General settings</p>
                <p className="mt-2 text-xs text-slate-400">Additional preferences will be added in a future slice.</p>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-300">
                <p className="font-semibold text-slate-100">Appearance</p>
                <p className="mt-2 text-xs text-slate-400">Theme and typography controls are coming in a future slice.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
