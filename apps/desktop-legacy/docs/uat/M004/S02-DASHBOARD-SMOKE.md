# S02 Dashboard + Escalation Live Smoke

## Scope

Validate S02 only:
- live worker dashboard snapshot in Desktop settings
- pending escalation visibility
- inline escalation response submission
- reconnect/disconnected/stale/failure feedback

This checklist intentionally does **not** claim S03 kanban convergence.

## Preconditions

- Symphony runtime available and configured in `.kata/preferences.md` (`symphony.url`, `symphony.workflow_path`)
- Desktop app built from current branch
- A managed workflow that can produce at least one pending escalation

## Smoke Steps

1. Launch Desktop and open **Settings → Symphony**.
2. Click **Start** in Symphony Runtime panel.
3. Confirm runtime phase changes to **Ready**.
4. Confirm dashboard connection badge is **connected** and worker/queue/completed counts render.
5. Trigger or wait for a real pending escalation from Symphony.
6. Confirm escalation card appears with identifier + question preview.
7. Enter response text and click **Submit response**.
8. Confirm success banner appears and escalation list updates (removed or state refreshed).
9. Simulate/observe reconnect condition (restart Symphony or drop connection).
10. Confirm dashboard shows reconnecting/disconnected feedback and stale/error visibility.
11. Restore connection and confirm baseline refresh repopulates workers/escalations.

## Expected Evidence

- Screenshot: Symphony Runtime phase = Ready
- Screenshot: Dashboard worker/escalation summary populated
- Screenshot: Pending escalation card before submit
- Screenshot: Post-submit success state and refreshed list
- Screenshot: Reconnect/disconnected visible feedback

## Pass Criteria

- Dashboard updates from real Symphony runtime without renderer-side transport logic
- Escalations are actionable inline and submission reaches Symphony
- Reconnect/disconnect/failure states are visible and truthful
- Post-response and post-reconnect baseline refreshes are observable in UI
