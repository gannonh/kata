import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { LeftPanel } from './LeftPanel'
import { CenterPanel } from '../center/CenterPanel'
import { MockChatPanel } from '../center/MockChatPanel'
import { PanelResizer } from './PanelResizer'
import { RightPanel } from './RightPanel'

const RESIZER_WIDTH = 10
const LEFT_MIN = 260
const RIGHT_MIN = 300
const CENTER_MIN = 420

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function AppShell() {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const leftWidthRef = useRef(320)
  const rightWidthRef = useRef(360)
  const [leftWidth, setLeftWidth] = useState(320)
  const [rightWidth, setRightWidth] = useState(360)
  const [availableWidth, setAvailableWidth] = useState(1440)

  useEffect(() => {
    leftWidthRef.current = leftWidth
  }, [leftWidth])

  useEffect(() => {
    rightWidthRef.current = rightWidth
  }, [rightWidth])

  useLayoutEffect(() => {
    const shellElement = shellRef.current
    if (!shellElement) {
      return
    }

    const updateWidth = (): void => {
      setAvailableWidth(shellElement.clientWidth)
    }

    updateWidth()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth)
      return () => {
        window.removeEventListener('resize', updateWidth)
      }
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      setAvailableWidth(entry?.contentRect.width ?? shellElement.clientWidth)
    })
    observer.observe(shellElement)

    return () => {
      observer.disconnect()
    }
  }, [])

  const gridTemplateColumns = useMemo(
    () => `${leftWidth}px ${RESIZER_WIDTH}px minmax(${CENTER_MIN}px, 1fr) ${RESIZER_WIDTH}px ${rightWidth}px`,
    [leftWidth, rightWidth]
  )

  return (
    <main
      data-testid="app-shell-root"
      className="h-screen w-screen overflow-hidden bg-muted/40 p-4 text-foreground"
    >
      <section
        ref={shellRef}
        data-testid="app-shell-grid"
        style={{ gridTemplateColumns }}
        className="relative grid h-full rounded-xl border bg-background shadow-sm"
      >
        <LeftPanel />

        <PanelResizer
          label="Resize left panel"
          testId="left-resizer"
          onDelta={(deltaX) => {
            setLeftWidth((current) => {
              const maxLeft = Math.max(
                LEFT_MIN,
                availableWidth - rightWidthRef.current - CENTER_MIN - RESIZER_WIDTH * 2
              )
              return clamp(current + deltaX, LEFT_MIN, maxLeft)
            })
          }}
        />

        <CenterPanel>
          <MockChatPanel />
        </CenterPanel>

        <PanelResizer
          label="Resize right panel"
          testId="right-resizer"
          onDelta={(deltaX) => {
            setRightWidth((current) => {
              const maxRight = Math.max(
                RIGHT_MIN,
                availableWidth - leftWidthRef.current - CENTER_MIN - RESIZER_WIDTH * 2
              )
              return clamp(current - deltaX, RIGHT_MIN, maxRight)
            })
          }}
        />

        <aside
          data-testid="right-panel"
          className="overflow-hidden rounded-r-xl border-l bg-background p-4"
        >
          <RightPanel />
        </aside>
      </section>
    </main>
  )
}
