import { useEffect, useMemo } from 'react'
import { useSetAtom } from 'jotai'
import {
  Group,
  Panel,
  Separator as PanelSeparator,
  type Layout,
} from 'react-resizable-panels'
import { initializeSessionsAtom } from '@/atoms/session'
import { LeftPane } from './LeftPane'
import { RightPane } from './RightPane'

const LAYOUT_STORAGE_KEY = 'kata-desktop:app-shell-layout'
const LEFT_PANEL_ID = 'chat-pane'
const RIGHT_PANEL_ID = 'context-pane'
const DEFAULT_LAYOUT: Layout = {
  [LEFT_PANEL_ID]: 64,
  [RIGHT_PANEL_ID]: 36,
}

function readInitialLayout(): Layout {
  if (typeof window === 'undefined') {
    return DEFAULT_LAYOUT
  }

  const value = window.localStorage.getItem(LAYOUT_STORAGE_KEY)
  if (!value) {
    return DEFAULT_LAYOUT
  }

  try {
    const parsed = JSON.parse(value)
    const left = parsed?.[LEFT_PANEL_ID]
    const right = parsed?.[RIGHT_PANEL_ID]

    if (
      parsed &&
      typeof parsed === 'object' &&
      Number.isFinite(left) &&
      Number.isFinite(right) &&
      left > 0 &&
      right > 0
    ) {
      return {
        [LEFT_PANEL_ID]: left,
        [RIGHT_PANEL_ID]: right,
      }
    }
  } catch {
    // Ignore malformed local storage data.
  }

  return DEFAULT_LAYOUT
}

export function AppShell() {
  const defaultLayout = useMemo(readInitialLayout, [])
  const initializeSessions = useSetAtom(initializeSessionsAtom)

  useEffect(() => {
    void initializeSessions()
  }, [initializeSessions])

  return (
    <main className="size-full bg-background text-foreground">
      <Group
        orientation="horizontal"
        className="size-full"
        defaultLayout={defaultLayout}
        onLayoutChanged={(layout) => {
          try {
            window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout))
          } catch {
            // Ignore storage persistence failures.
          }
        }}
      >
        <Panel id={LEFT_PANEL_ID} defaultSize={defaultLayout[LEFT_PANEL_ID]} minSize={45}>
          <LeftPane />
        </Panel>

        <PanelSeparator className="w-px bg-border transition-colors hover:bg-accent" />

        <Panel id={RIGHT_PANEL_ID} defaultSize={defaultLayout[RIGHT_PANEL_ID]} minSize={20}>
          <RightPane />
        </Panel>
      </Group>
    </main>
  )
}
