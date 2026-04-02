import { useMemo } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import type { ThinkingLevel } from '@shared/types'
import { availableModelsAtom, selectedModelAtom, thinkingLevelAtom } from '@/atoms/model'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

const STANDARD_LEVELS: { value: ThinkingLevel; label: string }[] = [
  { value: 'off', label: 'off' },
  { value: 'minimal', label: 'minimal' },
  { value: 'low', label: 'low' },
  { value: 'medium', label: 'med' },
  { value: 'high', label: 'high' },
]

const XHIGH_LEVELS: { value: ThinkingLevel; label: string }[] = [
  ...STANDARD_LEVELS,
  { value: 'xhigh', label: 'xhigh' },
]

export function ThinkingLevelToggle() {
  const selectedModel = useAtomValue(selectedModelAtom)
  const availableModels = useAtomValue(availableModelsAtom)
  const [thinkingLevel, setThinkingLevel] = useAtom(thinkingLevelAtom)

  const modelInfo = useMemo(() => {
    if (!selectedModel) return null
    return availableModels.find((m) => `${m.provider}/${m.id}` === selectedModel) ?? null
  }, [selectedModel, availableModels])

  if (!modelInfo?.reasoning) return null

  const levels = modelInfo.supportsXhigh ? XHIGH_LEVELS : STANDARD_LEVELS

  const handleChange = async (nextLevel: string): Promise<void> => {
    if (!nextLevel) return
    const level = nextLevel as ThinkingLevel
    const response = await window.api.setThinkingLevel(level)
    if (response.success) {
      setThinkingLevel(level)
    }
  }

  return (
    <div className="flex items-center gap-3 border-t border-border px-4 py-1.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Thinking</span>
      <ToggleGroup
        type="single"
        value={thinkingLevel}
        onValueChange={(value) => { void handleChange(value) }}
        size="sm"
        className="h-6"
      >
        {levels.map(({ value, label }) => (
          <ToggleGroupItem
            key={value}
            value={value}
            className={cn(
              'h-6 px-2 text-[10px]',
              value === thinkingLevel && 'font-semibold',
            )}
          >
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
