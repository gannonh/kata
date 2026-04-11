# M007: QoL Backlog Sweep — UAT Report

**Date:** 2026-04-10
**Milestone:** [M007] QoL Backlog Sweep
**Method:** agent-browser --cdp 9333 connected to live Electron + vitest CLI for CP5
**Environment:** Dev mode (`bun run dev:renderer` + Electron with `--remote-debugging-port=9333`), Anthropic + OpenAI API keys configured, GitHub Copilot OAuth via `kata login`
**Branch:** `desktop/uat/M007`
**Walkthrough source:** [M007-QOL-ACCEPTANCE.md](./M007-QOL-ACCEPTANCE.md)

---

## Summary

| # | Checkpoint | Requirement | Slice | Status | Evidence |
|---|---|---|---|---|---|
| CP1 | Provider Truthfulness | R025 | S01 | PASS (after fix) | [09-kat-2498-fixed-copilot-authenticated.png](./screenshots/09-kat-2498-fixed-copilot-authenticated.png), [10-anthropic-oauth-detail-pane.png](./screenshots/10-anthropic-oauth-detail-pane.png), [11-openai-oauth-detail-pane.png](./screenshots/11-openai-oauth-detail-pane.png) |
| CP2 | Board PR Context | R026 | S02 | PASS | [07-board-pr-badges-done-column.png](./screenshots/07-board-pr-badges-done-column.png) |
| CP3 | MCP Recovery | R028 | S03 | PASS | [04-mcp-error-refresh-config-cta.png](./screenshots/04-mcp-error-refresh-config-cta.png), [05-mcp-recovered.png](./screenshots/05-mcp-recovered.png) |
| CP4 | Subagent Chat UX | R027 | S05 | PASS | [08-subagent-card-done.png](./screenshots/08-subagent-card-done.png) |
| CP5 | Deterministic Validation | R029 | S04 | PASS | Vitest output: identical `Test Files` / `Tests` counts with and without `KATA_SYMPHONY_BIN_PATH` (43 / 567 on the PR #313 branch tip; see spot-check below) |

**Overall:** 5 PASS. CP1 initially failed with a Copilot OAuth detection regression ([KAT-2498](https://linear.app/kata-sh/issue/KAT-2498)); the fix was authored, tested, and live-verified on this UAT branch. The walkthrough now passes clean end-to-end.

---

## Manual Verification Steps

Use these steps to reproduce the agent-driven walkthrough yourself. The agent already exercised the automated path; your job is to confirm the human-facing behavior matches and spot anything the agent missed.

### Launch

```bash
cd apps/desktop
bun run desktop:dev
```

### CP1 — Provider Truthfulness (R025)

1. On launch, the app should **skip the onboarding wizard** and go straight to chat (an Anthropic key is already configured in `~/.kata-cli/agent/auth.json`).
2. Click **Settings** → **Providers** tab.
3. Confirm each provider row reflects reality (all OAuth providers below use `kata login` sessions stored in `~/.kata-cli/agent/auth.json`):
   - **Anthropic** — `OAuth session Authenticated` (Claude Pro/Max session)
   - **OpenAI** — `OAuth session Authenticated` (Codex subscription, aliased from `openai-codex`)
   - **GitHub Copilot** — `OAuth session Authenticated`
   - **Google / Mistral / Bedrock / Azure** — `Not configured missing`
   - If any OAuth row reads `Not connected` or `Expired`, the [KAT-2498](https://linear.app/kata-sh/issue/KAT-2498) fix did not take effect — flag it immediately.

### CP2 — Board PR Context (R026)

1. Look at the right-pane **Workflow Board**. It should show `[M007] QoL Backlog Sweep` as the active milestone.
2. Click the **Milestone** scope button (next to Project/View).
3. Expected columns: Backlog expanded (1 card = KAT-2498), Done expanded (5 cards), Todo/In Progress/In Review collapsed to vertical side tabs.
4. On each of the 5 Done cards you should see a PR badge: `#308`, `#309`, `#310`, `#311`, `#312` with a git-pull-request icon and a violet merged-status dot.
5. Hover the badge — it should be a link to `github.com/gannonh/kata/pull/<n>`.
6. Confirm **KAT-2498** in Backlog has no badge (no PR linked yet).

### CP3 — MCP Recovery (R028)

1. Settings → **MCP** tab. You should see `chrome-devtools` in a healthy state.
2. In a second terminal, corrupt the config:
   ```bash
   cp ~/.kata-cli/agent/mcp.json /tmp/mcp.backup
   echo "{ broken" > ~/.kata-cli/agent/mcp.json
   ```
3. Back in Desktop, click **Refresh** in the MCP panel.
4. A **`Refresh config`** button should appear (exact label — not "Reconnect" or "Reauthenticate").
5. Restore the config:
   ```bash
   cp /tmp/mcp.backup ~/.kata-cli/agent/mcp.json
   ```
6. Click **Refresh config** in the panel. The panel should return to healthy — no app restart needed.

### CP4 — Subagent Chat UX (R027)

1. Click **+ New Session**, switch permission mode to **Auto**.
2. Send this exact message:
   > Use the subagent tool to dispatch a single scout subagent with the task: "List the top-level directories in this repo". Use mode=single, agent=scout.
3. In the agent's response you should see a dedicated card (not collapsed raw JSON) with:
   - A blue **`scout`** badge (agent name)
   - A green **`done`** badge (status)
   - The task text visible: `List the top-level directories in this repo`
   - A collapsible trigger to expand details
4. Bonus: try `mode=parallel` with two agents — each sub-result should be a separate row with its own status.

### CP5 — Deterministic Validation (R029)

Already verified via CLI but you can spot-check:

```bash
cd apps/desktop
KATA_SYMPHONY_BIN_PATH=/fake npx vitest run 2>&1 | tail -5
unset KATA_SYMPHONY_BIN_PATH && npx vitest run 2>&1 | tail -5
```

Both runs should report identical `Test Files` / `Tests` counts. Exact numbers drift as tests are added; the invariant is *identical* across the two runs, not any specific count.

### What to report back

- **CP1 OAuth rows** — confirm every OAuth-logged-in provider reads `OAuth session Authenticated` (not `Not connected` or `Expired`). A regression here reopens [KAT-2498](https://linear.app/kata-sh/issue/KAT-2498).
- Any other surprises in CP2–CP5 (misrendering, stale data, broken recovery, crashes).
- Rendering/layout issues you notice while poking around.
- "Looks good" is a valid response — means we can merge.

---

## Detailed Observations

### CP1 — Provider Truthfulness (R025): PASS (after fix)

The Settings → Providers panel displays accurate state for every configured provider. Initial walkthrough exposed two regressions that were fixed on this UAT branch as part of [KAT-2498](https://linear.app/kata-sh/issue/KAT-2498).

**Final state (post-fix):**

| Provider | Display | Truthful? |
|---|---|---|
| Anthropic | `OAuth session Authenticated` | yes (Claude Pro/Max OAuth) |
| OpenAI | `OAuth session Authenticated` | yes (ChatGPT Plus / Codex OAuth) |
| Google | `Not configured missing` | yes |
| Mistral | `Not configured missing` | yes |
| AWS Bedrock | `Not configured missing` | yes |
| Azure OpenAI | `Not configured missing` | yes |
| GitHub Copilot | `OAuth session Authenticated` | yes |

**Regressions found and fixed:**

1. **Copilot source-of-truth mismatch.** `auth-bridge.ts` detected Copilot OAuth only via filesystem probe at `~/.config/github-copilot/{hosts,apps}.json` — the GitHub Copilot CLI's own token store. `kata login github-copilot` writes OAuth tokens to `~/.kata-cli/agent/auth.json` under `github-copilot` with `type: "oauth"`, so Desktop falsely reported `Not connected` for the common `kata`-managed path. Fix: `detectOAuthProvider` now reads the `auth.json` record first (via `toProviderInfo`) and only falls back to the filesystem probe when no record exists. Preserves compatibility with Copilot-CLI-authenticated users.

2. **Stale-access-token false expired.** `toProviderInfo`'s OAuth branch flagged any record with a past `expires` value as `expired`, ignoring that `expires` describes only the access token. A `refresh`-backed session is live — the orchestrator auto-refreshes on the next request. This silently broke Anthropic too whenever its access token aged out. Fix: only mark `expired` when there is no refresh token AND the access token has lapsed.

3. **UI ignored runtime `authType`.** `ProviderAuthPanel` and the onboarding steps decided "is this an OAuth row?" from the static `OAUTH_PROVIDERS` set (which contained only `github-copilot`), not the per-row `info.authType` that `toProviderInfo` already surfaces truthfully. As a result, OAuth-authed Anthropic and OpenAI rows rendered the API-key UI with "valid" badges instead of the OAuth detail pane. Fix: row and detail-pane `isOAuth` checks now read `info.authType === 'oauth'`. Onboarding `KeyInputStep` gained an `authType` prop plumbed from `OnboardingWizard`. The static `OAUTH_PROVIDERS` set remains intentionally scoped to `github-copilot` — it now exclusively encodes the backend invariant "this provider has no API-key mode" for the `setProviderKey` / `removeProviderKey` / `validateKey` guards.

**Onboarding sub-criterion:** PASS. Launching with a configured Anthropic session did not present the onboarding wizard — the app went straight to the chat view. The onboarding-skip path from KAT-2466 is working.

**Follow-up (separate scope):** onboarding still uses the static set to decide the initial step for providers at first-run (`OnboardingWizard.createMissingProviderMap`). Expanding first-run to offer `kata login anthropic` / `kata login openai-codex` / `kata login google` flows is a UX change, not a bug fix, and is out of scope for M007.

### CP2 — Board PR Context (R026): PASS

Workflow board (right pane), Milestone scope, M007:

- **Done column** (5 cards): each S0x slice card displays a PR badge with PR number and status
  - `KAT-2463 #308` — S01 → https://github.com/gannonh/kata/pull/308
  - `KAT-2468 #310` — S02 → /pull/310
  - `KAT-2472 #309` — S03 → /pull/309
  - `KAT-2476 #311` — S04 → /pull/311
  - `KAT-2480 #312` — S05 → /pull/312
- **Backlog column** (1 card): `KAT-2498` (the bug filed during this UAT) shows **no PR badge** — correct, no PR linked yet.

PR badge structure (verified via DOM): `<a data-testid="pr-badge-308" href="https://github.com/gannonh/kata/pull/308" target="_blank" rel="noopener noreferrer">` with a Lucide `git-pull-request` icon, `#308` text, and a status indicator dot. All five badges are `bg-violet-500` (merged status).

Auto-collapse/expand: With Milestone scope on M007, only Backlog (1 card) and Done (5 cards) are expanded. Todo, In Progress, and In Review are collapsed to vertical side tabs because they have 0 cards. Filing KAT-2498 mid-session caused it to appear in the previously-empty Backlog column on the next live-data refresh — auto-expand confirmed.

### CP3 — MCP Recovery (R028): PASS

Settings → MCP shows two configured servers (`chrome-devtools`, `linear`). Test sequence:

1. Backed up `~/.kata-cli/agent/mcp.json` and overwrote it with `{ invalid json syntax`.
2. Clicked **Refresh** in the MCP panel.
3. Panel surfaced a **`Refresh config`** button (CTA matched the spec exactly — not generic "Reconnect" or "Reauthenticate").
4. Restored the original `mcp.json`.
5. Clicked the **Refresh config** CTA.
6. Panel returned to healthy state — `Refresh config` button disappeared, normal `Refresh` and `Add server` actions visible. No app restart required.

The reliability gate (KAT-2473) and the McpServerPanel CTA rendering (KAT-2475) are working end-to-end through the real main → preload → renderer path.

### CP4 — Subagent Chat UX (R027): PASS

Live test in a fresh chat session, Auto permission mode:

- **Prompt:** `Use the subagent tool to dispatch a single scout subagent with the task: "List the top-level directories in this repo". Use mode=single, agent=scout.`
- **Outcome:** Agent invoked the `subagent` tool. Chat rendered a dedicated `SubagentCard` (not the generic JSON `GenericToolCallCard`).

Card structure (verified via DOM):

- **Agent badge:** `scout` (blue, `border-blue-500/40 bg-blue-500/15 text-blue-700`)
- **Status badge:** `done` (emerald, `border-emerald-500/40 bg-emerald-500/15 text-emerald-700`, uppercase)
- **Task text:** `List the top-level directories in this repo`
- **Collapsible trigger** for expanding details

Routing verified in `src/renderer/components/chat/ToolCallCard.tsx:98-99`:
```ts
case 'subagent':
  return <SubagentCard tool={tool} />
```

Running and error states were not exercised live (happy-path test only). Unit-test coverage for those variants exists in `src/renderer/components/chat/__tests__/SubagentCard.test.tsx`.

### CP5 — Deterministic Validation (R029): PASS

Two consecutive vitest runs from `apps/desktop` produce identical `Test Files` / `Tests` counts regardless of the host `KATA_SYMPHONY_*` env state. Exact totals drift as new tests land, so the acceptance invariant is *identical counts across the two runs*, not a fixed number.

Snapshot at the PR #313 branch tip:

```
$ KATA_SYMPHONY_BIN_PATH=/some/fake/path npx vitest run
 Test Files  43 passed (43)
      Tests  567 passed (567)

$ unset KATA_SYMPHONY_BIN_PATH KATA_SYMPHONY_URL SYMPHONY_URL && npx vitest run
 Test Files  43 passed (43)
      Tests  567 passed (567)
```

Identical. Mechanism verified at `src/test-setup.ts:14-26` — registered in `vitest.config.ts` `setupFiles`, strips `KATA_SYMPHONY_BIN_PATH`, `KATA_SYMPHONY_URL`, and `SYMPHONY_URL` from `process.env` before any test file executes.

---

## Issues Found

| ID | Title | Severity | Found in | Resolution |
|---|---|---|---|---|
| 1 | Desktop Settings falsely shows GitHub Copilot as "Not connected" when `kata login` is authenticated | High | CP1 / R025 | Fixed on this branch — [KAT-2498](https://linear.app/kata-sh/issue/KAT-2498) |
| 2 | Desktop Settings falsely shows OAuth-authed Anthropic and OpenAI as expired when access token ages out | High | CP1 / R025 | Fixed on this branch (subsumed under [KAT-2498](https://linear.app/kata-sh/issue/KAT-2498)) |
| 3 | Settings and onboarding render API-key UI for OAuth-authed Anthropic and OpenAI rows | High | CP1 / R025 | Fixed on this branch (subsumed under [KAT-2498](https://linear.app/kata-sh/issue/KAT-2498)) |

---

## Test Environment

- **Platform:** macOS (darwin 25.3.0)
- **Worktree:** `/Volumes/EVO/kata/kata-mono.worktrees/wt-desktop`
- **Branch:** `desktop/uat/M007`
- **Vite renderer:** `bun run dev:renderer` on `127.0.0.1:5174`
- **Electron:** `npx electron . --remote-debugging-port=9333` (CDP)
- **Automation:** `agent-browser --cdp 9333` (CDP target = Kata Desktop window)
- **Auth state:** Anthropic API key + OpenAI API key in `~/.kata-cli/agent/auth.json`; GitHub Copilot OAuth (logged in via `kata login github-copilot`)
- **MCP config:** `~/.kata-cli/agent/mcp.json` with `chrome-devtools` and `linear` (disabled) servers

---

## Conclusion

M007 acceptance **passes end-to-end**. All five checkpoints verified on this UAT branch after the CP1 regressions were fixed in the same changeset ([KAT-2498](https://linear.app/kata-sh/issue/KAT-2498)). The walkthrough is reproducible from this report, the evidence is captured in `screenshots/`, and the test suite is green with deterministic results across host environments (43 files / 567 tests on the PR #313 branch tip, stable counts in back-to-back runs).
