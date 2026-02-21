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
      className="bg-muted/30"
    >
      <div className="grid gap-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Arguments
          </p>
          <pre className="overflow-x-auto rounded-md border bg-card p-3 text-xs text-foreground">
            <code className="language-json">{JSON.stringify(toolCall.args, null, 2)}</code>
          </pre>
        </div>
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Output
          </p>
          <pre className="overflow-x-auto rounded-md border bg-card p-3 text-xs text-foreground">
            <code className="language-text">{toolCall.output}</code>
          </pre>
        </div>
      </div>
    </CollapsibleSection>
  )
}
