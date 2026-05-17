# @kata-sh/pi-symphony-extension

Pi extension for initializing, launching, attaching to, and monitoring Kata Symphony.

## Requirements

- Pi coding agent with extension package support.
- `symphony >= 2.3.0` available through one of the binary resolution paths below.

The extension resolves the Symphony binary in this order:

1. `SYMPHONY_BIN`
2. repo-local `apps/symphony/target/release/symphony`
3. `symphony` on `PATH`
4. previously saved absolute path
5. prompted absolute path

## Installation

```sh
# Latest npm release
pi install npm:@kata-sh/pi-symphony-extension

# Pinned npm release
pi install npm:@kata-sh/pi-symphony-extension@0.1.1

# Latest monorepo git package
pi install git:github.com/gannonh/kata

# Pinned monorepo git package
pi install git:github.com/gannonh/kata@pi-symphony-v0.1.1
```

## Local development

```sh
pnpm --dir apps/symphony/pi-extension test
pnpm --dir apps/symphony/pi-extension typecheck
```

Run it locally with `pi -e ./apps/symphony/pi-extension`.

## Commands through Wave 3

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

## Console keys through Wave 3

- `↑` / `↓` selects running workers, retry entries, blocked issues, completed issues, and pending escalations.
- `r` requests an immediate Symphony refresh and reloads state.
- `s` prompts for a steer instruction when the selected item is a running worker.
- `e` prompts for a response when the selected item is a pending escalation. Valid JSON is sent as JSON; other input is sent as a string response.
- `d` toggles selected-item details.
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

## Wave 3 manual verification

1. Start Pi with the local extension:

   ```sh
   pi -e ./apps/symphony/pi-extension
   ```

   Expected: Pi starts with Symphony commands available.

2. Start or attach to a Symphony server:

   Start path:

   ```text
   /symphony:start .symphony/WORKFLOW.md
   ```

   Expected: Symphony starts, the console opens, and the status block shows the attached base URL.

   Attach path:

   ```text
   /symphony:attach http://127.0.0.1:<port>
   /symphony:console
   ```

   Expected: attach updates the Symphony attachment, then `/symphony:console` opens the console with the attached base URL in the status block.

3. Create or use a Symphony state with at least one retry entry, blocked issue, completed issue, and pending escalation.

   For deterministic local testing, start the Wave 3 mock server in another terminal:

   ```sh
   pnpm --dir apps/symphony/pi-extension run mock:wave3
   ```

   Then attach Pi to the printed URL:

   ```text
   /symphony:attach http://127.0.0.1:8787
   /symphony:console
   ```

   Expected: the console shows `Retry Queue`, `Blocked Issues`, `Completed Issues`, and `Pending Escalations` sections.

4. Use `↑` / `↓` to select each Wave 3 item type.

   Expected: the detail panel shows running, retry, blocked, completed, and escalation-specific fields.

5. Select a pending escalation, press `e`, and enter `{"approved":true}`.

   Expected: Pi reports `Escalation response sent for <request_id>` and the console refreshes.

6. Watch recent events after escalation creation and response.

   Expected with a real or event-capable Symphony server: escalation lifecycle events appear in the `Events` section. The Wave 3 mock server supports state, refresh, steer, and escalation response checks, but it does not expose `/api/v1/events`.
