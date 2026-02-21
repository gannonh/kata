import type { ProjectSpec } from '../../types/project'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'

type ContextTabProps = {
  project: ProjectSpec
}

export function ContextTab({ project }: ContextTabProps) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight">
        Context
      </h2>
      <Button
        asChild
        className="mt-4"
      >
        <a href={`#project-spec-${project.id}`}>Open project spec</a>
      </Button>
      <ul className="mt-4 grid gap-2">
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
    </section>
  )
}
