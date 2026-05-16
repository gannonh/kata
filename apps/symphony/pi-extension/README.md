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
- `/symphony:attach [url]`
- `/symphony:detach`
- `/symphony:console`
- `/symphony:status`
- `/symphony:refresh`
- `/symphony:steer <ISSUE> <instruction>`
- `/symphony:stop`

## Console keys through Slice 2

- `↑` / `↓` selects a running worker.
- `r` requests an immediate Symphony refresh and reloads state.
- `s` prompts for a steer instruction for the selected worker.
- `d` toggles selected-worker details.
- `q` or Escape closes the console and leaves Symphony running.

## Progress feedback

Commands that can take a few seconds show Pi-native progress feedback while they run:

- `/symphony:refresh`, `/symphony:attach [url]`, and `/symphony:stop` use inline working text plus the Symphony footer status.
- `/symphony:start`, `/symphony:init`, and `/symphony:doctor` use a blocking loader panel.
- Symphony tools emit partial progress updates before returning their final result.

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
