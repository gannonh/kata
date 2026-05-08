# M007 QoL Backlog Sweep — Assembled Acceptance Walkthrough

**Milestone:** M007 — QoL Backlog Sweep
**Scope:** R025 (Provider Truthfulness), R026 (Board PR Context), R027 (Subagent Chat UX), R028 (MCP Recovery), R029 (Deterministic Validation)

## Purpose

This document defines a repeatable acceptance walkthrough that proves the M007 QoL sweep is coherent across all five requirement surfaces in one real Desktop session. It does **not** re-prove M001–M006 capabilities.

## Prerequisites

- Kata Desktop built and launchable (`cd apps/desktop && bun run build`)
- At least one AI provider configured (e.g. Anthropic API key in `~/.kata-cli/agent/auth.json`)
- A Linear workspace with PR-linked issues (for board PR badge verification)
- MCP config file at `~/.kata-cli/agent/mcp.json`
- Subagent agents available in `~/.kata-cli/agent/agents/` (e.g. `scout.md`, `worker.md`)

## Walkthrough Checkpoints

### CP1: Provider Truthfulness (S01 / R025)

**What to verify:** Onboarding and Settings correctly reflect configured provider state.

**Steps:**
1. Launch Desktop with a configured API-key provider (e.g. Anthropic).
2. Observe onboarding: if a valid key is already configured, the onboarding step should indicate the key is present and allow skipping key entry.
3. Open **Settings → Providers**.
4. Confirm the configured provider shows as connected/authenticated.
5. Confirm OAuth-capable providers (if any) show their OAuth status truthfully (connected vs. not connected).

**Expected outcome:**
- Onboarding does not prompt for a key that is already configured.
- Settings → Providers panel displays accurate connection state for each provider.
- No stale or misleading status labels.

**Evidence:** Screenshot of Settings → Providers showing truthful status.

**Pass criteria:** Provider states match actual configuration. No false "connected" or "missing key" labels.

---

### CP2: Board PR Context (S02 / R026)

**What to verify:** Kanban board cards show PR badges for linked issues and columns auto-collapse/expand appropriately.

**Steps:**
1. Open the kanban board (workflow view) in Desktop.
2. Navigate to a Linear workspace that has issues with linked GitHub PRs.
3. Inspect slice cards — look for PR badge indicators on cards that have associated PRs.
4. Observe column behavior — empty columns should auto-collapse; columns gaining cards should expand.

**Expected outcome:**
- Cards with linked PRs display a PR badge with PR number and status (open/merged/closed).
- Cards without PRs do not show a PR badge.
- Empty kanban columns collapse to save space; columns with cards are expanded.

**Evidence:** Screenshot of kanban board showing at least one card with a PR badge.

**Pass criteria:** PR badges are visible on linked cards. Auto-collapse/expand behaves as described. No phantom badges on unlinked cards.

---

### CP3: MCP Recovery (S03 / R028)

**What to verify:** MCP error states show actionable, truthful recovery CTAs.

**Steps:**
1. Open **Settings → MCP Servers**.
2. Trigger an MCP error condition. Options:
   - Temporarily edit `~/.kata-cli/agent/mcp.json` to contain invalid JSON, then refresh.
   - Configure a server that points to a non-existent command.
3. Observe the error state displayed for the affected server.
4. Confirm the recovery CTA label says **"Refresh config"** (not generic "Reconnect").
5. Fix the config (revert the invalid JSON), then click the recovery CTA.
6. Confirm the server recovers and shows a healthy state.

**Expected outcome:**
- Error state shows a specific, actionable message (not a generic "server error").
- Recovery CTA uses context-aware language matching the error class.
- Clicking recovery CTA after fixing the root cause succeeds.

**Evidence:** Screenshot of MCP error state with recovery CTA visible.

**Pass criteria:** Recovery CTA is truthful and actionable. After fixing config and clicking CTA, server recovers without requiring app restart.

---

### CP4: Subagent Chat UX (S05 / R027)

**What to verify:** Subagent tool calls render as dedicated readable cards instead of collapsed JSON.

**Steps:**
1. Start a chat session in Desktop.
2. Trigger a subagent tool call. Options:
   - Ask the agent to "use the scout subagent to find the auth module in this codebase"
   - Run a `/kata` command that delegates to a subagent
3. While the subagent is running, observe the chat:
   - A dedicated card should appear (not a generic JSON card).
   - The card header shows the agent name (e.g. "scout") as a badge.
   - A running status indicator (amber badge + spinner) is visible.
4. When the subagent completes:
   - Status transitions to "done" (green badge) or "error" (red badge).
   - For errors, the exit code and error message are visible in the card.
5. If testing parallel mode, confirm each sub-result appears as a separate row with individual status.

**Expected outcome:**
- Subagent cards show agent name, task text, and mode badge.
- Running → done/error transition is visible.
- Error states show exit code and message, not hidden in collapsed JSON.
- For parallel/chain, per-result rows are rendered.

**Evidence:** Screenshot of a completed subagent card showing agent name, task, and done status.

**Pass criteria:** Subagent calls never render as raw JSON. Agent name, task, and status are human-readable. Error details are visible without expanding collapsed sections.

---

### CP5: Deterministic Validation (S04 / R029)

**What to verify:** Desktop test suite produces deterministic results regardless of host environment.

**Steps:**
1. Run the test suite with the host `KATA_SYMPHONY_BIN_PATH` set:
   ```bash
   KATA_SYMPHONY_BIN_PATH=/some/path cd apps/desktop && npx vitest run
   ```
2. Run the same test suite without the env var:
   ```bash
   unset KATA_SYMPHONY_BIN_PATH && cd apps/desktop && npx vitest run
   ```
3. Compare results — both runs should produce identical pass/fail outcomes.

**Expected outcome:**
- `test-setup.ts` strips `KATA_SYMPHONY_BIN_PATH`, `KATA_SYMPHONY_URL`, and `SYMPHONY_URL` from `process.env` before tests execute.
- No test depends on host-level Symphony configuration.
- Both runs produce the same number of passing tests with zero failures.

**Evidence:** Terminal output showing matching test counts for both runs.

**Pass criteria:** Test results are identical with and without host Symphony env vars. Zero test failures in both runs.

---

## Summary Checklist

| Checkpoint | Requirement | Slice | Pass/Fail | Evidence |
|------------|-------------|-------|-----------|----------|
| CP1 | R025 — Provider Truthfulness | S01 | ☐ | |
| CP2 | R026 — Board PR Context | S02 | ☐ | |
| CP3 | R028 — MCP Recovery | S03 | ☐ | |
| CP4 | R027 — Subagent Chat UX | S05 | ☐ | |
| CP5 | R029 — Deterministic Validation | S04 | ☐ | |

## Completion Criteria

The M007 milestone acceptance is **PASS** when all five checkpoints pass in one continuous Desktop session (or test run for CP5). Any checkpoint failure blocks milestone completion and requires the owning slice to address the gap.

## Notes

- This walkthrough is bounded to M007 scope. It does not re-test capabilities from M001–M006.
- Evidence should be captured as screenshots or terminal output and attached to the milestone review.
- A reviewer should be able to independently repeat this walkthrough from this document alone.
