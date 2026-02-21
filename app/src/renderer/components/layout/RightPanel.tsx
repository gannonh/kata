import { useEffect, useMemo, useState } from 'react'

import { mockProject } from '../../mock/project'
import type { ProjectSpec } from '../../types/project'
import { NotesTab } from '../right/NotesTab'
import { SpecTab } from '../right/SpecTab'
import { TabBar, type TabBarItem } from '../shared/TabBar'
import { ScrollArea } from '../ui/scroll-area'

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
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Right Column
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">
        Spec
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{project.name}</p>
      <TabBar
        className="mt-4"
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        ariaLabel="Right panel tabs"
      />
      <ScrollArea className="mt-4 min-h-0 flex-1 pr-2">{activeContent}</ScrollArea>
    </div>
  )
}
