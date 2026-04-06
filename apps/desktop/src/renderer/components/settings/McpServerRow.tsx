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

  if (status.phase === 'unsupported') {
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
  status?: McpServerStatus
  statusPending?: boolean
  pendingDelete?: boolean
  onEdit: (server: McpServerSummary) => void
  onRequestDelete: (name: string) => void
  onConfirmDelete: (name: string) => void
  onCancelDelete: () => void
  onRefresh: (name: string) => void
  onReconnect: (name: string) => void
  mutationPending?: boolean
}

export function McpServerRow({
  server,
  status,
  statusPending,
  pendingDelete,
  onEdit,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  onRefresh,
  onReconnect,
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
          <Badge
            variant={mcpStatusBadgeVariant(status)}
            data-testid={`mcp-status-badge-${server.name}`}
          >
            {statusPending ? 'Checking…' : formatMcpStatusLabel(status)}
          </Badge>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onRefresh(server.name)}
            disabled={Boolean(statusPending)}
            data-testid={`mcp-refresh-${server.name}`}
          >
            Refresh
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onReconnect(server.name)}
            disabled={Boolean(statusPending)}
            data-testid={`mcp-reconnect-${server.name}`}
          >
            Reconnect
          </Button>
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

      {status?.error ? (
        <p className="mt-2 text-xs text-destructive" data-testid={`mcp-status-error-${server.name}`}>
          {status.error.message}
        </p>
      ) : null}

      {status?.toolCount ? (
        <p className="mt-2 text-xs text-muted-foreground" data-testid={`mcp-tools-${server.name}`}>
          Tools ({status.toolCount}): {status.toolNames.join(', ')}
        </p>
      ) : null}

      {status?.checkedAt ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Last checked: {new Date(status.checkedAt).toLocaleString()}
        </p>
      ) : null}
    </article>
  )
}
