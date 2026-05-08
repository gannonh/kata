import { useAtomValue } from 'jotai'
import { rightPaneModeAtom } from '@/atoms/right-pane'
import { KanbanPane } from '@/components/kanban/KanbanPane'
import { PlanningPane } from '@/components/planning/PlanningPane'
import { AgentActivityPane } from '@/components/agent-activity/AgentActivityPane'

export function RightPane() {
  const rightPaneMode = useAtomValue(rightPaneModeAtom)

  if (rightPaneMode === 'planning') {
    return <PlanningPane />
  }

  if (rightPaneMode === 'agent_activity') {
    return <AgentActivityPane />
  }

  return <KanbanPane />
}
