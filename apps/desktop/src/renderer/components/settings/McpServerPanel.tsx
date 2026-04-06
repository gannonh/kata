import { useMemo, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import type { McpServerSummary } from '@shared/types'
import {
  deleteMcpServerAtom,
  loadMcpConfigAtom,
  mcpConfigLoadingAtom,
  mcpConfigStateAtom,
  mcpMutationErrorAtom,
  mcpMutationPendingAtom,
  mcpMutationSuccessAtom,
  mcpServerStatusesAtom,
  mcpStatusPendingByServerAtom,
  reconnectMcpServerAtom,
  saveMcpServerAtom,
  useMcpConfigBridge,
  refreshMcpServerStatusAtom,
} from '@/atoms/mcp'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { McpServerEditorDialog } from './McpServerEditorDialog'
import { McpServerRow } from './McpServerRow'

export function formatMcpProvenanceLabel(mode: 'global_only' | 'overlay_present' | undefined): string {
  if (mode === 'overlay_present') {
    return 'Global config (overlay detected)'
  }

  return 'Global shared config'
}

export function McpServerPanel() {
  useMcpConfigBridge()

  const configState = useAtomValue(mcpConfigStateAtom)
  const loading = useAtomValue(mcpConfigLoadingAtom)
  const mutationPending = useAtomValue(mcpMutationPendingAtom)
  const mutationError = useAtomValue(mcpMutationErrorAtom)
  const mutationSuccess = useAtomValue(mcpMutationSuccessAtom)
  const statuses = useAtomValue(mcpServerStatusesAtom)
  const statusPendingByServer = useAtomValue(mcpStatusPendingByServerAtom)

  const refreshConfig = useSetAtom(loadMcpConfigAtom)
  const saveServer = useSetAtom(saveMcpServerAtom)
  const deleteServer = useSetAtom(deleteMcpServerAtom)
  const refreshStatus = useSetAtom(refreshMcpServerStatusAtom)
  const reconnectServer = useSetAtom(reconnectMcpServerAtom)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<McpServerSummary | undefined>(undefined)
  const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(null)

  const servers = useMemo(() => configState.servers, [configState.servers])
  const serverErrorCount = useMemo(() => {
    return Object.values(statuses).filter((status) => status?.phase === 'error').length
  }, [statuses])

  const openCreateDialog = () => {
    setEditingServer(undefined)
    setEditorOpen(true)
  }

  const openEditDialog = (server: McpServerSummary) => {
    setEditingServer(server)
    setEditorOpen(true)
  }

  return (
    <Card className="border border-border bg-card/60 py-0" data-testid="mcp-settings-panel">
      <CardHeader className="px-4 pt-4 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm text-foreground">MCP Servers</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Manage shared MCP servers stored in <span className="font-mono">~/.kata-cli/agent/mcp.json</span>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" data-testid="mcp-provenance-badge">
              {formatMcpProvenanceLabel(configState.provenance?.mode)}
            </Badge>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void refreshConfig()
              }}
              disabled={loading}
              data-testid="mcp-refresh-config"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button type="button" size="sm" onClick={openCreateDialog} data-testid="mcp-add-server">
              Add server
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 p-4 pt-2 text-xs">
        {configState.provenance?.warning ? (
          <Alert data-testid="mcp-overlay-warning">
            <AlertTitle>Project overlay detected</AlertTitle>
            <AlertDescription>
              {configState.provenance.warning}
              {configState.provenance.overlayConfigPath ? (
                <span className="mt-1 block font-mono text-[11px]">{configState.provenance.overlayConfigPath}</span>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {configState.error ? (
          <Alert variant="destructive" data-testid="mcp-config-error">
            <AlertTitle>Unable to load MCP config</AlertTitle>
            <AlertDescription>{configState.error}</AlertDescription>
          </Alert>
        ) : null}

        {mutationError ? (
          <Alert variant="destructive" data-testid="mcp-mutation-error">
            <AlertTitle>MCP update failed</AlertTitle>
            <AlertDescription>{mutationError}</AlertDescription>
          </Alert>
        ) : null}

        {mutationSuccess ? (
          <Alert data-testid="mcp-mutation-success">
            <AlertTitle>MCP config updated</AlertTitle>
            <AlertDescription>{mutationSuccess}</AlertDescription>
          </Alert>
        ) : null}

        {configState.error ? (
          <Alert data-testid="mcp-recovery-hint">
            <AlertTitle>Recovery tip</AlertTitle>
            <AlertDescription>
              Restore a valid <span className="font-mono">mcp.json</span> (or fix malformed entries), then use
              Refresh to confirm readback before reconnecting servers.
            </AlertDescription>
          </Alert>
        ) : null}

        {serverErrorCount > 0 ? (
          <Alert data-testid="mcp-row-recovery-hint">
            <AlertTitle>Server connection errors stay row-scoped</AlertTitle>
            <AlertDescription>
              {serverErrorCount} server{serverErrorCount === 1 ? '' : 's'} currently failed health checks. Fix each
              row and retry Refresh/Reconnect without restarting Desktop.
            </AlertDescription>
          </Alert>
        ) : null}

        {servers.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-background/30 p-4 text-muted-foreground" data-testid="mcp-empty-state">
            No MCP servers configured yet.
          </div>
        ) : (
          <div className="space-y-2">
            {servers.map((server) => (
              <McpServerRow
                key={server.name}
                server={server}
                status={statuses[server.name]}
                statusPending={statusPendingByServer[server.name]}
                pendingDelete={pendingDeleteName === server.name}
                mutationPending={mutationPending}
                onEdit={openEditDialog}
                onRequestDelete={setPendingDeleteName}
                onConfirmDelete={(name) => {
                  void deleteServer(name)
                  setPendingDeleteName(null)
                }}
                onCancelDelete={() => setPendingDeleteName(null)}
                onRefresh={(name) => {
                  void refreshStatus(name)
                }}
                onReconnect={(name) => {
                  void reconnectServer(name)
                }}
              />
            ))}
          </div>
        )}
      </CardContent>

      <McpServerEditorDialog
        open={editorOpen}
        server={editingServer}
        saving={mutationPending}
        errorMessage={mutationError}
        onOpenChange={(open) => {
          setEditorOpen(open)
          if (!open) {
            setEditingServer(undefined)
          }
        }}
        onSave={async (input) => {
          const result = await saveServer(input)
          if (result?.success) {
            setEditorOpen(false)
            setEditingServer(undefined)
          }
        }}
      />
    </Card>
  )
}
