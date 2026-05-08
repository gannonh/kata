# S01 Runtime Smoke — Dev + Packaged

This checklist validates **S01 only** (runtime lifecycle controls + truthful status surfaces).

## Preconditions

- Symphony workflow file exists and is valid.
- `symphony.url` and `symphony.workflow_path` are set in `.kata/preferences.md` for the workspace.
- Desktop app can launch with renderer/main bundles built.

## Dev-mode smoke

1. Launch Desktop in dev mode.
2. Open **Settings → Symphony**.
3. Confirm lifecycle starts in one of: `Stopped`, `Disconnected`, or `Config Error` (truthful initial state).
4. Click **Start**.
5. Confirm state transitions through `Starting` → `Ready`.
6. Confirm header badge shows **Symphony: Ready**.
7. Click **Restart**.
8. Confirm temporary `Restarting`/`Starting` then back to `Ready`.
9. Click **Stop**.
10. Confirm state transitions through `Stopping` → `Stopped` (or `Disconnected` if process exited externally).
11. Validate no secrets are shown in status/error surfaces.

## Packaged-mode smoke

1. Build packaged (or packaged-like) Desktop artifact.
2. Launch packaged app and open **Settings → Symphony**.
3. Repeat Start / Restart / Stop flow from dev checklist.
4. Confirm runtime uses packaged/bundled discovery path (not terminal-managed process).
5. Confirm same lifecycle labels and error presentation as dev mode.

## Failure-state smoke

- Misconfigure `symphony.url` (invalid protocol): expect `Config Error` with actionable message.
- Point `symphony.workflow_path` to missing file: expect `Config Error` with missing-path message.
- Keep valid config but force unreachable API URL: expect `Failed` with readiness error.

## Evidence capture

- Screenshot of Symphony settings panel in `Ready` state.
- Screenshot of panel in `Config Error` state.
- Screenshot of app-shell badge while ready and while stopped.
- Note exact Desktop build (dev or packaged) and commit SHA used for smoke.
