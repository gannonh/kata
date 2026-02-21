import type { ProjectSpec } from '../../types/project'
import { Checkbox } from '../ui/checkbox'
import { LeftSection } from './LeftSection'

type ContextTabProps = {
  project: ProjectSpec
}

export function ContextTab({ project }: ContextTabProps) {
  return (
    <LeftSection
      title="Context"
      description="Context about the task, shared with all agents on demand."
      addActionLabel="Add context"
    >
      <ul className="grid gap-2">
        {project.tasks.map((task) => (
          <li key={task.id}>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={task.status === 'done'}
                disabled
              />
              <span>{task.title}</span>
            </label>
          </li>
        ))}
      </ul>
    </LeftSection>
  )
}
