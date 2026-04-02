import { useAtomValue, useSetAtom } from 'jotai'
import { LayoutGrid } from 'lucide-react'
import { rightPaneModeAtom } from '@/atoms/planning'
import { PlanningPane } from '@/components/planning/PlanningPane'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

export function RightPane() {
  const rightPaneMode = useAtomValue(rightPaneModeAtom)
  const setRightPaneMode = useSetAtom(rightPaneModeAtom)

  if (rightPaneMode === 'planning') {
    return <PlanningPane />
  }

  return (
    <aside className="flex h-full flex-col bg-muted/40">
      <div className="flex h-14 items-center justify-between px-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
          Context Pane
        </h2>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Open planning view"
          onClick={() => {
            console.info('Right pane mode toggled', {
              trigger: 'manual',
              from: 'default',
              to: 'planning',
            })
            setRightPaneMode('planning')
          }}
        >
          <LayoutGrid className="size-4" />
        </Button>
      </div>

      <Separator />

      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
        <div className="flex flex-col gap-2">
          <p className="font-medium text-foreground">Kata Desktop</p>
          <p>Planning artifacts appear here during /kata plan. Kanban view is coming in M003.</p>
        </div>
      </div>
    </aside>
  )
}
