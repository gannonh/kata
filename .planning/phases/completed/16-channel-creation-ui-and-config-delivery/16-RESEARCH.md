---
phase: 16-channel-creation-ui-and-config-delivery
type: research
created: 2026-02-10
confidence: HIGH (codebase-verified)
---

# Phase 16 Research: Channel Creation UI and Config Delivery

## Summary

Phase 16 closes two v0.7.0 blockers: (1) users cannot create channels from the UI, and (2) the daemon never receives channel configs after starting. The codebase already has all the primitives needed. The CHANNELS_UPDATE IPC handler already performs create-or-update (mkdirSync + writeFileSync). The daemon already handles `configure_channels` commands. The missing pieces are a creation form in the renderer and a config delivery function in the main process that fires when the daemon reaches `running` state or when channel configs change.

## Standard Stack

Use exclusively what is already in the codebase. No new dependencies.

| Concern | Use | Location |
|---------|-----|----------|
| Adapter type selection | `SettingsRadioGroup` / `SettingsRadioCard` | `@/components/settings` |
| Text inputs (slug, channel IDs, poll interval) | `SettingsInput`, `SettingsSecretInput` | `@/components/settings` |
| Select dropdown (if needed) | `SettingsSelect` | `@/components/settings` |
| Toggle | `SettingsToggle` / `Switch` | `@/components/settings`, `@/components/ui/switch` |
| Form container | `SettingsSection`, `SettingsCard` | `@/components/settings` |
| Dialog overlay | `Dialog`, `DialogContent`, `DialogHeader`, `DialogFooter` | `@/components/ui/dialog` |
| Credential storage | `setChannelCredential` IPC | Already wired in preload |
| Config persistence | `updateChannel` IPC (CHANNELS_UPDATE) | Already does create-or-update via mkdirSync |
| Slug generation | `slugify`, `isValidSlug` | `@/renderer/lib/slugify` |
| Daemon commands | `DaemonManager.sendCommand()` | `apps/electron/src/main/daemon-manager.ts` |
| Channel config types | `ChannelConfig`, `ChannelFilter` | `@craft-agent/shared/channels` |
| Daemon command type | `DaemonCommand` `configure_channels` variant | `@craft-agent/core/types/daemon.ts` |
| State management | Jotai atoms (`daemonStateAtom`, `channelConfigsAtom`) | `@/atoms/daemon` |

## Architecture Patterns

### Pattern 1: Channel Creation as Inline Expansion on ChannelSettingsPage

The creation flow belongs on the existing `ChannelSettingsPage`, not a separate route. The codebase pattern for adding items is inline expansion (visible in source list, label creation). Use a collapsible form section that appears when the user clicks "Add Channel" and collapses on save or cancel.

**Rationale:** The app uses settings page patterns with `SettingsSection` / `SettingsCard` throughout. A Dialog could work but inline expansion is more consistent with how labels and other settings entities are created. The key constraint: the form should be simple (5 fields) so an inline approach is appropriate.

### Pattern 2: Adapter-Conditional Form Fields

The form fields change based on adapter type:

| Field | Slack | WhatsApp |
|-------|-------|----------|
| Adapter type | Required | Required |
| Slug (auto-generated) | Required | Required |
| Bot token (credential) | Required (string) | N/A |
| Auth state path (credential) | N/A | Required (filesystem path) |
| Channel IDs to monitor | Required (comma-separated) | N/A |
| Trigger patterns | Optional | Optional |
| Poll interval | Optional (default 10000ms) | N/A |

Use conditional rendering keyed on the selected adapter type. The credential field changes between a `SettingsSecretInput` (Slack bot token) and a `SettingsInput` with folder browse (WhatsApp auth state path).

### Pattern 3: Config Delivery via DaemonManager.sendCommand

The main process must build and send a `configure_channels` command to the daemon. The trigger points are:

1. **Daemon reaches `running` state** -- The `onEvent` callback in `index.ts` (line 327) already fires for every daemon event. When `status_changed` with `status: 'running'` arrives, call a `deliverChannelConfigs()` function.

2. **Channel config changes** -- After any CHANNELS_UPDATE, CHANNELS_DELETE, or channel credential change IPC handler completes, call `deliverChannelConfigs()` if the daemon is running.

