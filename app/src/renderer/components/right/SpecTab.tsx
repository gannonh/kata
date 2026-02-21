import type { ProjectSpec } from '../../types/project'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { AcceptanceCriteria } from './AcceptanceCriteria'
import { ArchitectureDiagram } from './ArchitectureDiagram'
import { TaskList } from './TaskList'

type SpecTabProps = {
  project: ProjectSpec
}

export function SpecTab({ project }: SpecTabProps) {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wide">Goal</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{project.goal}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wide">Architecture</CardTitle>
        </CardHeader>
        <CardContent>
          <ArchitectureDiagram />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wide">Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskList tasks={project.tasks} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wide">Acceptance Criteria</CardTitle>
        </CardHeader>
        <CardContent>
          <AcceptanceCriteria criteria={project.acceptanceCriteria} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wide">Non-Goals</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {project.nonGoals.map((nonGoal, index) => (
              <li key={`${project.id}-non-goal-${index}`}>{nonGoal}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wide">Assumptions</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {project.assumptions.map((assumption, index) => (
              <li key={`${project.id}-assumption-${index}`}>{assumption}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
