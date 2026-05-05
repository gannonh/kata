# S03 MCP Settings Smoke (M005)

## Scope & Truth Boundaries

This smoke validates **shared global MCP config management** in Kata Desktop only.

- ✅ In scope: inspect/add/edit/remove servers in `~/.kata-cli/agent/mcp.json`, refresh/reconnect status, tool list visibility, malformed/unreachable error surfaces.
- ✅ In scope: stdio and HTTP/bearer style entries that do not require OAuth onboarding.
- ❌ Out of scope: project-local overlay editing (`.kata-cli/mcp.json`), OAuth consent flows, full M005 assembled walkthrough (covered by S04).

---

## Preconditions

1. Desktop app built and runnable (`cd apps/desktop && bun run build`).
2. A safe local stdio MCP fixture server script is available, e.g.:
   - `apps/desktop/e2e/fixtures/mcp-stdio-server.mjs`
3. You can restore your original MCP config after testing.

---

## Backup / Restore Procedure

```bash
MCP_PATH="$HOME/.kata-cli/agent/mcp.json"
BACKUP_PATH="/tmp/kata-mcp.json.backup.$(date +%s)"

mkdir -p "$(dirname "$MCP_PATH")"
if [ -f "$MCP_PATH" ]; then
  cp "$MCP_PATH" "$BACKUP_PATH"
else
  printf '{\n  "imports": [],\n  "settings": { "toolPrefix": "server", "idleTimeout": 10 },\n  "mcpServers": {}\n}\n' > "$MCP_PATH"
fi

echo "Backup: $BACKUP_PATH"
```

After smoke completion:

```bash
if [ -f "$BACKUP_PATH" ]; then
  cp "$BACKUP_PATH" "$MCP_PATH"
fi
```

---

## Happy-path Smoke

1. Open Desktop → **Settings → MCP**.
2. Confirm existing shared servers load and provenance badge shows global config context.
3. Click **Add server** and create a stdio entry:
   - Name: `smoke-local`
   - Command: Node executable (`node` or full `process.execPath`)
   - Args: `apps/desktop/e2e/fixtures/mcp-stdio-server.mjs`
4. Save and confirm the row appears.
5. Click **Refresh** and confirm:
   - Status badge shows **Connected**.
   - Tool summary appears (e.g., `echo`, `ping`).
6. Click **Edit**, change args (e.g., add `--alt`), save, refresh again, confirm updated tool names.
7. Click **Remove** then **Confirm remove**, confirm row is gone.

---

## Failure-path Smoke

### Reconnect failure (row-scoped)

1. Re-add `smoke-local` entry.
2. Edit command to a non-existent binary, e.g. `not-a-real-command-xyz`.
3. Click **Reconnect**.
4. Confirm only that row shows an error badge/code (e.g. `COMMAND_NOT_FOUND`) and error message; rest of panel remains interactive.

### Malformed config (panel-scoped)

1. Corrupt `~/.kata-cli/agent/mcp.json` intentionally:

```bash
printf '{bad-json' > "$HOME/.kata-cli/agent/mcp.json"
```

2. In Desktop MCP panel, click **Refresh**.
3. Confirm malformed-config error appears in panel.
4. Restore valid JSON (from backup) and refresh; panel recovers.

---

## Evidence to capture

- Screenshot of MCP panel with connected status + tools.
- Screenshot of reconnect failure badge/message.
- Screenshot of malformed-config error surface.
- Final note confirming backup restore completed.