The `deliverChannelConfigs()` function must:
1. Call `getWorkspaces()` to get all workspaces
2. For each workspace, read `{rootPath}/channels/` directory (same logic as CHANNELS_GET handler)
3. For each enabled channel, resolve its credential via `CredentialManager.getChannelCredential(workspaceId, channelSlug)` (preferred) or `CredentialManager.get({ type: 'source_api_key', workspaceId, sourceId: sourceSlug })` (legacy fallback)
4. Build the `configure_channels` command payload
5. Call `daemonManager.sendCommand(cmd)`

### Pattern 4: Slug Auto-Generation with Uniqueness Check

Generate the channel slug from the adapter type + a user-provided name. Example: user types "my-team-alerts", adapter is "slack", slug becomes "slack-my-team-alerts". Validate uniqueness against existing channel slugs loaded at form mount time.

Use the existing `slugify()` function from `@/renderer/lib/slugify` and `isValidSlug()` for validation. The slug must be unique within the workspace's channels directory.

### Pattern 5: Credential Storage at Creation Time

When the user fills the creation form and clicks Save:
1. Build the `ChannelConfig` object with `credentials: { channelSlug: slug }`
2. Call `updateChannel(workspaceId, config)` to persist the config JSON
3. Call `setChannelCredential(workspaceId, slug, tokenValue)` to store the credential
4. If the daemon is running, trigger `deliverChannelConfigs()` to reconfigure

These must be sequential (config first, then credential, then daemon reconfigure). The IPC calls are already async and available in the preload API.

## Don't Hand-Roll

| Problem | Use Instead |
|---------|-------------|
| Channel config file I/O | Existing `CHANNELS_UPDATE` IPC handler (already does mkdirSync + writeFileSync) |
| Credential encryption | Existing `setChannelCredential` IPC (routes to AES-256-GCM CredentialManager) |
| Slug validation | Existing `slugify()` and `isValidSlug()` from `@/renderer/lib/slugify` |
| Daemon communication protocol | Existing `DaemonManager.sendCommand()` with JSON-lines IPC |
| Form components | Existing `Settings*` component library (SettingsInput, SettingsRadioGroup, etc.) |
| Workspace enumeration | Existing `getWorkspaces()` from `@craft-agent/shared/config` |
| Channel config reading | Reuse the same logic from CHANNELS_GET handler (readdir + readFileSync) |

## Common Pitfalls

### Pitfall 1: Race Between Daemon Start and Config Delivery

The daemon emits `status_changed: running` before any `configure_channels` command is sent. If the main process calls `deliverChannelConfigs()` before the daemon's stdin reader is fully set up, the command may be lost.

**Mitigation:** The daemon's stdin reader loop is started during `main()` before `emit({ type: 'status_changed', status: 'running' })` (entry.ts lines 57-68 run before line 54). The `running` event only fires after the reader is set up, so the race is safe. However, add a guard: only send `configure_channels` when `daemonManager.getState() === 'running'`.

### Pitfall 2: Credential Not Yet Stored When Config Delivered

If channel creation saves config and credential in parallel, the daemon might try to resolve a credential that hasn't been written yet.

**Mitigation:** Save credential before triggering daemon reconfigure. Sequence: (1) save config, (2) save credential, (3) deliver to daemon.

### Pitfall 3: Stale Channel List After Creation

The `ChannelSettingsPage` loads channels in a `useEffect` on mount. After creating a new channel, the local state must be updated. Two approaches: re-fetch from IPC or optimistically add to local state.

**Mitigation:** Use optimistic local state update (append the new config to the `channels` array) since the write is synchronous (writeFileSync in the handler). This matches the existing toggle pattern which does `setChannels(prev => prev.map(...))`.

### Pitfall 4: Missing configDir Expansion

Workspace `rootPath` values contain `~` (e.g., `~/.kata-agents/workspaces/demo`). The main process IPC handlers already do `.replace(/^~/, homedir())`. The `deliverChannelConfigs()` function must do the same.

### Pitfall 5: Empty Workspaces Array

If no workspaces have channels configured, the `configure_channels` command should still be sent with an empty `workspaces` array to clear any previously running adapters. The daemon handler (entry.ts lines 88-122) already handles this by stopping existing runners before starting new ones.

### Pitfall 6: Duplicate Slug on Creation

If the user tries to create a channel with a slug that already exists, the CHANNELS_UPDATE handler will silently overwrite it. The creation form must validate slug uniqueness before saving.

## Code Examples

### Example 1: deliverChannelConfigs Function (Main Process)

