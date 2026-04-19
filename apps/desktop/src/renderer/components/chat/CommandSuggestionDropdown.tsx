import { useEffect, useMemo, useState } from 'react'
import type { RefObject } from 'react'
import type { SlashCommandEntry } from '@shared/types'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'

interface CommandSuggestionDropdownProps {
  suggestions: SlashCommandEntry[]
  selectedIndex: number
  onSelect: (command: SlashCommandEntry) => void
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  isOpen?: boolean
}

interface AnchorPosition {
  top: number
  left: number
  width: number
}

const DEFAULT_POSITION: AnchorPosition = {
  top: 0,
  left: 0,
  width: 320,
}

export function CommandSuggestionDropdown({
  suggestions,
  selectedIndex,
  onSelect,
  onClose,
  anchorRef,
  isOpen,
}: CommandSuggestionDropdownProps) {
  const visible = isOpen ?? suggestions.length > 0
  const [position, setPosition] = useState<AnchorPosition>(DEFAULT_POSITION)

  const activeDescendant = useMemo(() => {
    if (suggestions.length === 0 || selectedIndex < 0 || selectedIndex >= suggestions.length) {
      return undefined
    }

    return `command-suggestion-${selectedIndex}`
  }, [selectedIndex, suggestions.length])

  useEffect(() => {
    if (!visible) {
      return
    }

    const updatePosition = () => {
      const anchor = anchorRef.current
      if (!anchor) {
        return
      }

      const rect = anchor.getBoundingClientRect()
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchorRef, visible])

  useEffect(() => {
    if (!visible) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, visible])

  if (!visible) {
    return null
  }

  return (
    <div
      className="z-50"
      role="combobox"
      aria-expanded={visible}
      aria-controls="command-suggestion-listbox"
      aria-activedescendant={activeDescendant}
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${position.width}px`,
      }}
    >
      <Command
        className="border border-border shadow-lg"
        value={suggestions[selectedIndex]?.name ?? ''}
        onValueChange={() => {}}
      >
        <CommandList id="command-suggestion-listbox">
          {suggestions.length === 0 ? (
            <CommandEmpty>No commands found</CommandEmpty>
          ) : (
            <CommandGroup>
              {suggestions.map((suggestion, index) => (
                <CommandItem
                  key={suggestion.name}
                  role="option"
                  aria-selected={selectedIndex === index}
                  data-selected={selectedIndex === index ? 'true' : 'false'}
                  className={cn(selectedIndex === index && 'bg-muted text-foreground')}
                  onMouseDown={(event) => {
                    event.preventDefault()
                  }}
                  onSelect={() => {
                    onSelect(suggestion)
                  }}
                >
                  <span id={`command-suggestion-${index}`} className="truncate">
                    {suggestion.name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  )
}
