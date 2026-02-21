import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { mockProject } from '../../mock/project'
import type { ProjectSpec } from '../../types/project'
import { cn } from '../../lib/cn'
import { NotesTab } from '../right/NotesTab'
import { SpecTab } from '../right/SpecTab'
import { TabBar, type TabBarItem } from '../shared/TabBar'
import { Button } from '../ui/button'
import { ScrollArea } from '../ui/scroll-area'

type RightPanelTab = 'spec' | 'notes'

type RightPanelProps = {
  project?: ProjectSpec
  theme?: 'dark' | 'light'
  onToggleTheme?: () => void
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

export function RightPanel({ project = mockProject, theme, onToggleTheme }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<RightPanelTab>('spec')
  const [notes, setNotes] = useState(project.notes)
  const [isCollapsed, setIsCollapsed] = useState(false)

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
      <header className="flex h-14 shrink-0 items-center justify-between bg-background px-4">
        <p className="text-sm font-medium text-foreground">Right Column</p>
        <div className="flex items-center gap-2">
          {theme ? (
            <Button
              type="button"
              variant="outline"
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={onToggleTheme}
            >
              {theme === 'dark' ? 'Dark' : 'Light'}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={isCollapsed ? 'Expand right column' : 'Collapse right column'}
            onClick={() => setIsCollapsed((current) => !current)}
          >
            {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-hidden p-4 transition-[opacity] duration-200 ease-linear',
          isCollapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
        )}
      >
        <h2 className="text-2xl font-semibold tracking-tight">
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
    </div>
  )
}
