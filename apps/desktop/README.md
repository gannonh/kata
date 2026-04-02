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
