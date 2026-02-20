import { type MouseEvent, useCallback } from 'react'

type PanelResizerProps = {
  label: string
  testId?: string
  onDelta: (deltaX: number) => void
}

export function PanelResizer({ label, testId, onDelta }: PanelResizerProps) {
  const handleMouseDown = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      let lastX = event.clientX

      const handleMouseMove = (moveEvent: globalThis.MouseEvent): void => {
        const deltaX = moveEvent.clientX - lastX
        lastX = moveEvent.clientX
        onDelta(deltaX)
      }

      const handleMouseUp = (): void => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [onDelta]
  )

  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      onMouseDown={handleMouseDown}
      className="relative h-full w-[10px] cursor-col-resize bg-transparent px-0 transition-colors hover:bg-[color:var(--line-strong)]"
    >
      <span className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-px -translate-x-1/2 -translate-y-1/2 bg-[color:var(--line)]" />
    </button>
  )
}
