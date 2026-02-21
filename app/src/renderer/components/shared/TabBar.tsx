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
  return (
    <Tabs
      value={activeTab}
      className={className}
    >
      <TabsList
        aria-label={ariaLabel}
        className={cn('h-auto w-full justify-start gap-1 rounded-lg border border-border bg-muted p-1')}
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            disabled={tab.disabled}
            aria-disabled={tab.disabled ? 'true' : undefined}
            onClick={() => {
              if (!tab.disabled) {
                onTabChange(tab.id)
              }
            }}
            className="gap-2 px-3 py-1.5"
          >
            <span>{tab.label}</span>
            {typeof tab.count === 'number' ? (
              <Badge
                variant="secondary"
                className="rounded-sm px-1.5 py-0 text-[10px]"
              >
                {tab.count}
              </Badge>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
