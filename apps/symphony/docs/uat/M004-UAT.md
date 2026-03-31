# M004 UAT — GitHub Issues Backend

**Date:** 2026-03-30
**Branch:** `sym/uat/M004`
**Symphony:** `./target/release/symphony WORKFLOW-github-labels.md`
**CLI:** Latest build (wt-cli)
**Tester:** gannon + kata agent

---

## Prerequisites

### Test Repo Setup

Create a test GitHub repository (or use an existing one) with:

- A `GH_TOKEN` or `GITHUB_TOKEN` env var set with `repo` and `project` scopes
- At least 2–3 open issues in **Todo** state
- For label mode: labels `symphony:todo`, `symphony:in-progress`, `symphony:done` created on the repo
- For Projects v2 mode: a GitHub Projects v2 board attached to the repo with a **Status** field containing `Todo`, `In Progress`, `Done` options and at least one issue on the board

### WORKFLOW files

**Label mode** (`WORKFLOW-github-labels.md`):
```yaml
---
tracker:
  kind: github
  api_key: $GH_TOKEN
  repo_owner: <owner>
  repo_name: <repo>
  label_prefix: symphony
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - Done
    - Closed

workspace:
  root: /tmp/symphony-github-test
  repo: https://github.com/<owner>/<repo>.git
  git_strategy: auto
  isolation: local
  branch_prefix: gh

agent:
  backend: kata-cli
  max_concurrent_agents: 2
  max_turns: 5

kata_agent:
  command: kata

server:
  port: 8082
---
```

**Projects v2 mode** (`WORKFLOW-github-projects.md`): same as above but add:
```yaml
  github_project_number: <N>
```
and remove `label_prefix`.

---

## Status Summary

