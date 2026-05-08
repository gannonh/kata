# Kata Desktop

Kata Desktop is a fresh Electron shell for the Pi RPC runtime (`pi --mode rpc`) with bundled Kata skills.

## Quick Start (packaged app)

1. Build a distributable:

```bash
pnpm run desktop:dist:mac
```

2. Open `apps/desktop/release/Kata Desktop-*.dmg`.
3. Drag **Kata Desktop.app** into **Applications**.
4. Launch the app.
5. Complete onboarding (provider selection + key setup + model selection).

## Development

From repo root:

```bash
pnpm run desktop:dev
```

From `apps/desktop` directly:

```bash
pnpm run desktop:dev
```

### Useful commands

```bash
pnpm run desktop:build      # build main/preload/renderer
pnpm run desktop:dist:mac   # build + bundle kata runtime + package dmg
```

## Build and distribution

Packaging is configured in `apps/desktop/electron-builder.yml`.

`desktop:dist:mac` executes:

1. `scripts/bundle-kata-runtime.sh` (stages bundled Pi runtime, Kata skills, and Kata CLI backend)
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
   # Optional: KATA_PI_BIN_PATH=/absolute/path/to/pi
   KATA_CLI_ROOT=./apps/cli
   KATA_SYMPHONY_BIN_PATH=/path/to/apps/symphony/target/release/symphony
   LINEAR_API_KEY=lin_api_...
   SLACK_WEBHOOK_URL=https://hooks.slack.com/...
   ```
   `KATA_PI_BIN_PATH` selects the optional local Pi RPC harness. `KATA_CLI_ROOT` is different: `/kata` skills inherit it and use it for Kata CLI artifact/backend I/O.
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

## Build and Test the Packaged App

Build the full distributable (bundles Pi runtime + Kata skills + Kata CLI backend + Symphony into a self-contained .app):

```bash
cd apps/desktop
pnpm run desktop:dist:mac
```

This runs the full pipeline: `bundle-kata-runtime.sh` (builds the runtime assets into `vendor/`) → `build` (esbuild + Vite) → `prepare-builder-app.sh` (stages `.bundle-app/`) → `package-mac.sh` (electron-packager + DMG).

**Run the packaged app directly:**

```bash
open "apps/desktop/release/Kata Desktop-darwin-arm64/Kata Desktop.app"
```

**Or install from the DMG:**

```bash
open "apps/desktop/release/Kata Desktop-1.0.0-arm64.dmg"
# Drag Kata Desktop.app to Applications, then launch from Launchpad
```

The packaged app is fully self-contained — it bundles its own Pi runtime, Kata skills, Kata CLI backend, and Symphony binary in `Contents/Resources/`. Changes to `.env.development` or monorepo source don't affect it; rebuild to pick up changes.

### Dev mode vs packaged mode

| | Dev mode (`desktop:dev`) | Packaged (.app) |
|---|---|---|
| Agent RPC runtime | `pi` from PATH or `KATA_PI_BIN_PATH` | `Contents/Resources/pi` (bundled launcher + Pi runtime) |
| Kata artifact I/O | `KATA_CLI_ROOT=./apps/cli` for `/kata` skills | Bundled `Contents/Resources/kata-cli` |
| Symphony | `KATA_SYMPHONY_BIN_PATH` from `.env.development` | `Contents/Resources/symphony` (bundled binary) |
| Preferences | `apps/desktop/.kata/preferences.md` (CWD) | `~/.kata/preferences.md` or last-selected workspace |
| Config | `.env.development` loaded at startup | No `.env` — all config comes from auth.json + preferences |

## Architecture

- **Main process**: `src/main/index.ts`
- **Bridge**: `src/main/pi-agent-bridge.ts`
  - packaged Pi runtime discovery first (`Contents/Resources/pi`)
  - `KATA_PI_BIN_PATH` override and PATH fallback second
  - `KATA_CLI_ROOT` is inherited for `/kata` skill artifact I/O, not used as the RPC runtime
  - clear missing-binary crash message with install hint
- **Renderer**: `src/renderer/`
- **Shared IPC types**: `src/shared/types.ts`

### Bundled runtime resources

Packaged app includes:

- `Contents/Resources/kata` (launcher)
- `Contents/Resources/pi` (Pi RPC launcher)
- `Contents/Resources/kata-runtime/`

This allows Kata Desktop to launch the agent runtime even when `kata` is not on PATH.
Desktop bundles:

- the Pi runtime launcher used for RPC chat
- the Kata CLI backend package
- the canonical Kata skill bundle
- the Symphony binary
