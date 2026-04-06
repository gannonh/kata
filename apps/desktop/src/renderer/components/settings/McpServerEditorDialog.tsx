import { useEffect, useMemo, useState } from 'react'
import type { McpServerInput, McpServerSummary, McpServerTransport } from '@shared/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

export interface McpServerEditorDraft {
  name: string
  transport: McpServerTransport
  enabled: boolean
  command: string
  argsText: string
  cwd: string
  envText: string
  envKeyHints: string[]
  url: string
  auth: 'none' | 'bearer'
  bearerToken: string
  bearerTokenEnv: string
  hasStoredInlineBearerToken: boolean
}

export function createMcpServerEditorDraft(server?: McpServerSummary): McpServerEditorDraft {
  if (!server) {
    return {
      name: '',
      transport: 'stdio',
      enabled: true,
      command: '',
      argsText: '',
      cwd: '',
      envText: '',
      envKeyHints: [],
      url: '',
      auth: 'none',
      bearerToken: '',
      bearerTokenEnv: '',
      hasStoredInlineBearerToken: false,
    }
  }

  if (server.summary.transport === 'http') {
    return {
      name: server.name,
      transport: 'http',
      enabled: server.enabled,
      command: '',
      argsText: '',
      cwd: '',
      envText: '',
      envKeyHints: [],
      url: server.summary.url,
      auth: server.summary.auth,
      bearerToken: '',
      bearerTokenEnv: server.summary.bearerTokenEnv ?? '',
      hasStoredInlineBearerToken: server.summary.hasInlineBearerToken,
    }
  }

  return {
    name: server.name,
    transport: 'stdio',
    enabled: server.enabled,
    command: server.summary.command,
    argsText: server.summary.args.join(' '),
    cwd: server.summary.cwd ?? '',
    envText: '',
    envKeyHints: server.summary.envKeys,
    url: '',
    auth: 'none',
    bearerToken: '',
    bearerTokenEnv: '',
    hasStoredInlineBearerToken: false,
  }
}

export function validateMcpServerDraft(draft: McpServerEditorDraft): string[] {
  const errors: string[] = []

  if (!draft.name.trim()) {
    errors.push('Server name is required.')
  }

  if (draft.transport === 'stdio' && !draft.command.trim()) {
    errors.push('Command is required for stdio servers.')
  }

  if (draft.transport === 'http') {
    if (!draft.url.trim()) {
      errors.push('URL is required for HTTP servers.')
    } else {
      try {
        const parsed = new URL(draft.url.trim())
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          errors.push('URL must use http or https.')
        }
      } catch {
        errors.push('URL must be valid.')
      }
    }

    if (
      draft.auth === 'bearer' &&
      !draft.bearerToken.trim() &&
      !draft.bearerTokenEnv.trim() &&
      !draft.hasStoredInlineBearerToken
    ) {
      errors.push('Bearer auth requires a token or token env key.')
    }
  }

  return errors
}

function parseArgs(argsText: string): string[] {
  return argsText
    .split(/\s+/)
    .map((arg) => arg.trim())
    .filter(Boolean)
}

function parseEnv(envText: string): Record<string, string> | undefined {
  const lines = envText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return undefined
  }

  const env: Record<string, string> = {}

  for (const line of lines) {
    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1)

    if (!key) {
      continue
    }

    env[key] = value
  }

  return Object.keys(env).length > 0 ? env : undefined
}

function toServerInput(draft: McpServerEditorDraft): McpServerInput {
  if (draft.transport === 'http') {
    return {
      name: draft.name.trim(),
      transport: 'http',
      enabled: draft.enabled,
      url: draft.url.trim(),
      auth: draft.auth,
      bearerToken: draft.bearerToken,
      bearerTokenEnv: draft.bearerTokenEnv,
    }
  }

  return {
    name: draft.name.trim(),
    transport: 'stdio',
    enabled: draft.enabled,
    command: draft.command.trim(),
    args: parseArgs(draft.argsText),
    cwd: draft.cwd.trim(),
    env: parseEnv(draft.envText),
  }
}

interface McpServerEditorDialogProps {
  open: boolean
  server?: McpServerSummary
  saving?: boolean
  errorMessage?: string | null
  onOpenChange: (open: boolean) => void
  onSave: (input: McpServerInput) => Promise<void>
}