```typescript
// In apps/electron/src/main/ipc.ts or a new utility file
async function deliverChannelConfigs(daemonManager: DaemonManager): Promise<void> {
  if (daemonManager.getState() !== 'running') return;

  const credManager = getCredentialManager();
  const workspaces = getWorkspaces();
  const workspacePayloads: DaemonCommand['workspaces'] = [];

  for (const ws of workspaces) {
    const rootPath = ws.rootPath.replace(/^~/, homedir());
    const channelsDir = join(rootPath, 'channels');
    if (!existsSync(channelsDir)) continue;

    const configs: ChannelConfig[] = [];
    const tokens: Record<string, string> = {};

    const slugs = readdirSync(channelsDir);
    for (const slug of slugs) {
      if (!isValidSlug(slug)) continue;
      const configPath = join(channelsDir, slug, 'config.json');
      if (!existsSync(configPath)) continue;
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf-8')) as ChannelConfig;
        if (!config.enabled) continue;
        configs.push(config);

        // Resolve credential: prefer channelSlug, fall back to sourceSlug
        const credKey = config.credentials.channelSlug ?? config.credentials.sourceSlug;
        if (credKey) {
          const token = config.credentials.channelSlug
            ? await credManager.getChannelCredential(ws.id, credKey)
            : await credManager.get({ type: 'source_api_key', workspaceId: ws.id, sourceId: credKey });
          if (token) tokens[credKey] = token;
        }
      } catch { /* skip malformed */ }
    }

    if (configs.length > 0) {
      workspacePayloads.push({
        workspaceId: ws.id,
        configs,
        tokens,
        enabledPlugins: ['slack', 'whatsapp'], // first-party only in v0.7.0
      });
    }
  }

  daemonManager.sendCommand({
    type: 'configure_channels',
    workspaces: workspacePayloads,
  });
}
```

### Example 2: Channel Creation Form State

```typescript
interface ChannelFormState {
  adapter: 'slack' | 'whatsapp' | '';
  name: string;          // User-friendly name, slugified for config
  credential: string;    // Bot token (Slack) or auth state path (WhatsApp)
  channelIds: string;    // Comma-separated Slack channel IDs
  triggerPatterns: string; // Comma-separated regex patterns
  pollIntervalMs: number; // Slack only, default 10000
}

// Build ChannelConfig from form state
function buildChannelConfig(form: ChannelFormState): ChannelConfig {
  const slug = slugify(`${form.adapter}-${form.name}`);
  return {
    slug,
    enabled: true,
    adapter: form.adapter,
    pollIntervalMs: form.adapter === 'slack' ? form.pollIntervalMs : undefined,
    credentials: { channelSlug: slug },
    filter: {
      channelIds: form.adapter === 'slack' && form.channelIds
        ? form.channelIds.split(',').map(s => s.trim()).filter(Boolean)
        : undefined,
      triggerPatterns: form.triggerPatterns
        ? form.triggerPatterns.split(',').map(s => s.trim()).filter(Boolean)
        : undefined,
    },
  };
}
```

### Example 3: Wiring Daemon Config Delivery on State Change

```typescript
// In apps/electron/src/main/index.ts, modify the DaemonManager onEvent callback
daemonManager = new DaemonManager(
  'bun',
  daemonScript,
  configDir,
  (event) => {
    mainLog.info('[daemon] event:', event.type);
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.DAEMON_EVENT, event);
    }
    // Deliver channel configs when daemon reaches running state
    if (event.type === 'status_changed' && event.status === 'running') {
      deliverChannelConfigs(daemonManager!).catch((err) => {
        mainLog.error('[daemon] Failed to deliver channel configs:', err);
      });
    }
  },
  // ... state change callback
);
```

### Example 4: Adapter-Conditional Form Rendering

```tsx
{form.adapter === 'slack' && (
  <>
    <SettingsSecretInput
      label="Bot Token"
      value={form.credential}
      onChange={(v) => setForm(f => ({ ...f, credential: v }))}
      placeholder="xoxb-..."
    />
    <SettingsInput
      label="Channel IDs"
      description="Comma-separated Slack channel IDs to monitor"
      value={form.channelIds}
      onChange={(v) => setForm(f => ({ ...f, channelIds: v }))}
      placeholder="C01234567, C07654321"
    />
    <SettingsInputRow
      label="Poll Interval (ms)"
      value={String(form.pollIntervalMs)}
      onChange={(v) => setForm(f => ({ ...f, pollIntervalMs: parseInt(v) || 10000 }))}
      placeholder="10000"
    />
  </>
)}

{form.adapter === 'whatsapp' && (
  <SettingsInput
    label="Auth State Path"
    description="Directory for WhatsApp auth state persistence"
    value={form.credential}
    onChange={(v) => setForm(f => ({ ...f, credential: v }))}
    placeholder="~/.kata-agents/whatsapp-auth"
  />
)}
```

