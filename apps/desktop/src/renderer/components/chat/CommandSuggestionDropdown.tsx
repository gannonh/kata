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
  maxHeight: number
  placement: 'above' | 'below'
}

const VIEWPORT_MARGIN = 8
const DROPDOWN_OFFSET = 4
const MAX_DROPDOWN_HEIGHT = 288
const MIN_DROPDOWN_HEIGHT = 120

const DEFAULT_POSITION: AnchorPosition = {
  top: 0,
  left: 0,
  width: 320,
  maxHeight: MAX_DROPDOWN_HEIGHT,
  placement: 'below',
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
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight

      const width = Math.min(rect.width, Math.max(240, viewportWidth - VIEWPORT_MARGIN * 2))
      const left = Math.min(
        Math.max(rect.left, VIEWPORT_MARGIN),
        viewportWidth - width - VIEWPORT_MARGIN,
      )

      const desiredHeight = Math.min(
        MAX_DROPDOWN_HEIGHT,
        Math.max(MIN_DROPDOWN_HEIGHT, (isLoading ? 1 : Math.max(suggestions.length, 1)) * 40 + 16),
      )
      const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_MARGIN - DROPDOWN_OFFSET
      const spaceAbove = rect.top - VIEWPORT_MARGIN - DROPDOWN_OFFSET

      const placement: AnchorPosition['placement'] =
        spaceBelow >= desiredHeight || spaceBelow >= spaceAbove ? 'below' : 'above'

      const availableHeight = placement === 'below' ? spaceBelow : spaceAbove
      const maxHeight = Math.max(
        MIN_DROPDOWN_HEIGHT,
        Math.min(MAX_DROPDOWN_HEIGHT, availableHeight),
      )

      setPosition({
        top: placement === 'below' ? rect.bottom + DROPDOWN_OFFSET : rect.top - DROPDOWN_OFFSET,
        left,
        width,
        maxHeight,
        placement,
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
  }, [anchorRef, isLoading, suggestions.length, visible])

  if (!visible) {
    return null
  }

  return (
    <div
      data-testid="command-suggestion-dropdown"
      className={cn('z-50', position.placement === 'above' && '-translate-y-full')}
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
        <CommandList id="command-suggestion-listbox" style={{ maxHeight: `${position.maxHeight}px` }}>
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
