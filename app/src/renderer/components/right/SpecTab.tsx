import type { ProjectSpec } from '../../types/project'
import { AcceptanceCriteria } from './AcceptanceCriteria'
import { ArchitectureDiagram } from './ArchitectureDiagram'
import { TaskList } from './TaskList'

type SpecTabProps = {
  project: ProjectSpec
}

export function SpecTab({ project }: SpecTabProps) {
  return (
    <div className="grid gap-4">
      <section className="rounded-2xl border border-[color:var(--line)]/80 bg-[color:var(--surface-elevated)]/35 p-4">
        <h3 className="font-display text-sm uppercase tracking-[0.16em] text-[color:var(--text-primary)]">
          Goal
        </h3>
        <p className="mt-2 font-body text-sm text-[color:var(--text-secondary)]">{project.goal}</p>
      </section>

      <section className="rounded-2xl border border-[color:var(--line)]/80 bg-[color:var(--surface-elevated)]/35 p-4">
        <h3 className="font-display text-sm uppercase tracking-[0.16em] text-[color:var(--text-primary)]">
          Architecture
        </h3>
        <div className="mt-2">
          <ArchitectureDiagram />
        </div>
      </section>

      <section className="rounded-2xl border border-[color:var(--line)]/80 bg-[color:var(--surface-elevated)]/35 p-4">
        <h3 className="font-display text-sm uppercase tracking-[0.16em] text-[color:var(--text-primary)]">
          Tasks
        </h3>
        <div className="mt-2">
          <TaskList tasks={project.tasks} />
        </div>
      </section>

      <section className="rounded-2xl border border-[color:var(--line)]/80 bg-[color:var(--surface-elevated)]/35 p-4">
        <h3 className="font-display text-sm uppercase tracking-[0.16em] text-[color:var(--text-primary)]">
          Acceptance Criteria
        </h3>
        <div className="mt-2">
          <AcceptanceCriteria criteria={project.acceptanceCriteria} />
        </div>
      </section>

      <section className="rounded-2xl border border-[color:var(--line)]/80 bg-[color:var(--surface-elevated)]/35 p-4">
        <h3 className="font-display text-sm uppercase tracking-[0.16em] text-[color:var(--text-primary)]">
          Non-Goals
        </h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 font-body text-sm text-[color:var(--text-secondary)]">
          {project.nonGoals.map((nonGoal, index) => (
            <li key={`${project.id}-non-goal-${index}`}>{nonGoal}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-[color:var(--line)]/80 bg-[color:var(--surface-elevated)]/35 p-4">
        <h3 className="font-display text-sm uppercase tracking-[0.16em] text-[color:var(--text-primary)]">
          Assumptions
        </h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 font-body text-sm text-[color:var(--text-secondary)]">
          {project.assumptions.map((assumption, index) => (
            <li key={`${project.id}-assumption-${index}`}>{assumption}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
