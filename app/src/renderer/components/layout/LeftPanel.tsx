import { type ComponentType, useMemo, useState } from 'react'
import { ChevronDown, Folder, GitBranch, Layers3, PanelLeftClose, PanelLeftOpen, Users } from 'lucide-react'

import logoDark from '../../assets/brand/icon-dark.svg'
import logoLight from '../../assets/brand/icon-light.svg'
import { mockAgents } from '../../mock/agents'
import { mockFiles } from '../../mock/files'
import { mockGit } from '../../mock/git'
import { getMockProject } from '../../mock/project'
import { AgentsTab } from '../left/AgentsTab'
import { ChangesTab, getChangesTabCount } from '../left/ChangesTab'
import { ContextTab, getContextTabCount } from '../left/ContextTab'
import { FilesTab } from '../left/FilesTab'
import { LeftStatusSection } from '../left/LeftStatusSection'
import { ErrorBoundary } from '../shared/ErrorBoundary'
import { cn } from '../../lib/cn'
import { Button } from '../ui/button'
import { ScrollArea } from '../ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'

type LeftPanelTab = 'agents' | 'context' | 'changes' | 'files'

type LeftPanelProps = {
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

export type PreviewState = 0 | 1 | 2 | 3
type PreviewTasksByState = Record<Exclude<PreviewState, 0>, ReturnType<typeof getMockProject>['tasks']>

const previewTasks = {
  1: [
    { id: 'preview-1-1', title: 'Model project scope', status: 'done' as const },
    { id: 'preview-1-2', title: 'Create baseline tasks', status: 'done' as const },
    { id: 'preview-1-3', title: 'Wire layout sections', status: 'in_progress' as const },
    { id: 'preview-1-4', title: 'Connect tabs', status: 'todo' as const },
    { id: 'preview-1-5', title: 'Finalize shell copy', status: 'todo' as const }
  ],
  2: [
    { id: 'preview-2-1', title: 'Model project scope', status: 'done' as const },
    { id: 'preview-2-2', title: 'Create baseline tasks', status: 'done' as const },
    { id: 'preview-2-3', title: 'Wire layout sections', status: 'done' as const },
    { id: 'preview-2-4', title: 'Connect tabs', status: 'in_progress' as const },
    { id: 'preview-2-5', title: 'Finalize shell copy', status: 'todo' as const }
  ],
  3: [
    { id: 'preview-3-1', title: 'Model project scope', status: 'done' as const },
    { id: 'preview-3-2', title: 'Create baseline tasks', status: 'done' as const },
    { id: 'preview-3-3', title: 'Wire layout sections', status: 'done' as const },
    { id: 'preview-3-4', title: 'Connect tabs', status: 'done' as const },
    { id: 'preview-3-5', title: 'Finalize shell copy', status: 'in_progress' as const }
  ]
} satisfies PreviewTasksByState

// @scaffold -- preview state cycling is development-only UI
const PREVIEW_CYCLE: Record<PreviewState, PreviewState> = { 0: 1, 1: 2, 2: 3, 3: 0 }

function nextPreviewState(current: PreviewState): PreviewState {
  return PREVIEW_CYCLE[current] ?? 0
}

export function LeftPanel({ collapsed, onCollapsedChange }: LeftPanelProps = {}) {
  const [activeTab, setActiveTab] = useState<LeftPanelTab>('agents')
  const [internalCollapsed, setInternalCollapsed] = useState(false)
  const [previewState, setPreviewState] = useState<PreviewState>(0)
  const project = useMemo(() => getMockProject(), [])
  const statusTasks = previewState === 0 ? project.tasks : previewTasks[previewState]
  const contextTabCount = getContextTabCount(previewState, project.tasks.length)
  const changesTabCount = getChangesTabCount(previewState, mockGit)

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
      { id: 'context', label: 'Context', icon: Layers3, count: contextTabCount },
      { id: 'changes', label: 'Changes', icon: GitBranch, count: changesTabCount },
      { id: 'files', label: 'Files', icon: Folder, count: mockFiles.length }
    ] satisfies Array<{ id: LeftPanelTab; label: string; icon: ComponentType<{ className?: string }>; count: number }>,
    [changesTabCount, contextTabCount]
  )

  return (
    <aside
      data-testid="left-panel"
      className="flex h-full min-h-0 overflow-hidden bg-background"
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
          <div className="flex h-14 items-center justify-center">
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
            'flex min-w-0 flex-col overflow-hidden transition-[opacity] duration-200 ease-linear',
            isSidebarCollapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
          )}
        >
          <header className="flex h-14 items-center justify-between pl-4 pr-2">
            <p className="flex items-center gap-1 text-sm font-semibold">
              Kata Orchestrator
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="-mr-2"
              aria-label="Collapse sidebar navigation"
              onClick={() => setSidebarCollapsed(true)}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </header>
          <ErrorBoundary fallback={<p className="px-4 py-3 text-sm text-muted-foreground">Unable to load status.</p>}>
            <LeftStatusSection
              title={project.sessionTitle}
              subtitle={project.repositorySubtitle}
              tasks={statusTasks}
              previewState={previewState}
              onCyclePreviewState={() => setPreviewState((current) => nextPreviewState(current))}
              onSelectPreviewState={(state) => setPreviewState(state)}
            />
          </ErrorBoundary>
          <ScrollArea className="min-h-0 flex-1">
            <div className="py-4 pl-4 pr-2">
              {activeTab === 'agents' ? (
                <AgentsTab agents={mockAgents} />
              ) : null}
              {activeTab === 'context' ? (
                <ContextTab
                  project={project}
                  previewState={previewState}
                />
              ) : null}
              {activeTab === 'changes' ? (
                <ChangesTab
                  git={mockGit}
                  previewState={previewState}
                />
              ) : null}
              {activeTab === 'files' ? (
                <FilesTab files={mockFiles} />
              ) : null}
            </div>
          </ScrollArea>
        </div>
      </Tabs>
    </aside>
  )
}
