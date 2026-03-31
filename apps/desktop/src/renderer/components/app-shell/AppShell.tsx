import { useMemo } from 'react'
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels'
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
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed[LEFT_PANEL_ID] === 'number' &&
      typeof parsed[RIGHT_PANEL_ID] === 'number'
    ) {
      return {
        [LEFT_PANEL_ID]: parsed[LEFT_PANEL_ID],
        [RIGHT_PANEL_ID]: parsed[RIGHT_PANEL_ID],
      }
    }
  } catch {
    // Ignore malformed local storage data.
  }

  return DEFAULT_LAYOUT
}

export function AppShell() {
  const defaultLayout = useMemo(readInitialLayout, [])

  return (
    <main className="h-full w-full bg-slate-950 text-slate-100">
      <Group
        orientation="horizontal"
        className="h-full"
        defaultLayout={defaultLayout}
        onLayoutChanged={(layout) => {
          window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout))
        }}
      >
        <Panel id={LEFT_PANEL_ID} defaultSize={defaultLayout[LEFT_PANEL_ID]} minSize={45}>
          <LeftPane />
        </Panel>

        <Separator className="w-px bg-slate-800 hover:bg-slate-600 transition-colors" />

        <Panel id={RIGHT_PANEL_ID} defaultSize={defaultLayout[RIGHT_PANEL_ID]} minSize={20}>
          <RightPane />
        </Panel>
      </Group>
    </main>
  )
}
