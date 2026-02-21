import { type ComponentType, useMemo, useState } from 'react'
import { Folder, GitBranch, Layers3, Users } from 'lucide-react'

import { mockAgents } from '../../mock/agents'
import { mockFiles } from '../../mock/files'
import { mockGit } from '../../mock/git'
import { mockProject } from '../../mock/project'
import { AgentsTab } from '../left/AgentsTab'
import { ChangesTab } from '../left/ChangesTab'
import { ContextTab } from '../left/ContextTab'
import { FilesTab } from '../left/FilesTab'
import { ScrollArea } from '../ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'

type LeftPanelTab = 'agents' | 'context' | 'changes' | 'files'

export function LeftPanel() {
  const [activeTab, setActiveTab] = useState<LeftPanelTab>('agents')

  const tabs = useMemo(
    () => [
      { id: 'agents', label: 'Agents', icon: Users, count: mockAgents.length },
      { id: 'context', label: 'Context', icon: Layers3, count: mockProject.tasks.length },
      { id: 'changes', label: 'Changes', icon: GitBranch, count: mockGit.staged.length + mockGit.unstaged.length },
      { id: 'files', label: 'Files', icon: Folder, count: mockFiles.length }
    ] satisfies Array<{ id: LeftPanelTab; label: string; icon: ComponentType<{ className?: string }>; count: number }>,
    []
  )

  return (
    <aside
      data-testid="left-panel"
      className="flex h-full min-h-0 overflow-hidden border-r bg-background"
    >
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as LeftPanelTab)}
        className="flex min-h-0 w-full"
      >
        <TabsList
          aria-label="Left panel modules"
          className="h-full w-14 flex-col justify-start gap-2 rounded-none border-r border-border bg-background p-2"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="h-10 w-10 flex-none p-0"
                title={`${tab.label} (${tab.count})`}
                aria-label={tab.label}
              >
                <Icon className="h-4 w-4" />
                <span className="sr-only">{tab.label}</span>
              </TabsTrigger>
            )
          })}
        </TabsList>

        <div className="min-w-0 flex-1 p-4">
          <ScrollArea className="min-h-0 h-full">
            {activeTab === 'agents' ? (
              <AgentsTab agents={mockAgents} />
            ) : null}
            {activeTab === 'context' ? (
              <ContextTab project={mockProject} />
            ) : null}
            {activeTab === 'changes' ? (
              <ChangesTab git={mockGit} />
            ) : null}
            {activeTab === 'files' ? (
              <FilesTab files={mockFiles} />
            ) : null}
          </ScrollArea>
        </div>
      </Tabs>
    </aside>
  )
}
