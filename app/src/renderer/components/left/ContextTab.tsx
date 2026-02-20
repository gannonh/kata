import type { ProjectSpec } from '../../types/project'

type ContextTabProps = {
  project: ProjectSpec
}

export function ContextTab({ project }: ContextTabProps) {
  return (
    <section>
      <h2 className="font-display text-3xl uppercase tracking-[0.08em] text-[color:var(--text-primary)]">
        Context
      </h2>
      <a
        href={`#project-spec-${project.id}`}
        className="mt-4 inline-flex rounded-lg border border-[color:var(--line)] px-3 py-1.5 font-body text-sm text-[color:var(--text-primary)]"
      >
        Open project spec
      </a>
      <ul className="mt-4 grid gap-2">
        {project.tasks.map((task) => (
          <li key={task.id}>
            <label className="flex items-center gap-2 font-body text-sm text-[color:var(--text-secondary)]">
              <input
                type="checkbox"
                checked={task.status === 'done'}
                readOnly
              />
              <span>{task.title}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}
