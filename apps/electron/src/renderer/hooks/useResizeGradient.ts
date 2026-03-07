import * as React from "react"

/**
 * Creates the gradient style for the resize indicator
 */
export function getResizeGradientStyle(mouseY: number | null): React.CSSProperties {
  return {
    transition: 'opacity 150ms ease-out',
    opacity: mouseY !== null ? 1 : 0,
    background: `radial-gradient(
      circle 66vh at 50% ${mouseY ?? 0}px,
      color-mix(in oklch, var(--foreground) 25%, transparent) 0%,
      color-mix(in oklch, var(--foreground) 12%, transparent) 30%,
      transparent 70%
    )`
  }
}

/**
 * useResizeGradient - Hook for resize handle gradient that follows cursor
 *
 * Returns:
 * - ref: Attach to the touch area element
 * - mouseY: Current Y position (null when not hovering)
 * - handlers: onMouseMove, onMouseLeave, onMouseDown for the touch area
 * - gradientStyle: CSS style object for the visual indicator
 */
export function useResizeGradient() {
  const [mouseY, setMouseY] = React.useState<number | null>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  const onMouseMove = React.useCallback((e: React.MouseEvent) => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setMouseY(e.clientY - rect.top)
    }
  }, [])

  const onMouseLeave = React.useCallback(() => {
    if (!isDragging) {
      setMouseY(null)
    }
  }, [isDragging])

  const onMouseDown = React.useCallback(() => {
    setIsDragging(true)
  }, [])

  // Track mouse position during drag and cleanup on mouseup
  React.useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect()
        setMouseY(e.clientY - rect.top)
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      setMouseY(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  return {
    ref,
    mouseY,
    isDragging,
    handlers: { onMouseMove, onMouseLeave, onMouseDown },
    gradientStyle: getResizeGradientStyle(mouseY),
  }
}
