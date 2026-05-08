import { useMemo } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import type { ThinkingLevel } from '@shared/types'
import { availableModelsAtom, selectedModelAtom, thinkingLevelAtom } from '@/atoms/model'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const STANDARD_LEVELS: { value: ThinkingLevel; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

const XHIGH_LEVELS: { value: ThinkingLevel; label: string }[] = [
  ...STANDARD_LEVELS,
  { value: 'xhigh', label: 'XHigh' },
]

interface ThinkingLevelToggleProps {
  compact?: boolean
  className?: string
}

export function ThinkingLevelToggle({ compact = false, className }: ThinkingLevelToggleProps) {
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
    <div className={cn(compact ? 'min-w-[8.5rem]' : 'flex items-center gap-2', className)}>
      {!compact ? (
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Thinking</span>
      ) : null}
      <Select value={thinkingLevel} onValueChange={(value) => { void handleChange(value) }}>
        <SelectTrigger size="sm" className="w-full">
          <SelectValue placeholder="Thinking" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {levels.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
