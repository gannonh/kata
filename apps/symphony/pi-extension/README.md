# @kata-sh/pi-symphony-extension

Pi extension for initializing, launching, attaching to, and monitoring Kata Symphony.

## Local development

```sh
pnpm --dir apps/symphony/pi-extension test
pnpm --dir apps/symphony/pi-extension typecheck
```

Run it locally with `pi -e ./apps/symphony/pi-extension`.

## Commands in Slice 1

- `/symphony:help`
- `/symphony:init [--force]`
- `/symphony:doctor [workflow]`
- `/symphony:start [workflow]`
- `/symphony:attach <url>`
- `/symphony:dashboard`
- `/symphony:status`
- `/symphony:stop`

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
