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
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex items-center gap-2 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-elevated)] p-1', className)}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={tab.disabled ? 'true' : undefined}
            disabled={tab.disabled}
            onClick={() => {
              if (!tab.disabled) {
                onTabChange(tab.id)
              }
            }}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 font-body text-sm transition-colors',
              isActive
                ? 'bg-[color:var(--line-strong)] text-[color:var(--text-primary)]'
                : 'text-[color:var(--text-secondary)] hover:bg-[color:var(--line)]/40',
              tab.disabled && 'cursor-not-allowed opacity-50'
            )}
          >
            <span>{tab.label}</span>
            {typeof tab.count === 'number' ? (
              <span className="rounded-md bg-[color:var(--line)]/60 px-1.5 py-0.5 text-xs text-[color:var(--text-primary)]">
                {tab.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