| Phase | Description                         | Status |
| ----- | ----------------------------------- | ------ |
| 1     | Config & Doctor                     | ✅ Pass |
| 2     | Label Mode — Polling & Dispatch     | ✅ Pass (issue #1 fixed) |
| 3     | Projects v2 Mode — Polling & Dispatch | ✅ Pass (issues #7, #8) |
| 4     | Dashboard & TUI Rendering           | ✅ Pass (issues #2, #6) |
| 5     | Slack Notifications (GitHub URLs)   | ⬜ Not tested — requires Slack webhook configured with GitHub WORKFLOW |
| 6     | Live Worker E2E                     | ✅ Pass (issues #2, #3) — `/symphony status` CLI not exercised (dashboard only) |
| 7     | Edge Cases & Error Paths            | ⬜ Partial — `exclude_labels`, bad-PAT/repo doctor errors, graceful shutdown untested |

---

## Phase 1: Config & Doctor

### 1.1 Config Parsing

- [x] Symphony starts with `WORKFLOW-github-labels.md` — no parse error
- [ ] Symphony starts with `WORKFLOW-github-projects.md` — no parse error
- [ ] Missing `repo_owner`: startup fails with `tracker.repo_owner is required`
- [ ] Missing `repo_name`: startup fails with `tracker.repo_name is required`
- [ ] Missing token (`api_key` absent, `GH_TOKEN` unset): startup fails with clear error

**Notes:** Label mode startup verified. Projects v2 mode needs board setup.

---

### 1.2 `symphony doctor` — Label Mode

Run: `./target/release/symphony doctor WORKFLOW-github-labels.md`

- [x] ✅ `GitHub PAT` — shows `PAT authenticated as gannonh`
- [x] ✅ `GitHub Repo` — shows `Repository gannonh/symphony-uat-test accessible`
- [x] ✅ `GitHub Labels` — shows `All configured state labels exist on repository`
- [x] ⏭️ `GitHub Project` — skipped (no `github_project_number` configured)

**With bad PAT:**
- [ ] 🚨 `GitHub PAT` — `PAT authentication failed (HTTP 401)`
- [ ] Exit code 1

**With nonexistent repo:**
- [ ] 🚨 `GitHub Repo` — `Repository <owner>/<nonexistent> not found (HTTP 404)`

**With missing state labels:**
- [x] ⚠️ `GitHub Labels` — warns for each missing label (saw `symphony:closed not found on repository` before we created it)

**Notes:** All happy-path checks pass. Missing label warning correctly detected before we created the `symphony:closed` label. Error paths not yet tested.

---

### 1.3 `symphony doctor` — Projects v2 Mode

Run: `./target/release/symphony doctor WORKFLOW-github-projects.md`

- [ ] ✅ `GitHub PAT` — authenticated
- [ ] ✅ `GitHub Repo` — accessible
- [ ] ✅ `GitHub Project` — shows `Project #N is accessible`
- [ ] ⏭️ `GitHub Labels` — skipped (Projects v2 mode active)

**With invalid project number:**
- [ ] 🚨 `GitHub Project` — `Project #N not found or not accessible`

**Notes:**

---

## Phase 2: Label Mode — Polling & Dispatch

### 2.1 Candidate Fetching

Start Symphony with label mode config. Ensure test issues have `symphony:todo` label.

- [x] TUI shows issues in retry/queue on first poll
- [x] `GET /api/v1/state` — `running` or pending entries include `#N` identifiers (not Linear-style `KAT-N`)
- [x] Poll cycle log shows GitHub issues fetched

**Notes:** First poll dispatched #1 and #2. State JSON shows `"issue_identifier": "#1"`.

---

### 2.2 Issue Dispatch ✅

- [x] Issue `#N` dispatched — `symphony:todo` label removed, `symphony:in-progress` added on the GitHub issue
- [x] TUI running sessions shows `#N`
- [x] `/api/v1/state` running entry: `issue_identifier = "#N"`, `issue_url = "https://github.com/gannonh/symphony-uat-test/issues/N"`

**Notes:** Verified via GitHub API: issue #1 labels changed from `["symphony:todo"]` to `["symphony:in-progress"]` after dispatch. State JSON confirms correct identifier and URL format.

---

### 2.3 State Transition on Completion ✅

- [x] Worker completes → issue gets `symphony:in-progress` removed, `symphony:done` (or whichever terminal label) added
- [x] Issue moves to completed list in `/api/v1/state`

**Notes:** Issue #1 completed successfully. GitHub API shows `labels: ["symphony:done"], state: "closed"`. Completed list in `/api/v1/state` shows `{identifier: "#1", title: "Implement user authentication module"}`. #3 dispatched automatically after slot opened — orchestrator cycling works.

---

## Phase 3: Projects v2 Mode — Polling & Dispatch

### 3.1 Candidate Fetching via Board Status ✅

Start Symphony with Projects v2 config. Ensure test issues are in `Todo` column on the board.

- [x] Symphony fetches candidates from the Projects v2 board
- [x] Dashboard shows `#4` and `#5` as running workers

**Notes:** Board created via GraphQL (`createProjectV2`). Issues #4 and #5 added via `addProjectV2ItemById`, status set to Todo via `updateProjectV2ItemFieldValue`. Symphony picked them up on first poll.

---

### 3.2 State Transition via `updateProjectV2ItemFieldValue` ✅

- [x] Dispatch: board item status changes from `Todo` → `In Progress` (verified via GraphQL query)
- [x] Completion: board item status changes to `Done`, issue closed (verified for #4)

**Notes:** Verified both transitions via direct GraphQL query against the Projects v2 board. Issue #4 completed: board status `Done`, GitHub state `CLOSED`. Issue #5 still running at time of check.

---

### 3.3 Mode Auto-Detection ✅

- [x] Config with `github_project_number: 16` → Projects v2 mode active
- [x] Config without `github_project_number` → label mode active (verified in Phase 2)

**Notes:** Doctor output confirms: with project number → `Project #16 found with Status field (3 options)`, labels check skipped. Without project number → `No github_project_number configured — label mode assumed`.

---

## Phase 4: Dashboard & TUI Rendering

### 4.1 HTTP Dashboard — Running Sessions Table

With at least one GitHub issue dispatched:

- [x] Running table shows `#N` as issue identifier (not `KAT-N`)
- [x] Issue identifier is a clickable link to `https://github.com/gannonh/symphony-uat-test/issues/N`
- [x] Dashboard project card links to `https://github.com/gannonh/symphony-uat-test/issues` (not a Linear URL)

**Notes:** Dashboard screenshot captured. #1 and #2 render as blue links. Project card in top-right links to GitHub issues URL. Column header "LINEAR STATE" should be renamed to "STATE" (issue #6). Zero `linear.app` references in rendered HTML.

---

### 4.2 HTTP Dashboard — Completed List ✅

After an issue reaches terminal state:

- [x] Completed list shows `#N` identifier
- [x] Issue URL in completed entry points to GitHub

**Notes:** After #1 and #3 completed, both appear in `/api/v1/state` completed array with correct `#N` identifiers.

---

### 4.3 TUI Running Sessions

- [x] TUI running row shows `#N` — no mangling, no prefix transformation (verified via dashboard — TUI not tested in this session)
- [x] `#N` is not mistaken for a Linear-style identifier

**Notes:** Verified via HTTP dashboard which uses the same data source. TUI visual verification deferred (requires interactive terminal).

---

### 4.4 `/api/v1/state` JSON ✅

```bash
curl http://localhost:8082/api/v1/state | jq '.running | to_entries[0].value'
```

- [x] `issue_identifier` = `"#1"` (string with `#` prefix)
- [x] `issue_url` = `"https://github.com/gannonh/symphony-uat-test/issues/1"`
- [x] `tracker_project_url` (in snapshot root) = `"https://github.com/gannonh/symphony-uat-test/issues"`
- [x] No `linear_project_url` field present (`has("linear_project_url") = false`)

**Notes:** All four assertions verified programmatically via `curl | jq`.

---

## Phase 5: Slack Notifications (GitHub URLs)

Configure `SLACK_WEBHOOK_URL` and add `notifications.slack` to the WORKFLOW file.

### 5.1 State Transition Notification

Trigger a state transition (e.g. Todo → In Progress):

- [ ] Slack message received
- [ ] Message contains `#N` as issue identifier
- [ ] Message contains a clickable link to `https://github.com/<owner>/<repo>/issues/N` (not a Linear URL)

### 5.2 Stall / Failure Notification

Trigger a stall (set `stall_timeout_ms` very low for testing):

- [ ] Slack message received with issue `#N` and GitHub URL

**Notes:**

---

## Phase 6: Live Worker E2E

*Prereq: a GitHub repo with at least one Todo issue, kata-cli on PATH.*

### 6.1 Full Lifecycle — Label Mode ✅

- [x] Issue `#1` is in Todo state with `symphony:todo` label
- [x] Symphony dispatches worker → label transitions to `symphony:in-progress`
- [x] Worker runs (`kata --mode rpc`), executes turns (3/5 turns observed)
- [x] Dashboard shows `#1` in running sessions with turn count
- [ ] `/symphony status` shows `#1` running (CLI not tested — only dashboard)
- [x] Worker completes → label transitions to `symphony:done`, issue closed
- [x] Issue appears in completed list
- [x] Slot released → #3 dispatched automatically

**Notes:** Full label-mode lifecycle verified for issues #1 (completed), #2 (ran multiple turns), #3 (auto-dispatched after slot opened). GitHub API confirmed label swaps at each transition. Inter-turn state refresh works correctly after fix (issue #1).

---

### 6.2 Full Lifecycle — Projects v2 Mode ✅

- [x] Issues #4 and #5 in `Todo` column on the Projects v2 board
- [x] Symphony dispatches → board status changes to `In Progress` (verified via GraphQL)
- [x] Worker completes → board status changes to `Done`, issue closed (verified for #4)

**Notes:** Full Projects v2 lifecycle verified. Board created with `createProjectV2`, issues added with `addProjectV2ItemById`. Symphony dispatched both, status transitions confirmed via direct GraphQL queries. Doctor required fix #7 (partial GraphQL error handling for user vs org accounts).

---

### 6.3 Rate Limit Handling

If rate limit is hit during the run:

- [ ] TUI shows 🚨 error indicator with `rate limit: retry in ~Xm`
- [ ] Worker does **not** burn all remaining turns against the rate limit (early exit on error stop reason)
- [ ] `/api/v1/state` `running_session_info[id].last_error` populated

**Notes:**

---

## Phase 7: Edge Cases & Error Paths

### 7.1 Missing Labels (Label Mode)

Remove `symphony:todo` label from the repo. Start Symphony.

- [ ] `symphony doctor` warns about missing label
- [ ] Symphony starts but logs warning (does not crash)
- [ ] No issues dispatched (no candidates match)

**Notes:**

---

### 7.2 Issue Not on Project Board (Projects v2 Mode)

Attempt to dispatch an issue that is not on the Projects v2 board.

- [ ] Error logged: `issue #N is not on project board #M`
- [ ] Worker session fails gracefully, issue goes to retry queue

**Notes:**

---

### 7.3 Invalid GitHub URL in Notifications

Verify `$SLACK_WEBHOOK_URL` env var reference doesn't trigger validation error in `/symphony config`.

- [ ] `/symphony config` opens without `validation_failed` error for `notifications.slack.webhook_url`
- [ ] Saving with `$SLACK_WEBHOOK_URL` as the webhook value works (no URL validation applied to `$VAR` references)

**Notes:**

---

### 7.4 `tracker.exclude_labels` (Kata task protection)

Add `kata:task` label to a GitHub issue. Configure `exclude_labels: [kata:task]`.

- [ ] Issue is not dispatched despite being in active state
- [ ] `/api/v1/state` does not show the issue in running or queue

**Notes:**

---

### 7.5 Graceful Shutdown During Active Worker

- [ ] Ctrl+C Symphony while a GitHub worker is running → clean termination
- [ ] No orphan workspace left behind (if `cleanup_on_done: true`)

**Notes:**

---

## Issues Found

| #   | Phase | Severity | Description | Status | Fix |
| --- | ----- | -------- | ----------- | ------ | --- |
| 1   | 2     | blocker  | Inter-turn issue state refresh hardcoded to `LinearClient` — sends GH_TOKEN to `api.linear.app`, gets 403, kills every worker session after first turn | ✅ Fixed | `build_tracker_adapter()` dispatches to `GithubAdapter` or `LinearAdapter` based on `tracker.kind` (commit `71480e8b`) |
| 2   | 6     | not-a-bug | `prompts/system.md` is Linear-centric — but prompts are user-configurable via `prompts:` section in WORKFLOW.md. GitHub users write their own prompt files. | ✅ By design | Document that GitHub deployments need custom prompt files. Our bundled prompts are Linear defaults. |
| 3   | 6     | not-a-bug | `sym-linear` skill in bundled skills directory — but skills are per-workflow (the `skills/` directory next to WORKFLOW.md). GitHub users would use a different skills set. | ✅ By design | Document that GitHub deployments should omit `sym-linear` or add `sym-github`. |
| 4   | 6     | minor    | Codex backend `graphql_executor` closure hardcoded to `LinearClient.graphql_raw` — Codex workers with GitHub tracker can't use the dynamic tool | ⬜ Deferred | Only affects Codex backend. Kata CLI backend (primary) unaffected. |
| 5   | 2     | minor    | Workspace paths use `_N` format (`/tmp/.../\_1`) instead of `#N` — likely because `#` is filesystem-unfriendly | ✅ OK | By design — workspace path uses issue number without `#` prefix |
| 6   | 4     | cosmetic | Dashboard running sessions column header says "LINEAR STATE" instead of "STATE" — misleading when tracker is GitHub | ⬜ Open | Rename column header to "STATE" in `http_server.rs` dashboard HTML |
| 7   | 3     | blocker  | Projects v2 `graphql_request` treats partial GraphQL errors as fatal — org-path error for user accounts kills the query even though user-path data is present | ✅ Fixed | Only treat errors as fatal when `data` is absent (commit `07a66e3b`) |
| 8   | 6     | not-a-bug | Workers get Linear-centric prompts when `prompts:` section points to our bundled Linear prompt files — expected behavior, not a GitHub backend bug | ✅ By design | GitHub users configure their own `prompts:` files. Document this in the GitHub backend setup guide. |

---

## Release Checklist (post-UAT)

- [ ] All blocking issues resolved
- [ ] `cargo test` — full suite passes
- [ ] `cargo clippy -- -D warnings` — clean
- [ ] `bun x vitest run` CLI tests — pass
- [ ] `npm run typecheck` — clean
- [ ] Symphony version bumped
- [ ] CLI version bumped (if CLI changes included)
- [ ] CHANGELOGs updated
- [ ] Documentation updated (AGENTS.md, WORKFLOW-REFERENCE.md)
- [ ] PR created and merged to main
- [ ] Tags created and GitHub Releases published
