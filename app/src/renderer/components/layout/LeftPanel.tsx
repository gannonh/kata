import { useMemo, useState } from 'react'

import { mockAgents } from '../../mock/agents'
import { mockGit } from '../../mock/git'
import { mockFiles } from '../../mock/files'
import { mockProject } from '../../mock/project'
import { AgentsTab } from '../left/AgentsTab'
import { ChangesTab } from '../left/ChangesTab'
import { ContextTab } from '../left/ContextTab'
import { FilesTab } from '../left/FilesTab'
import { TabBar } from '../shared/TabBar'
import { ScrollArea } from '../ui/scroll-area'

type LeftPanelTab = 'agents' | 'context' | 'changes' | 'files'

export function LeftPanel() {
  const [activeTab, setActiveTab] = useState<LeftPanelTab>('agents')

  const tabs = useMemo(
    () => [
      { id: 'agents', label: 'Agents', count: mockAgents.length },
      { id: 'context', label: 'Context', count: mockProject.tasks.length },
      { id: 'changes', label: 'Changes', count: mockGit.staged.length + mockGit.unstaged.length },
      { id: 'files', label: 'Files', count: mockFiles.length }
    ] satisfies Array<{ id: LeftPanelTab; label: string; count: number }>,
    []
  )

  return (
    <aside
      data-testid="left-panel"
      className="flex h-full min-h-0 flex-col overflow-hidden border-r bg-background p-4"
    >
      <TabBar
        ariaLabel="Left panel tabs"
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      <ScrollArea className="mt-4 min-h-0 flex-1">
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
    </aside>
  )
}
