# Kata Desktop (apps/desktop)

Fresh Electron app for Kata Desktop (M001+), using the Kata CLI RPC runtime.

## Runtime architecture

- **Main process**: `src/main/index.ts`
  - creates the BrowserWindow
  - registers IPC handlers (`registerSessionIpc`)
  - persists model + workspace selections to `~/.kata-cli/agent/settings.json`
- **Agent bridge**: `src/main/pi-agent-bridge.ts`
  - spawns `kata --mode rpc --cwd <workspace>`
  - adapts subprocess lifecycle to renderer-friendly status events
  - binary discovery order:
    1. bundled binary at `path.join(process.resourcesPath, 'kata')` when packaged
    2. `KATA_BIN_PATH` when executable
    3. `which kata` / `where kata`
  - emits clear crash message when missing:
    - `Kata CLI not found. Install via: npm install -g @kata-sh/cli`
- **Renderer**: `src/renderer/`
  - chat shell + onboarding + tool rendering UI
  - split-pane layout (chat + contextual right pane)

## Build and packaging

Desktop build and packaging are driven from `apps/desktop/package.json`:

- `bun run desktop:build`
  - `build:main` (esbuild)
  - `build:preload` (esbuild)
  - `build:renderer` (vite)
- `bun run desktop:dist:mac`
  - `bundle:cli` (`scripts/bundle-cli.sh`)
  - `desktop:build`
  - `prepare:builder-app` (`scripts/prepare-builder-app.sh`)
  - package app (`scripts/package-mac.sh` + `electron-builder`)

### Bundled CLI resources (D004)

`bundle-cli.sh` creates app-local runtime assets in `apps/desktop/vendor/`:

- `vendor/kata` — launcher script invoked by `PiAgentBridge`
- `vendor/bun/bun` — bundled Bun runtime used by launcher
- `vendor/kata-runtime/` — bundled `@kata-sh/cli` dist/pkg/resources + production deps

`electron-builder.yml` copies these into packaged app resources:

- `Contents/Resources/kata`
- `Contents/Resources/bun/`
- `Contents/Resources/kata-runtime/`

## Important file map

- `electron-builder.yml` — DMG config (`appId: sh.kata.desktop`, `productName: Kata Desktop`)
- `scripts/bundle-cli.sh` — bundles CLI runtime and launcher
- `scripts/prepare-builder-app.sh` — stages minimal `.bundle-app/` for packaging
- `scripts/package-mac.sh` — creates packaged app + DMG
- `src/main/pi-agent-bridge.ts` — subprocess discovery/spawn/restart/shutdown
- `src/main/ipc.ts` — renderer/main IPC contract
- `src/main/rpc-event-adapter.ts` — RPC event → UI chat/tool events
- `src/main/session-manager.ts` — session persistence and list metadata

## Guardrails

- Product naming must remain **Kata Desktop**.
- Do not reintroduce any legacy Craft-era naming or package namespaces.
- Do not log provider keys or auth file contents.
- Main process code must stay Node-compatible (no Bun-only APIs).
