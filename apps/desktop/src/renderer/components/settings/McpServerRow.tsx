import type { McpServerStatus, McpServerSummary, ReliabilityRecoveryAction } from '@shared/types'
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

function formatRowRecoveryLabel(action: ReliabilityRecoveryAction, serverName: string): string {
  switch (action) {
    case 'reconnect':
      return `Reconnect ${serverName}`
    case 'reauthenticate':
      return `Re-authenticate ${serverName}`
    default:
      return `Recover ${serverName}`
  }
}

interface McpServerRowProps {
  server: McpServerSummary
  pendingDelete?: boolean
  onEdit: (server: McpServerSummary) => void
  onRequestDelete: (name: string) => void
  onConfirmDelete: (name: string) => void
  onCancelDelete: () => void
  mutationPending?: boolean
  isAffectedByReliabilitySignal?: boolean
  reliabilityRecoveryAction?: ReliabilityRecoveryAction
  onRecoveryAction?: () => void
  recoveryPending?: boolean
}

export function McpServerRow({
  server,
  pendingDelete,
  onEdit,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  mutationPending,
  isAffectedByReliabilitySignal,
  reliabilityRecoveryAction,
  onRecoveryAction,
  recoveryPending,
}: McpServerRowProps) {
  return (
    <article
      className={`rounded-lg border p-3 ${
        isAffectedByReliabilitySignal
          ? 'border-destructive bg-destructive/5'
          : 'border-border bg-background/40'
      }`}
      data-testid={`mcp-server-row-${server.name}`}
      data-affected={isAffectedByReliabilitySignal ? 'true' : undefined}
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

      {isAffectedByReliabilitySignal && reliabilityRecoveryAction && onRecoveryAction ? (
        <div className="mt-2 flex items-center gap-2" data-testid={`mcp-row-recovery-${server.name}`}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRecoveryAction}
            disabled={recoveryPending}
            data-testid={`mcp-row-recovery-action-${server.name}`}
          >
            {recoveryPending ? 'Recovering…' : formatRowRecoveryLabel(reliabilityRecoveryAction, server.name)}
          </Button>
        </div>
      ) : null}
    </article>
  )
}
