import { type ComponentType, useMemo, useState } from 'react'
import { ChevronDown, Folder, GitBranch, Layers3, PanelLeftClose, PanelLeftOpen, Users } from 'lucide-react'

import logoDark from '../../assets/brand/icon-dark.svg'
import logoLight from '../../assets/brand/icon-light.svg'
import { mockAgents } from '../../mock/agents'
import { mockFiles } from '../../mock/files'
import { mockGit } from '../../mock/git'
import { mockProject } from '../../mock/project'
import { AgentsTab } from '../left/AgentsTab'
import { ChangesTab } from '../left/ChangesTab'
import { ContextTab } from '../left/ContextTab'
import { FilesTab } from '../left/FilesTab'
import { cn } from '../../lib/cn'
import { Button } from '../ui/button'
import { ScrollArea } from '../ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'

type LeftPanelTab = 'agents' | 'context' | 'changes' | 'files'

type LeftPanelProps = {
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

export function LeftPanel({ collapsed, onCollapsedChange }: LeftPanelProps = {}) {
  const [activeTab, setActiveTab] = useState<LeftPanelTab>('agents')
  const [internalCollapsed, setInternalCollapsed] = useState(false)

  const isSidebarCollapsed = collapsed ?? internalCollapsed

  const setSidebarCollapsed = (nextCollapsed: boolean) => {
    if (collapsed === undefined) {
      setInternalCollapsed(nextCollapsed)
    }
    onCollapsedChange?.(nextCollapsed)
  }

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
        className="grid min-h-0 w-full transition-[grid-template-columns] duration-200 ease-linear"
        style={{
          gridTemplateColumns: isSidebarCollapsed ? '3.5rem 0px' : '3.5rem minmax(0,1fr)'
        }}
      >
        <div className="flex h-full w-14 flex-col border-r border-border bg-background">
          <div className="flex h-14 items-center justify-center border-b border-border">
            {isSidebarCollapsed ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Expand sidebar navigation"
                onClick={() => setSidebarCollapsed(false)}
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            ) : (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-md bg-muted/40"
                aria-label="Kata logo"
              >
                <img
                  src={logoDark}
                  alt="Kata logo"
                  className="hidden h-6 w-6 dark:block"
                />
                <img
                  src={logoLight}
                  alt="Kata logo"
                  className="block h-6 w-6 dark:hidden"
                />
              </div>
            )}
          </div>

          <TabsList
            aria-label="Left panel modules"
            className="h-full w-full flex-col justify-start gap-2 rounded-none bg-background p-2"
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
        </div>

        <div
          data-testid="left-panel-content"
          aria-hidden={isSidebarCollapsed}
          className={cn(
            'min-w-0 overflow-hidden transition-[opacity] duration-200 ease-linear',
            isSidebarCollapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
          )}
        >
          <header className="flex h-14 items-center justify-between border-b border-border px-4">
            <p className="flex items-center gap-1 text-sm font-semibold">
              Kata Orchestrator
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Collapse sidebar navigation"
              onClick={() => setSidebarCollapsed(true)}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </header>
          <ScrollArea className="h-[calc(100%-3.5rem)] p-4">
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
