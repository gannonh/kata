# M005 / S01 — Kanban Interaction Smoke

## Scope

Validate **interaction closure only** for the workflow board:

- Scope switching (Active / Project / Milestone)
- Inline escalation response from a card
- Collapsible columns with persisted presentation
- Direct Linear issue opening from a card

> Out of scope for this smoke: card move/create/edit workflow mutation. Those are intentionally deferred to **S02**.

## Preconditions

- Kata Desktop built and running in test/runtime mode.
- Symphony connection available (or mock mode) with at least one pending escalation mapped to a visible card.
- Workflow board visible in right pane.

## Smoke Steps

1. **Board scope switching**
   - Click `Active` scope.
   - Confirm header status reads `Scope: Active` (or explicit fallback message if operator state is stale/disconnected).
   - Click `Project` and `Milestone` scopes.
   - Confirm status updates reflect each selection.

2. **Column collapse + hidden-work visibility**
   - Collapse a column containing cards (e.g., Todo).
   - Confirm collapsed chip/badge indicates hidden card count.
   - Reload Desktop and confirm collapse state persists for the same workspace+scope.
   - Click `Expand N columns` and confirm all columns restore.

3. **Inline escalation response on card**
   - On a card with an escalation badge, open `Respond to escalation`.
   - Enter response text and submit.
   - Confirm card-level result message shows success/failure explicitly.
   - If success, confirm pending escalation count drops after refresh.
   - If failure, confirm failure remains visible (no silent success).

4. **Direct issue action**
   - Click `Open Linear issue` on a card.
   - Confirm card-level status message indicates open action result.

5. **Truthful stale/disconnected notice behavior**
   - Force stale/disconnected operator state (or use a mock mode).
   - Confirm board keeps workflow cards visible and displays explicit stale/disconnected notice.
   - Confirm inline escalation submit controls become disabled when active operator state is not fresh.

## Pass/Fail Criteria

- **PASS** when all four interaction flows above work and each user action reports explicit success/failure state.
- **FAIL** if any interaction silently no-ops, hides failure, or loses visibility of stale/disconnected state.

## Reviewer Notes

- This smoke intentionally does **not** assert real workflow mutation (move/create/edit).
- Mutation verification belongs to S02 acceptance.
