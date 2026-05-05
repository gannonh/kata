import type { ParsedRequirement, ParsedRequirements, RequirementStatus } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface RequirementSectionConfig {
  key: RequirementStatus
  label: string
  headingClassName: string
}

const SECTION_CONFIG: RequirementSectionConfig[] = [
  {
    key: 'active',
    label: 'Active',
    headingClassName: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  {
    key: 'validated',
    label: 'Validated',
    headingClassName: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  },
  {
    key: 'deferred',
    label: 'Deferred',
    headingClassName: 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300',
  },
  {
    key: 'outOfScope',
    label: 'Out of Scope',
    headingClassName: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  },
]

export interface RequirementsViewProps {
  requirements: ParsedRequirements
}

export function RequirementsView({ requirements }: RequirementsViewProps) {
  const coverageTotal =
    requirements.active.length +
    requirements.validated.length +
    requirements.deferred.length +
    requirements.outOfScope.length

  return (
    <div className="space-y-4">
      {SECTION_CONFIG.map((section) => {
        const sectionRequirements = requirements[section.key]
        if (sectionRequirements.length === 0) {
          return null
        }

        return (
          <section key={section.key} className="overflow-hidden rounded-lg border border-border">
            <div className={cn('flex items-center justify-between px-3 py-2 text-xs font-semibold', section.headingClassName)}>
              <span>{section.label}</span>
              <span>{sectionRequirements.length}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Requirement</th>
                    <th className="px-3 py-2 font-medium">Class</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Owning Slice</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border">
                  {sectionRequirements.map((requirement) => (
                    <RequirementRow key={requirement.id} requirement={requirement} sectionLabel={section.label} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}

      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Traceability summary: {coverageTotal} requirements rendered ({requirements.active.length} active,{' '}
        {requirements.validated.length} validated, {requirements.deferred.length} deferred,{' '}
        {requirements.outOfScope.length} out of scope).
      </div>
    </div>
  )
}

function RequirementRow({
  requirement,
  sectionLabel,
}: {
  requirement: ParsedRequirement
  sectionLabel: string
}) {
  return (
    <tr className="align-top">
      <td className="space-y-1 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{requirement.id}</Badge>
          <span className="font-medium text-foreground">{requirement.title}</span>
        </div>
        {requirement.description ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{requirement.description}</p>
        ) : null}
      </td>
      <td className="px-3 py-2">
        {requirement.class ? <Badge variant="outline">{requirement.class}</Badge> : <span>—</span>}
      </td>
      <td className="px-3 py-2">
        <Badge variant="outline">{requirement.status || sectionLabel.toLowerCase()}</Badge>
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{requirement.owner || '—'}</td>
    </tr>
  )
}
