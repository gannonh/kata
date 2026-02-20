import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { LeftPanel } from './LeftPanel'
import { PanelResizer } from './PanelResizer'

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
      className="h-screen w-screen overflow-hidden bg-[color:var(--surface-bg)] p-5 text-[color:var(--text-primary)]"
    >
      <section
        ref={shellRef}
        data-testid="app-shell-grid"
        style={{ gridTemplateColumns }}
        className="relative grid h-full rounded-[28px] border border-[color:var(--line)] bg-[color:var(--surface-panel)]/85 shadow-[0_0_0_1px_var(--line-soft),0_30px_80px_rgba(0,0,0,0.55)]"
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

        <section
          data-testid="center-panel"
          className="relative overflow-hidden p-10"
        >
          <div className="pointer-events-none absolute inset-0 opacity-70 [background:linear-gradient(120deg,transparent_0%,rgba(214,252,194,0.07)_34%,transparent_70%)]" />
          <p className="relative font-display text-xs uppercase tracking-[0.32em] text-[color:var(--text-muted)]">
            Center Column
          </p>
          <h1 className="relative mt-4 font-display text-5xl uppercase tracking-[0.08em]">
            Orchestrator Chat
          </h1>
          <div className="relative mt-8 grid gap-4">
            <div className="rounded-2xl border border-[color:var(--line)]/80 bg-[color:var(--surface-elevated)]/70 p-5 font-body text-[color:var(--text-secondary)]">
              Mock conversation scaffolding arrives in Wave 4.
            </div>
            <div className="rounded-2xl border border-dashed border-[color:var(--line)]/90 p-5 font-body text-[color:var(--text-muted)]">
              Future replacement target: PI chat panel web component.
            </div>
          </div>
        </section>

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
          className="overflow-hidden rounded-r-[28px] border-l border-[color:var(--line)] bg-[radial-gradient(circle_at_80%_14%,rgba(244,196,48,0.12),transparent_46%)] p-6"
        >
          <p className="font-display text-xs uppercase tracking-[0.32em] text-[color:var(--text-muted)]">
            Right Column
          </p>
          <h2 className="mt-4 font-display text-3xl uppercase tracking-[0.08em] text-[color:var(--text-primary)]">
            Spec
          </h2>
          <p className="mt-3 max-w-52 font-body text-base text-[color:var(--text-secondary)]">
            Requirements and acceptance criteria views are scheduled for Wave 5.
          </p>
        </aside>
      </section>
    </main>
  )
}