## State of the Art

### What Exists

- `ChannelSettingsPage` displays channels, toggles enable/disable, deletes channels
- `CHANNELS_GET`, `CHANNELS_UPDATE`, `CHANNELS_DELETE` IPC handlers are all wired
- `CHANNEL_CREDENTIAL_SET`, `CHANNEL_CREDENTIAL_DELETE`, `CHANNEL_CREDENTIAL_EXISTS` IPC handlers are wired
- `DaemonManager.sendCommand()` can send any `DaemonCommand` including `configure_channels`
- Daemon `entry.ts` handles `configure_channels` command with full ChannelRunner lifecycle
- `ChannelRunner` resolves credentials from `channelSlug` (preferred) or `sourceSlug` (legacy)
- All Settings components needed for the form exist
- `daemonStateAtom` and `channelConfigsAtom` Jotai atoms exist in renderer

### What's Missing

1. **Channel creation form** on `ChannelSettingsPage` -- adapter selection, fields, save button
2. **`deliverChannelConfigs()` function** in main process -- loads all workspace channels, resolves credentials, sends to daemon
3. **Trigger on daemon `running` event** -- calls `deliverChannelConfigs()` when daemon becomes ready
4. **Trigger on channel mutation** -- calls `deliverChannelConfigs()` after CHANNELS_UPDATE/DELETE and credential changes
5. **No `CHANNELS_CREATE` IPC needed** -- the existing `CHANNELS_UPDATE` handler already creates directories and writes config

## Open Questions

1. **Should the form use a Dialog or inline expansion?** The existing page has space for inline expansion. Dialog adds modal friction for a simple 5-field form. Recommend inline expansion matching the app's settings pattern, but this is a UI design decision.

2. **Should `deliverChannelConfigs()` live in `ipc.ts` or a separate module?** The function needs access to `getWorkspaces()`, `getCredentialManager()`, file I/O, and `daemonManager`. A standalone utility file (e.g., `channel-config-delivery.ts`) would keep `ipc.ts` from growing further. The file is already very large (2638 lines).

3. **Should `enabledPlugins` be derived from channel adapter types or stored in config?** Currently the daemon entry.ts expects `enabledPlugins` per workspace. For v0.7.0 with only first-party plugins, this can be derived from the adapter types present in channel configs (if any channel uses 'slack', include 'slack' plugin). Post-v0.7.0, this should come from workspace config.

## Sources

All findings are from direct codebase analysis. No external sources were needed because this phase connects existing infrastructure components.

| Source | Type | Confidence |
|--------|------|------------|
| `packages/shared/src/channels/types.ts` | Codebase | HIGH |
| `packages/shared/src/daemon/entry.ts` | Codebase | HIGH |
| `packages/shared/src/daemon/channel-runner.ts` | Codebase | HIGH |
| `packages/core/src/types/daemon.ts` | Codebase | HIGH |
| `apps/electron/src/main/daemon-manager.ts` | Codebase | HIGH |
| `apps/electron/src/main/ipc.ts` (lines 2570-2636) | Codebase | HIGH |
| `apps/electron/src/main/index.ts` (lines 320-340) | Codebase | HIGH |
| `apps/electron/src/renderer/pages/settings/ChannelSettingsPage.tsx` | Codebase | HIGH |
| `apps/electron/src/renderer/components/settings/` | Codebase | HIGH |
| `apps/electron/src/preload/index.ts` (lines 420-452) | Codebase | HIGH |
| `apps/electron/src/shared/types.ts` (lines 999-1006) | Codebase | HIGH |
| `.planning/phases/completed/14-ui-integration/gaps.txt` | Codebase | HIGH |
| `.planning/phases/completed/15-channel-credentials-and-session-attribution/15-01-SUMMARY.md` | Codebase | HIGH |

## Metadata

```yaml
research_duration: ~20min
tools_used: [Grep, Glob, Read, Context7]
files_examined: 22
confidence_overall: HIGH
confidence_notes: >
  All findings verified against live codebase. No external library research
  needed because this phase wires existing components. The daemon command
  format, IPC handlers, credential system, and UI components are all in place.
  The only new code is: (1) a form component, (2) a config delivery function,
  (3) two trigger points for that function.
```
