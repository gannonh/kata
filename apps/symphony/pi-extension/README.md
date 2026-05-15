# @kata-sh/pi-symphony-extension

Pi extension for initializing, launching, attaching to, and monitoring Kata Symphony.

## Local development

```sh
pnpm --dir apps/symphony/pi-extension test
pnpm --dir apps/symphony/pi-extension typecheck
```

Run it locally with `pi -e ./apps/symphony/pi-extension`.

## Commands through Slice 2

- `/symphony:help`
- `/symphony:init [--force]`
- `/symphony:doctor [workflow]`
- `/symphony:start [workflow]`
- `/symphony:attach <url>`
- `/symphony:dashboard`
- `/symphony:status`
- `/symphony:refresh`
- `/symphony:steer <ISSUE> <instruction>`
- `/symphony:stop`

## Dashboard keys through Slice 2

- `↑` / `↓` selects a running worker.
- `r` requests an immediate Symphony refresh and reloads state.
- `s` prompts for a steer instruction for the selected worker.
- `d` toggles selected-worker details.
- `q` or Escape closes the dashboard and leaves Symphony running.

## Slice 1 verification

Verified commands:

```text
/symphony:help
/symphony:status
```

Package checks:

```sh
pnpm --dir apps/symphony/pi-extension test
pnpm --dir apps/symphony/pi-extension typecheck
```
