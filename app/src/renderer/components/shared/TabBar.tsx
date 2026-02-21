import { Badge } from '../ui/badge'
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'
import { cn } from '../../lib/cn'

export type TabBarItem<TTab extends string> = {
  id: TTab
  label: string
  count?: number
  disabled?: boolean
}

type TabBarProps<TTab extends string> = {
  tabs: Array<TabBarItem<TTab>>
  activeTab: TTab
  onTabChange: (tab: TTab) => void
  ariaLabel?: string
  className?: string
}

export function TabBar<TTab extends string>({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel = 'Tabs',
  className
}: TabBarProps<TTab>) {
  const enabledTabs = tabs.filter((tab) => !tab.disabled)

  const selectAdjacentTab = (currentTab: TTab, key: string) => {
    if (enabledTabs.length === 0) {
      return
    }

    if (key === 'Home') {
      onTabChange(enabledTabs[0].id)
      return
    }

    if (key === 'End') {
      onTabChange(enabledTabs[enabledTabs.length - 1].id)
      return
    }

    const currentIndex = enabledTabs.findIndex((tab) => tab.id === currentTab)
    if (currentIndex === -1) {
      return
    }

    const direction = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1
    const nextIndex = (currentIndex + direction + enabledTabs.length) % enabledTabs.length
    onTabChange(enabledTabs[nextIndex].id)
  }

  return (
    <Tabs
      value={activeTab}
      className={className}
    >
      <TabsList
        aria-label={ariaLabel}
        className={cn('h-auto w-full justify-start gap-1 overflow-hidden rounded-lg border border-border bg-muted p-1')}
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            disabled={tab.disabled}
            onClick={() => {
              if (!tab.disabled) {
                onTabChange(tab.id)
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft' || event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
                event.preventDefault()
                selectAdjacentTab(tab.id, event.key)
              }
            }}
            className="min-w-0 flex-1"
          >
            <span className="truncate">{tab.label}</span>
            {typeof tab.count === 'number' ? (
              <Badge>
                {tab.count}
              </Badge>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
