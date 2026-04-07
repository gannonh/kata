import type { McpServerStatus, McpServerSummary } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export function formatMcpStatusLabel(status: McpServerStatus | undefined): string {
  if (!status) {
    return 'Not checked'
  }

  if (status.phase === 'connected') {
    return 'Connected'
  }

  if (status.phase === 'configured') {
    return 'Configured'
  }

  if (status.phase === 'unsupported') {
    return 'Unsupported'
  }

  return status.error?.code ?? 'Error'
}

export function mcpStatusBadgeVariant(
  status: McpServerStatus | undefined,
): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (!status) {
    return 'outline'
  }

  if (status.phase === 'connected') {
    return 'default'
  }

  if (status.phase === 'configured' || status.phase === 'unsupported') {
    return 'secondary'
  }

  return 'destructive'
}

export function summarizeMcpServer(server: McpServerSummary): string {
  if (server.summary.transport === 'stdio') {
    const args = server.summary.args.join(' ')
    return `${server.summary.command}${args ? ` ${args}` : ''}`
  }

  return server.summary.url
}

interface McpServerRowProps {
  server: McpServerSummary
  pendingDelete?: boolean
  onEdit: (server: McpServerSummary) => void
  onRequestDelete: (name: string) => void
  onConfirmDelete: (name: string) => void
  onCancelDelete: () => void
  mutationPending?: boolean
}

export function McpServerRow({
  server,
  pendingDelete,
  onEdit,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  mutationPending,
}: McpServerRowProps) {
  return (
    <article
      className="rounded-lg border border-border bg-background/40 p-3"
      data-testid={`mcp-server-row-${server.name}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">{server.name}</h3>
            <Badge variant="secondary" className="uppercase">
              {server.transport}
            </Badge>
            {!server.enabled ? <Badge variant="outline">Disabled</Badge> : null}
          </div>

          <p className="font-mono text-xs text-muted-foreground">{summarizeMcpServer(server)}</p>

          {server.summary.transport === 'http' && server.summary.auth === 'bearer' ? (
            <p className="text-xs text-muted-foreground">
              Auth: bearer
              {server.summary.bearerTokenEnv
                ? ` (${server.summary.bearerTokenEnv})`
                : server.summary.hasInlineBearerToken
                  ? ' (inline token set)'
                  : ''}
            </p>
          ) : null}

          {server.summary.transport === 'stdio' && server.summary.envKeys.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Env keys: <span className="font-mono">{server.summary.envKeys.join(', ')}</span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onEdit(server)}
            disabled={Boolean(mutationPending)}
            data-testid={`mcp-edit-${server.name}`}
          >
            Edit
          </Button>

          {!pendingDelete ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => onRequestDelete(server.name)}
              disabled={Boolean(mutationPending)}
              data-testid={`mcp-delete-${server.name}`}
            >
              Remove
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => onConfirmDelete(server.name)}
                disabled={Boolean(mutationPending)}
                data-testid={`mcp-confirm-delete-${server.name}`}
              >
                Confirm remove
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onCancelDelete}
                disabled={Boolean(mutationPending)}
                data-testid={`mcp-cancel-delete-${server.name}`}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>

    </article>
  )
}
