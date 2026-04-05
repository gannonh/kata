# Kata Desktop

Kata Desktop is a fresh Electron shell for the Kata CLI runtime (`kata --mode rpc`).

## Quick Start (packaged app)

1. Build a distributable:

```bash
bun run desktop:dist:mac
```

2. Open `apps/desktop/release/Kata Desktop-*.dmg`.
3. Drag **Kata Desktop.app** into **Applications**.
4. Launch the app.
5. Complete onboarding (provider selection + key setup + model selection).

## Development

From repo root:

```bash
bun run desktop:dev
```

From `apps/desktop` directly:

```bash
bun run desktop:dev
```

### Useful commands

```bash
bun run desktop:build      # build main/preload/renderer
bun run desktop:dist:mac   # build + bundle kata runtime + package dmg
```

## Build and distribution

Packaging is configured in `apps/desktop/electron-builder.yml`.

`desktop:dist:mac` executes:

1. `scripts/bundle-cli.sh` (stages bundled kata runtime)
2. `desktop:build`
3. `scripts/prepare-builder-app.sh` (stages `.bundle-app`)
4. `scripts/package-mac.sh` (packaged app + DMG)

Output artifacts:

- `apps/desktop/release/Kata Desktop-<version>-arm64.dmg`
- `apps/desktop/release/Kata Desktop-darwin-arm64/Kata Desktop.app`

## Symphony Integration (Dev)

Desktop can manage a Symphony orchestrator instance and display a live operator dashboard.

### Prerequisites

1. **Build Symphony** (one-time):
   ```bash
   cd apps/symphony && cargo build --release
   ```

2. **Configure `.env.development`** — Desktop's main process loads `apps/desktop/.env.development` at startup. It must contain the Symphony binary path *and* all env vars that Symphony needs at runtime:
   ```
   KATA_BIN_PATH=../../apps/cli/dist/loader.js
   KATA_SYMPHONY_BIN_PATH=/path/to/apps/symphony/target/release/symphony
   LINEAR_API_KEY=lin_api_...
   SLACK_WEBHOOK_URL=https://hooks.slack.com/...
   ```
   The managed Symphony subprocess inherits the Electron process's environment — it does **not** read `apps/symphony/.env` on its own. Copy any required vars from there.

3. **Configure `.kata/preferences.md`** — set the Symphony URL and workflow file path:
   ```yaml
   symphony:
     url: http://localhost:8080
     workflow_path: /absolute/path/to/apps/symphony/WORKFLOW-desktop.md
   ```

### Two modes of operation

**Desktop-managed (Start/Stop/Restart from GUI):**
Open Settings → Symphony → click Start. Desktop spawns the Symphony binary as a child process, monitors readiness via health checks, and connects the live dashboard automatically.

**External Symphony (started outside Desktop):**
Start Symphony yourself (e.g. `./target/release/symphony WORKFLOW-desktop.md`). In Desktop, open Settings → Symphony → click the Dashboard **Refresh** button. The dashboard connects to whatever is at the configured `symphony.url`. The Runtime section will show "Idle" or the last managed-process state, but the Dashboard section connects independently.

## Architecture

- **Main process**: `src/main/index.ts`
- **Bridge**: `src/main/pi-agent-bridge.ts`
  - packaged binary discovery first (`Contents/Resources/kata`)
  - PATH fallback second
  - clear missing-binary crash message with install hint
- **Renderer**: `src/renderer/`
- **Shared IPC types**: `src/shared/types.ts`

### Bundled runtime resources

Packaged app includes:

- `Contents/Resources/kata` (launcher)
- `Contents/Resources/bun/bun`
- `Contents/Resources/kata-runtime/`

This allows Kata Desktop to launch the agent runtime even when `kata` is not on PATH.
