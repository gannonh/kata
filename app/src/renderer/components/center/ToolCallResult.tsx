import { CollapsibleSection } from '../shared/CollapsibleSection'
import { type ToolCallRecord } from '../../types/chat'

type ToolCallResultProps = {
  toolCall: ToolCallRecord
}

export function ToolCallResult({ toolCall }: ToolCallResultProps) {
  return (
    <CollapsibleSection
      title={`Tool: ${toolCall.name}`}
      defaultOpen={false}
      className="bg-[color:var(--surface-bg)]/40"
    >
      <div className="grid gap-3">
        <div className="space-y-1">
          <p className="font-display text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
            Arguments
          </p>
          <pre className="overflow-x-auto rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-elevated)] p-3 text-xs text-[color:var(--text-primary)]">
            <code className="language-json">{JSON.stringify(toolCall.args, null, 2)}</code>
          </pre>
        </div>
        <div className="space-y-1">
          <p className="font-display text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
            Output
          </p>
          <pre className="overflow-x-auto rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-elevated)] p-3 text-xs text-[color:var(--text-primary)]">
            <code className="language-text">{toolCall.output}</code>
          </pre>
        </div>
      </div>
    </CollapsibleSection>
  )
}
