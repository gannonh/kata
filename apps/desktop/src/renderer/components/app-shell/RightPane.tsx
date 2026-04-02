import { useAtomValue } from 'jotai'
import { rightPaneModeAtom } from '@/atoms/planning'
import { PlanningPane } from '@/components/planning/PlanningPane'
import { Separator } from '@/components/ui/separator'

export function RightPane() {
  const rightPaneMode = useAtomValue(rightPaneModeAtom)

  if (rightPaneMode === 'planning') {
    return <PlanningPane />
  }

  return (
    <aside className="flex h-full flex-col bg-muted/40">
      <div className="flex h-14 items-center px-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
          Context Pane
        </h2>
      </div>

      <Separator />

      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
        <div className="flex flex-col gap-2">
          <p className="font-medium text-foreground">Kata Desktop</p>
          <p>Planning and kanban views are coming in M002/M003.</p>
        </div>
      </div>
    </aside>
  )
}
