import * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as ReactDOM from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * AcceptPlanDropdown - Dropdown for accepting plans with or without compaction
 *
 * Provides two options:
 * 1. Accept - Execute the plan immediately
 * 2. Accept & Compact - Summarize conversation first, then execute
 *
 * The compact option is useful when context is running low after a long planning session.
 */

interface AcceptPlanDropdownProps {
  /** Callback when user selects "Accept" (execute immediately) */
  onAccept: () => void
  /** Callback when user selects "Accept & Compact" (compact first, then execute) */
  onAcceptWithCompact: () => void
  /** Additional className for the trigger button */
  className?: string
}

export function AcceptPlanDropdown({
  onAccept,
  onAcceptWithCompact,
  className,
}: AcceptPlanDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Calculate menu position relative to trigger
  // Prefers below the button, falls back to above if insufficient space
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return

    const rect = triggerRef.current.getBoundingClientRect()
    const menuWidth = 280
    const menuHeight = 120 // Approximate height for 2 items with subtitles
    const gap = 4

    // Check if there's enough space below the button
    const spaceBelow = window.innerHeight - rect.bottom
    const top = spaceBelow >= menuHeight + gap
      ? rect.bottom + gap  // Position below
      : rect.top - menuHeight - gap  // Position above

    let left = rect.right - menuWidth
    // Keep menu within viewport horizontally
    if (left < 8) left = 8
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8
    }

    setPosition({ top, left })
  }, [])

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()

    if (!isOpen) {
      // Calculate position before opening
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        const menuWidth = 280
        const menuHeight = 120
        const gap = 4
        // Prefer below, fall back to above if no space
        const spaceBelow = window.innerHeight - rect.bottom
        const top = spaceBelow >= menuHeight + gap
          ? rect.bottom + gap
          : rect.top - menuHeight - gap
        let left = rect.right - menuWidth
        if (left < 8) left = 8
        if (left + menuWidth > window.innerWidth - 8) {
          left = window.innerWidth - menuWidth - 8
        }
        setPosition({ top, left })
      }
    }
    setIsOpen(prev => !prev)
  }, [isOpen])

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [])

  // Handle option selection
  const handleSelectAccept = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    handleClose()
    onAccept()
  }, [handleClose, onAccept])

  const handleSelectCompact = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    handleClose()
    onAcceptWithCompact()
  }, [handleClose, onAcceptWithCompact])

  // Update position when opening
  useEffect(() => {
    if (isOpen) {
      updatePosition()
    }
  }, [isOpen, updatePosition])

  // Click outside detection
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        handleClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, handleClose])

  return (
    <>
      {/* Trigger button - matches existing Accept Plan button styling */}
      <div
        ref={triggerRef}
        onClick={handleToggle}
        className="inline-flex"
      >
        <button
          type="button"
          className={cn(
            "h-[28px] pl-2.5 pr-2 text-xs font-medium rounded-[6px] flex items-center gap-1.5 transition-all",
            "bg-success/5 text-success hover:bg-success/10 shadow-tinted",
            className
          )}
          style={{ '--shadow-color': '34, 136, 82' } as React.CSSProperties}
        >
          <Check className="h-3.5 w-3.5" />
          <span>Accept Plan</span>
          <ChevronDown className={cn(
            "h-3 w-3 transition-transform duration-150",
            isOpen && "rotate-180"
          )} />
        </button>
      </div>

      {/* Dropdown menu - rendered via portal */}
      {isOpen && position && ReactDOM.createPortal(
        <div
          ref={menuRef}
          className={cn(
            "fixed z-50 min-w-[280px] p-1.5",
            "bg-background rounded-[8px] shadow-strong border border-border/50",
            "animate-in fade-in-0 zoom-in-95 duration-100"
          )}
          style={{ top: position.top, left: position.left }}
        >
          {/* Option 1: Accept (execute immediately) */}
          <button
            type="button"
            onClick={handleSelectAccept}
            className={cn(
              "flex flex-col w-full px-3 py-2 text-left rounded-[6px]",
              "hover:bg-foreground/[0.05] focus:bg-foreground/[0.05] focus:outline-none",
              "transition-colors"
            )}
          >
            <span className="text-[13px] font-medium">Accept</span>
            <span className="text-xs text-muted-foreground">
              Execute the plan immediately
            </span>
          </button>

          {/* Option 2: Accept & Compact */}
          <button
            type="button"
            onClick={handleSelectCompact}
            className={cn(
              "flex flex-col w-full px-3 py-2 text-left rounded-[6px]",
              "hover:bg-foreground/[0.05] focus:bg-foreground/[0.05] focus:outline-none",
              "transition-colors"
            )}
          >
            <span className="text-[13px] font-medium">Accept & Compact</span>
            <span className="text-xs text-muted-foreground">
              Works best for complex, longer plans
            </span>
          </button>
        </div>,
        document.body
      )}
    </>
  )
}