export function McpServerEditorDialog({
  open,
  server,
  saving,
  errorMessage,
  onOpenChange,
  onSave,
}: McpServerEditorDialogProps) {
  const [draft, setDraft] = useState<McpServerEditorDraft>(() => createMcpServerEditorDraft(server))
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDraft(createMcpServerEditorDraft(server))
      setLocalError(null)
    }
  }, [open, server])

  const isEditing = Boolean(server)

  const validationErrors = useMemo(() => validateMcpServerDraft(draft), [draft])

  const handleSave = async () => {
    if (validationErrors.length > 0) {
      setLocalError(validationErrors[0] ?? null)
      return
    }

    setLocalError(null)
    await onSave(toServerInput(draft))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(44rem,95vw)] max-w-[min(44rem,95vw)]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{isEditing ? `Edit ${server?.name}` : 'Add MCP server'}</DialogTitle>
          <DialogDescription>
            Configure stdio or HTTP MCP servers without hand-editing mcp.json.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="mcp-server-name">Server name</Label>
            <Input
              id="mcp-server-name"
              value={draft.name}
              onChange={(event) => setDraft((previous) => ({ ...previous, name: event.target.value }))}
              disabled={isEditing}
              data-testid="mcp-editor-name"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="mcp-server-transport">Transport</Label>
              <Select
                value={draft.transport}
                onValueChange={(value) =>
                  setDraft((previous) => ({
                    ...previous,
                    transport: value as McpServerTransport,
                  }))
                }
                disabled={isEditing}
              >
                <SelectTrigger id="mcp-server-transport" className="w-48" data-testid="mcp-editor-transport">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stdio">stdio</SelectItem>
                  <SelectItem value="http">http</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    enabled: event.target.checked,
                  }))
                }
              />
              Enabled
            </label>
          </div>

          {draft.transport === 'stdio' ? (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="mcp-server-command">Command</Label>
                <Input
                  id="mcp-server-command"
                  value={draft.command}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      command: event.target.value,
                    }))
                  }
                  placeholder="npx"
                  data-testid="mcp-editor-command"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="mcp-server-args">Arguments</Label>
                <Input
                  id="mcp-server-args"
                  value={draft.argsText}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      argsText: event.target.value,
                    }))
                  }
                  placeholder="-y mcp-remote https://mcp.linear.app/mcp"
                  data-testid="mcp-editor-args"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="mcp-server-cwd">Working directory (optional)</Label>
                <Input
                  id="mcp-server-cwd"
                  value={draft.cwd}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      cwd: event.target.value,
                    }))
                  }
                  placeholder="/absolute/path"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="mcp-server-env">Environment overrides (KEY=VALUE per line)</Label>
                <Textarea
                  id="mcp-server-env"
                  value={draft.envText}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      envText: event.target.value,
                    }))
                  }
                  placeholder="API_KEY=${MY_API_KEY}"
                />

                {draft.envKeyHints.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Existing env keys (values hidden): <span className="font-mono">{draft.envKeyHints.join(', ')}</span>
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="mcp-server-url">Server URL</Label>
                <Input
                  id="mcp-server-url"
                  value={draft.url}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      url: event.target.value,
                    }))
                  }
                  placeholder="https://example.com/mcp"
                  data-testid="mcp-editor-url"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="mcp-server-auth">Auth mode</Label>
                <Select
                  value={draft.auth}
                  onValueChange={(value) =>
                    setDraft((previous) => ({
                      ...previous,
                      auth: value as 'none' | 'bearer',
                    }))
                  }
                >
                  <SelectTrigger id="mcp-server-auth" className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">none</SelectItem>
                    <SelectItem value="bearer">bearer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {draft.auth === 'bearer' ? (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor="mcp-server-bearer-token">Bearer token (optional)</Label>
                    <Input
                      id="mcp-server-bearer-token"
                      type="password"
                      value={draft.bearerToken}
                      onChange={(event) =>
                        setDraft((previous) => ({
                          ...previous,
                          bearerToken: event.target.value,
                        }))
                      }
                      placeholder={
                        draft.hasStoredInlineBearerToken ? 'Existing token is stored (redacted)' : 'Paste token'
                      }
                    />
                    {draft.hasStoredInlineBearerToken ? (
                      <p className="text-xs text-muted-foreground">Existing inline token remains unless replaced.</p>
                    ) : null}
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="mcp-server-bearer-token-env">Token env key (optional)</Label>
                    <Input
                      id="mcp-server-bearer-token-env"
                      value={draft.bearerTokenEnv}
                      onChange={(event) =>
                        setDraft((previous) => ({
                          ...previous,
                          bearerTokenEnv: event.target.value,
                        }))
                      }
                      placeholder="MCP_BEARER_TOKEN"
                    />
                  </div>
                </>
              ) : null}
            </>
          )}

          {localError ? <p className="text-xs text-destructive">{localError}</p> : null}
          {errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={Boolean(saving)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              void handleSave()
            }}
            disabled={Boolean(saving)}
            data-testid="mcp-editor-save"
          >
            {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Add server'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
