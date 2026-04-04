import { useAtomValue } from 'jotai'
import { rightPaneModeAtom } from '@/atoms/right-pane'
import { KanbanPane } from '@/components/kanban/KanbanPane'
import { PlanningPane } from '@/components/planning/PlanningPane'

export function RightPane() {
  const rightPaneMode = useAtomValue(rightPaneModeAtom)

  if (rightPaneMode === 'planning') {
    return <PlanningPane />
  }

  return <KanbanPane />
}
