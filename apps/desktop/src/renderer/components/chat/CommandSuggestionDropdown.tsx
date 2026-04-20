import { useEffect, useState } from 'react'
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
  anchorRef: RefObject<HTMLElement | null>
  isOpen?: boolean
  isLoading?: boolean
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
  anchorRef,
  isOpen,
  isLoading = false,
}: CommandSuggestionDropdownProps) {
  const visible = isOpen ?? (isLoading || suggestions.length > 0)
  const [position, setPosition] = useState<AnchorPosition>(DEFAULT_POSITION)

  useEffect(() => {
    if (!visible) {
      return
    }

    let resizeObserver: ResizeObserver | undefined

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

    const anchor = anchorRef.current
    if (anchor && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updatePosition()
      })
      resizeObserver.observe(anchor)
    }

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      resizeObserver?.disconnect()
    }
  }, [anchorRef, visible])

  if (!visible) {
    return null
  }

  return (
    <div
      className="z-50"
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
          {isLoading ? (
            <div role="status" className="px-2 py-4 text-center text-sm text-muted-foreground">
              Loading commands…
            </div>
          ) : suggestions.length === 0 ? (
            <CommandEmpty>No commands found</CommandEmpty>
          ) : (
            <CommandGroup>
              {suggestions.map((suggestion, index) => (
                <CommandItem
                  id={`command-suggestion-${index}`}
                  key={suggestion.name}
                  role="option"
                  aria-selected={selectedIndex === index}
                  className={cn(selectedIndex === index && 'bg-muted text-foreground')}
                  onMouseDown={(event) => {
                    event.preventDefault()
                  }}
                  onSelect={() => {
                    onSelect(suggestion)
                  }}
                >
                  <span className="truncate">{suggestion.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  )
}
