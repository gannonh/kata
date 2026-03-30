# M004 UAT — GitHub Issues Backend

**Date:** TBD
**Branch:** `sym/uat/M004`
**Symphony:** `./target/release/symphony WORKFLOW-github.md`
**CLI:** Latest build
**Tester:** gannon

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
| 1     | Config & Doctor                     | ⬜      |
| 2     | Label Mode — Polling & Dispatch     | ⬜      |
| 3     | Projects v2 Mode — Polling & Dispatch | ⬜    |
| 4     | Dashboard & TUI Rendering           | ⬜      |
| 5     | Slack Notifications (GitHub URLs)   | ⬜      |
| 6     | Live Worker E2E                     | ⬜      |
| 7     | Edge Cases & Error Paths            | ⬜      |

---

## Phase 1: Config & Doctor

### 1.1 Config Parsing

- [ ] Symphony starts with `WORKFLOW-github-labels.md` — no parse error
- [ ] Symphony starts with `WORKFLOW-github-projects.md` — no parse error
- [ ] Missing `repo_owner`: startup fails with `tracker.repo_owner is required`
- [ ] Missing `repo_name`: startup fails with `tracker.repo_name is required`
- [ ] Missing token (`api_key` absent, `GH_TOKEN` unset): startup fails with clear error

**Notes:**

---

### 1.2 `symphony doctor` — Label Mode

Run: `./target/release/symphony doctor WORKFLOW-github-labels.md`

- [ ] ✅ `GitHub PAT` — shows `PAT authenticated as <login>`
- [ ] ✅ `GitHub Repo` — shows `Repository <owner>/<repo> is accessible`
- [ ] ✅ `GitHub Labels` — shows `All configured state labels exist on repository`
- [ ] ⏭️ `GitHub Project` — skipped (no `github_project_number` configured)

**With bad PAT:**
- [ ] 🚨 `GitHub PAT` — `PAT authentication failed (HTTP 401)`
- [ ] Exit code 1

**With nonexistent repo:**
- [ ] 🚨 `GitHub Repo` — `Repository <owner>/<nonexistent> not found (HTTP 404)`

**With missing state labels:**
- [ ] ⚠️ `GitHub Labels` — warns for each missing label (e.g. `symphony:todo not found`)

**Notes:**

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

- [ ] TUI shows issues in retry/queue on first poll
- [ ] `GET /api/v1/state` — `running` or pending entries include `#N` identifiers (not Linear-style `KAT-N`)
- [ ] Poll cycle log shows GitHub issues fetched

**Notes:**

---

### 2.2 Issue Dispatch

- [ ] Issue `#N` dispatched — `symphony:todo` label removed, `symphony:in-progress` added on the GitHub issue
- [ ] TUI running sessions shows `#N`
- [ ] `/api/v1/state` running entry: `issue_identifier = "#N"`, `issue_url = "https://github.com/<owner>/<repo>/issues/N"`

**Notes:**

---

### 2.3 State Transition on Completion

- [ ] Worker completes → issue gets `symphony:in-progress` removed, `symphony:done` (or whichever terminal label) added
- [ ] Issue moves to completed list in `/api/v1/state`

**Notes:**

---

## Phase 3: Projects v2 Mode — Polling & Dispatch

### 3.1 Candidate Fetching via Board Status

Start Symphony with Projects v2 config. Ensure test issues are in `Todo` column on the board.

- [ ] Symphony fetches candidates from the Projects v2 board
- [ ] TUI/dashboard shows `#N` issues as candidates

**Notes:**

---

### 3.2 State Transition via `updateProjectV2ItemFieldValue`

- [ ] Dispatch: board item status changes from `Todo` → `In Progress` (verify on GitHub Projects board)
- [ ] Completion: board item status changes to terminal state

**Notes:**

---

### 3.3 Mode Auto-Detection

- [ ] Config with `github_project_number` set → Projects v2 mode active (logs `state_mode=ProjectsV2`)
- [ ] Config without `github_project_number` → label mode active (logs `state_mode=Labels`)

**Notes:**

---

## Phase 4: Dashboard & TUI Rendering

### 4.1 HTTP Dashboard — Running Sessions Table

With at least one GitHub issue dispatched:

- [ ] Running table shows `#N` as issue identifier (not `KAT-N`)
- [ ] Issue identifier is a clickable link to `https://github.com/<owner>/<repo>/issues/N`
- [ ] Dashboard project card links to `https://github.com/<owner>/<repo>/issues` (not a Linear URL)

**Notes:**

---

### 4.2 HTTP Dashboard — Completed List

After an issue reaches terminal state:

- [ ] Completed list shows `#N` identifier
- [ ] Issue URL in completed entry points to GitHub

**Notes:**

---

### 4.3 TUI Running Sessions

- [ ] TUI running row shows `#N` — no mangling, no prefix transformation
- [ ] `#N` is not mistaken for a Linear-style identifier

**Notes:**

---

### 4.4 `/api/v1/state` JSON

```bash
curl http://localhost:8082/api/v1/state | jq '.running | to_entries[0].value'
```

- [ ] `issue_identifier` = `"#N"` (string with `#` prefix)
- [ ] `issue_url` = `"https://github.com/<owner>/<repo>/issues/N"`
- [ ] `tracker_project_url` (in snapshot root) = `"https://github.com/<owner>/<repo>/issues"`
- [ ] No `linear_project_url` field present

**Notes:**

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

### 6.1 Full Lifecycle — Label Mode

- [ ] Issue `#1` is in Todo state with `symphony:todo` label
- [ ] Symphony dispatches worker → label transitions to `symphony:in-progress`
- [ ] Worker runs (`kata --mode rpc`), executes turns
- [ ] TUI shows `#1` in running sessions with turn count
- [ ] `/symphony status` shows `#1` running
- [ ] Worker completes → label transitions to `symphony:done`
- [ ] Issue appears in completed list

**Notes:**

---

### 6.2 Full Lifecycle — Projects v2 Mode (if board configured)

- [ ] Issue is in `Todo` column on the Projects v2 board
- [ ] Symphony dispatches → board status changes to `In Progress`
- [ ] Worker completes → board status changes to `Done`

**Notes:**

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
|     |       |          |             |        |     |

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
