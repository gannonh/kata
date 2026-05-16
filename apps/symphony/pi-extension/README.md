# @kata-sh/pi-symphony-extension

Pi extension for initializing, launching, attaching to, and monitoring Kata Symphony.

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

   ```text
   /symphony:start .symphony/WORKFLOW.md
   ```

   or:

   ```text
   /symphony:attach http://127.0.0.1:<port>
   ```

   Expected: the Symphony console opens and the status block shows the attached base URL.

3. Create or use a Symphony state with at least one retry entry, blocked issue, completed issue, and pending escalation.

   Expected: the console shows `Retry Queue`, `Blocked Issues`, `Completed Issues`, and `Pending Escalations` sections.

4. Use `↑` / `↓` to select each Wave 3 item type.

   Expected: the detail panel shows running, retry, blocked, completed, and escalation-specific fields.

5. Select a pending escalation, press `e`, and enter `{"approved":true}`.

   Expected: Pi reports `Escalation response sent for <request_id>` and the console refreshes.

6. Watch recent events after escalation creation and response.

   Expected: escalation lifecycle events appear in the `Events` section.
