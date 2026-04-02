import { useEffect } from 'react'
import { useAtom } from 'jotai'
import { HelpCircle, Search, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PermissionMode } from '@shared/types'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { permissionModeAtom } from '@/atoms/permissions'

const OPTIONS: Array<{
  value: PermissionMode
  label: string
  icon: LucideIcon
  description: string
}> = [
  {
    value: 'explore',
    label: 'Explore',
    icon: Search,
    description: 'Block file-changing confirms',
  },
  {
    value: 'ask',
    label: 'Ask',
    icon: HelpCircle,
    description: 'Prompt for confirm requests',
  },
  {
    value: 'auto',
    label: 'Auto',
    icon: Zap,
    description: 'Auto-approve confirm requests',
  },
]

function isPermissionMode(value: string): value is PermissionMode {
  return value === 'explore' || value === 'ask' || value === 'auto'
}

export function PermissionModeSelector() {
  const [mode, setMode] = useAtom(permissionModeAtom)

  useEffect(() => {
    void window.api.setPermissionMode(mode).catch((error: unknown) => {
      console.error('[PermissionModeSelector] failed to update bridge permission mode', error)
    })
  }, [mode])

  return (
    <ToggleGroup
      type="single"
      value={mode}
      variant="outline"
      size="sm"
      spacing={1}
      className="rounded-lg border border-border bg-card p-1"
      aria-label="Permission mode"
      onValueChange={(value) => {
        if (isPermissionMode(value)) {
          setMode(value)
        }
      }}
    >
      {OPTIONS.map((option) => {
        const selected = option.value === mode
        const Icon = option.icon

        return (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            aria-label={option.label}
            title={option.description}
            className={cn('px-2.5 text-xs', selected && 'bg-muted text-foreground')}
          >
            <Icon data-icon="inline-start" />
            {option.label}
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}
