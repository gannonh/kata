import { useEffect } from 'react'
import { useAtom } from 'jotai'
import type { PermissionMode } from '@shared/types'
import { permissionModeAtom } from '@/atoms/permissions'

const OPTIONS: Array<{
  value: PermissionMode
  label: string
  icon: string
  description: string
}> = [
  {
    value: 'explore',
    label: 'Explore',
    icon: '🔍',
    description: 'Block file-changing confirms',
  },
  {
    value: 'ask',
    label: 'Ask',
    icon: '❓',
    description: 'Prompt for confirm requests',
  },
  {
    value: 'auto',
    label: 'Auto',
    icon: '⚡',
    description: 'Auto-approve confirm requests',
  },
]

export function PermissionModeSelector() {
  const [mode, setMode] = useAtom(permissionModeAtom)

  useEffect(() => {
    void window.api.setPermissionMode(mode).catch((error: unknown) => {
      console.error('[PermissionModeSelector] failed to update bridge permission mode', error)
    })
  }, [mode])

  return (
    <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-1" role="radiogroup" aria-label="Permission mode">
      {OPTIONS.map((option) => {
        const selected = option.value === mode

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.description}
            onClick={() => setMode(option.value)}
            className={`rounded px-2.5 py-1 text-xs transition ${
              selected
                ? 'bg-slate-100 text-slate-900'
                : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
            }`}
          >
            <span className="mr-1" aria-hidden="true">
              {option.icon}
            </span>
            {option.label}
          </button>
        )}
      )}
    </div>
  )
}
