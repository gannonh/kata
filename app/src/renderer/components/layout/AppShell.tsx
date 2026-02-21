import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { LeftPanel } from './LeftPanel'
import { CenterPanel } from '../center/CenterPanel'
import { MockChatPanel } from '../center/MockChatPanel'
import { PanelResizer } from './PanelResizer'
import { RightPanel } from './RightPanel'

const RESIZER_WIDTH = 10
const LEFT_MIN = 260
const LEFT_COLLAPSED = 56
const CENTER_MIN = 300
export const THEME_STORAGE_KEY = 'kata-theme'

type Theme = 'dark' | 'light'

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function AppShell() {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const leftWidthRef = useRef(320)
  const rightOffsetRef = useRef(0)
  const [leftWidth, setLeftWidth] = useState(320)
  const [rightOffset, setRightOffset] = useState(0)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [availableWidth, setAvailableWidth] = useState(1440)
  const [theme, setTheme] = useState<Theme>(() => {
    const persistedTheme = globalThis.localStorage?.getItem(THEME_STORAGE_KEY)
    return persistedTheme === 'light' || persistedTheme === 'dark' ? persistedTheme : 'dark'
  })

  useEffect(() => {
    leftWidthRef.current = leftWidth
  }, [leftWidth])

  useEffect(() => {
    rightOffsetRef.current = rightOffset
  }, [rightOffset])

  useEffect(() => {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
  }, [theme])

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

  const effectiveLeftWidth = leftCollapsed ? LEFT_COLLAPSED : leftWidth

  const gridTemplateColumns = useMemo(() => {
    const remaining = availableWidth - effectiveLeftWidth - RESIZER_WIDTH * 2
    const half = remaining / 2
    const centerWidth = half - rightOffset
    const rightWidth = half + rightOffset
    return `${effectiveLeftWidth}px ${RESIZER_WIDTH}px ${centerWidth}px ${RESIZER_WIDTH}px ${rightWidth}px`
  }, [effectiveLeftWidth, rightOffset, availableWidth])

  return (
    <main
      data-testid="app-shell-root"
      className="h-screen w-screen overflow-hidden bg-background text-foreground"
    >
      <section
        ref={shellRef}
        data-testid="app-shell-grid"
        style={{ gridTemplateColumns }}
        className="relative grid h-full bg-background transition-[grid-template-columns] duration-200 ease-linear"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-14 z-10 h-px bg-border"
        />

        <LeftPanel
          collapsed={leftCollapsed}
          onCollapsedChange={setLeftCollapsed}
        />

        <PanelResizer
          label="Resize left panel"
          testId="left-resizer"
          lineAt="end"
          onDelta={(deltaX) => {
            setLeftWidth((current) => {
              const maxLeft = Math.max(
                LEFT_MIN,
                availableWidth - CENTER_MIN * 2 - RESIZER_WIDTH * 2
              )
              const next = clamp(current + deltaX, LEFT_MIN, maxLeft)
              if (leftCollapsed) {
                setLeftCollapsed(false)
              }
              return next
            })
          }}
        />

        <CenterPanel>
          <MockChatPanel />
        </CenterPanel>

        <PanelResizer
          label="Resize right panel"
          testId="right-resizer"
          lineAt="start"
          onDelta={(deltaX) => {
            setRightOffset((current) => {
              const remaining = availableWidth - (leftCollapsed ? LEFT_COLLAPSED : leftWidthRef.current) - RESIZER_WIDTH * 2
              const half = remaining / 2
              const maxOffset = half - CENTER_MIN
              return clamp(current - deltaX, -maxOffset, maxOffset)
            })
          }}
          onDoubleClick={() => setRightOffset(0)}
        />

        <aside
          data-testid="right-panel"
          className="overflow-hidden bg-background"
        >
          <RightPanel
            theme={theme}
            onToggleTheme={() => {
              setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))
            }}
          />
        </aside>
      </section>
    </main>
  )
}
