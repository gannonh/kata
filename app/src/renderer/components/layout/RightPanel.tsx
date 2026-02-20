import { useEffect, useMemo, useState } from 'react'

import { mockProject } from '../../mock/project'
import type { ProjectSpec } from '../../types/project'
import { NotesTab } from '../right/NotesTab'
import { SpecTab } from '../right/SpecTab'
import { TabBar, type TabBarItem } from '../shared/TabBar'

type RightPanelTab = 'spec' | 'notes'

type RightPanelProps = {
  project?: ProjectSpec
}

const tabs: Array<TabBarItem<RightPanelTab>> = [
  {
    id: 'spec',
    label: 'Spec'
  },
  {
    id: 'notes',
    label: 'Notes'
  }
]

export function RightPanel({ project = mockProject }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<RightPanelTab>('spec')
  const [notes, setNotes] = useState(project.notes)

  useEffect(() => {
    setNotes(project.notes)
  }, [project.id, project.notes])

  const activeContent = useMemo(() => {
    if (activeTab === 'notes') {
      return (
        <NotesTab
          notes={notes}
          onNotesChange={setNotes}
        />
      )
    }

    return <SpecTab project={project} />
  }, [activeTab, notes, project])

  return (
    <div className="flex h-full flex-col">
      <p className="font-display text-xs uppercase tracking-[0.32em] text-[color:var(--text-muted)]">
        Right Column
      </p>
      <h2 className="mt-4 font-display text-3xl uppercase tracking-[0.08em] text-[color:var(--text-primary)]">
        Spec
      </h2>
      <p className="mt-2 font-body text-sm text-[color:var(--text-secondary)]">{project.name}</p>
      <TabBar
        className="mt-5"
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        ariaLabel="Right panel tabs"
      />
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">{activeContent}</div>
    </div>
  )
}
