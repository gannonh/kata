# Orchestrator Completion & Verification

> Mocks: `26-orchestrator-task-completion-a.png`, `27-orchestrator-task-completion-b.png`, `28-orchestrator-final-verification.png`, `29-codex-permission-dialog.png`

## Overview

The Orchestrator Completion & Verification views present the end-of-run state after an orchestrator run finishes. The user sees a wave-based task summary, CLI command options, a commit-and-PR creation flow, and a structured final verification report with code review results, test counts, acceptance criteria checklists, and a status badge. A permission dialog handles escalated shell operations (e.g., `git add`, `git commit`) that require sandbox approval.

## Component Inventory

| Component | Description | Source File |
|-----------|-------------|-------------|
| Orchestrator Run Status Card | Displays run ID, status label, prompt, lifecycle text, context preview, and delegated task list | `src/main.tsx` (lines 1553-1627) |
| Wave Summary Table | Tabular display of waves with wave number, task names, and test counts | Not yet implemented (mock 26-27) |
| CLI Command List | Lists available CLI commands for the completed run (e.g., `kata-cloud task "complete"`, `--interactive`, `--local`) | Not yet implemented (mock 26-27) |
| Commit All Changes Section | Displays repo status check, file list review, commit action, and commit result | Not yet implemented (mock 26-27) |
| PR Creation Section | Title/body inputs, base branch selector, generate/create buttons, PR URL display | `src/main.tsx` (lines 1813-1946) |
| Final Verification Panel | Code review results, test pass/fail counts, acceptance criteria checklist, evidence index, status badge | Not yet implemented (mock 28) |
| Permission Dialog | Modal dialog for sandbox-escalated shell commands with Always/Yes/No options | Not yet implemented (mock 29) |
| Delegated Task Timeline | Per-task type/specialist/status display with lifecycle text and error messages | `src/main.tsx` (lines 1583-1600), `src/shared/orchestrator-delegation.ts` |
| Context Provenance Line | Resolved provider, snippet count, fallback indicator | `src/main.tsx` (lines 145-162) |
| PR Status Message | Contextual status text for PR workflow steps | `src/main.tsx` (lines 1935-1945) |

## States

### Task Completion Summary (Mock 26)

- **Trigger:** Orchestrator run reaches `completed` status. All delegated tasks (implement, verify, debug) resolve to `completed`.
- **Layout:** Left sidebar shows the Coordinator agent tree with nested task entries. The main content area is a single scrollable column. An activity panel header reads "Final verification finished".
- **Content:**
  - Green "Final verification" badge at the top with status text: "APPROVED with high confidence"
  - Verifier approval statement: acceptance criteria met, test counts passing, no blocking issues
  - Spec update instruction section
  - "Kata Cloud Task Mode CLI is complete" heading
  - Wave summary table (4 columns: Wave, Tasks, Tests) with 4 rows:
    - Wave 1: Monorepo scaffold + domain types / 7 (types only)
    - Wave 2: Workspace manager, Agent SDK, GitHub PR / 42
    - Wave 3: CLI entry point + task orchestration / 15
    - Wave 4: E2E test suite / 1
    - Total row: 6 tasks / 63 tests
  - CLI commands section listing `kata-cloud task "complete"` with flags: `--interactive`, `--local`, `--local` (push branch but skip PR creation)
- **Interactive elements:** "Commit all changes" link/button below the CLI section. Scrollable main panel.

### Task Completion with Sidebar Detail (Mock 27)

- **Trigger:** Same completed state as mock 26; the left sidebar is expanded to show the full Coordinator task tree.
- **Layout:** Identical to mock 26 with the sidebar showing all orchestrator agent hierarchy entries expanded. Entries include:
  - Orchestrator contexts (verification, scaffold, implementation steps)
  - Individual task completion badges with green checkmarks
  - Agent SDK entries, GitHub PR entries, test suite entries
- **Content:** Same main content as mock 26. The sidebar tree provides navigation context showing which agents contributed to the run.
- **Interactive elements:** Sidebar tree items are selectable. The main panel commit/PR flow is interactive.

### Commit & PR Flow (Mocks 26-27, lower section)

- **Trigger:** User clicks "Commit all changes" in the completion summary.
- **Layout:** Sequential steps rendered inline in the main content column below the wave summary.
- **Content:**
  - "Let me check the current state of the repo first" status line
  - File list output showing untracked/modified/staged files (fenced terminal-style blocks)
  - "All files are untracked (new)" confirmation
  - Sensitive file review: "Let me see the full file list to make sure nothing sensitive is included"
  - "All source code, config, and test files. Nothing sensitive. Committing now." confirmation
  - Commit result: "Committed. 33 files, 3,831 lines added on `kata-cloud-pipeline`" with a link to the branch ref
  - "Clean working tree. One commit ahead of `origin/main`" status
  - "Create a PR for this work" heading
  - PR creation fields (title, body, base branch) displayed as fenced output
  - PR created result: "PR created: https://github.com/{owner}/{repo}/pull/{n}" with clickable URL
  - Next steps section:
    - "Merge the PR"
    - "Review the PR before merging"
    - "What should the next spec cover?"

### Final Verification Detail (Mock 28)

- **Trigger:** User navigates to the "Final verification" view (separate panel/page from the Coordinator view).
- **Layout:** Full-width scrollable content panel. The left sidebar shows the Coordinator agent list. A top navigation bar includes breadcrumbs: "Orchestrator > Final verification". Header tabs: "CLI", "Git", "API tools", "GitHub API tools", "URL fetch tools", "File write".
- **Content (structured sections):**
  1. **Agent output streams to terminal in real time** (VERIFIED badge)
     - Evidence: `parseLines` callback that extracts text blocks and writes them as they arrive
     - Verification: Static analysis confirmed callback + event-based architecture = tuned for real-time streaming
  2. **Workspace is always cleaned up (success or failure)** (VERIFIED badge)
     - Evidence: `cleanup` uses `rm -rf` from temp dir, cleanup on error path
     - Verification: Call-site "cleanup on agent failure" + CSE test "agent failure cleans up workspace" verified; sandbox directory no longer exists after failure. Both pass.
  3. **CLI creates temp directory** (VERIFIED badge)
     - Evidence: `ensureTempDir` creates title-truncated-to-72-chars-and-body with prompt file; called in `main.ts`
     - Verification: Unit tests "generates title and body" + "normalizes long titles" + "empty short titles" all pass
     - Collateral: **Flags work**
  4. **Linter builds / all pass** (VERIFIED badge)
     - Run lint/build commands: all pass
     - Evidence: `pnpm build` + PASS (both core and cli complete)
     - `pnpm lint` + PASS (26 files checked, no issues)
     - `pnpm test` + PASS (runs test suite)
     - `pnpm test:e2e` + PASS (4/62 tests across 6 test files)
  5. **Difficult internal scenarios** (VERIFIED badge)
     - Evidence: E2E tests (runs only `parseLines` and `buildCommitBody` while using real `buildTempDirPreamble` with real git against temp repos; no timers, no network calls)
     - Verification: CLI test includes E2E-pass marker; run is file-only; no external command required
  6. **Evidence index:**
     - Source files enumerated: 10 source files across `packages/core` and `packages/cli`
     - Task notes: all 8 task notes listed, all marked complete
     - Test files enumerated (with line counts): `task-parser.test.ts`, `changes.test.ts`, `orchestrator-delegation.test.ts`, etc. Total: 60-67 tests
  7. **Additional checks (per spec request):**
     - `cli.test.ts` referenced (e2e validation proof: passed in both sandboxed and completed output)
     - **Disambiguation:** properly parsed, resolved to both code and CLI surfaces without conflict
     - **Error handling:** proper error classes with code, message, remediation; agent failures, push failures, API errors all handled with typed PullRequestWorkflowError
     - **Type safety:** all interfaces well-defined; no `any` types; `OrchestratorRunStatus` uses an enum (union coverage types)
     - **No hardcoded values:** search prefix confirms only the dry-run conversion dead constant, token validation supports combination constructs
     - **No regression gaps:** coverage includes happy path, error path, edge cases (no changes, no remote, duplicate branch, malformed URL, empty input)
  8. **Risk Notes:** Non-blocking. Implementation is clean and focused.
  9. **Recommended follow-ups:** The `--local` flag is implemented and tested but not linked to acceptance criteria documentation.
  10. **Report header:** APPROVED badge (confidence level indicator)
  11. **Final status line:** Green verification badge with "APPROVED with high confidence" text

### Permission Dialog (Mock 29)

- **Trigger:** An agent within the orchestrator run attempts a shell command (e.g., `git add a.`) that requires escalated execution outside the workspace sandbox.
- **Layout:** Dark modal dialog, centered vertically and horizontally. Approximately 400px wide. Dark background card with rounded corners.
- **Content:**
  - Context paragraph explaining the root cause: the worktree's real Git metadata is outside the workspace sandbox, so write operations like `git add` / `git commit` need escalated execution
  - Permission request card with:
    - Orange/amber shield icon (left-aligned)
    - Title: "Run git add a.?"
    - Subtitle: "from OpenAI Codex"
    - Expandable "Show raw details" disclosure
  - Three action buttons stacked vertically:
    - `[1] Always` (full-width, dark button)
    - `[2] Yes` (full-width, dark button)
    - `[3] No, provide feedback` (full-width, dark button)
  - Footer instruction: "Press number key to select - Esc to cancel"
- **Interactive elements:** Three buttons selectable by click or number key (1/2/3). Esc key dismisses.

## Completion Summary

The completion summary (mocks 26-27) displays after a successful orchestrator run:

- **Wave summary table:** 4-column table with headers Wave, Tasks, Tests. Each row represents one execution wave. The final row shows totals (e.g., "Total: 6 tasks, 63 tests"). Waves represent sequential execution groups; tasks within a wave run in parallel.
- **Total counts:** Aggregated task count and test count rendered in a bold "Total" row at the table bottom.
- **CLI commands listed:** Bullet list of available CLI invocations:
  - `kata-cloud task "complete"` with full workflow (+ agent + PR + cleanup files)
  - `--interactive` for interactive agent mode without creating a PR
  - `--local` for pushing branch but skipping PR creation
- **PR creation link/status:** Rendered inline below the commit section. Shows the full GitHub PR URL as a clickable link after successful creation. Displays PR number prefix (e.g., "PR created: https://..."). Followed by three next-step suggestions as bullet points.

## Verification Detail

The final verification view (mock 28) presents a structured quality report:

- **Code review results display:** Each verification category is a numbered section with a green VERIFIED badge. Categories include: real-time output streaming, workspace cleanup, temp directory creation, build/lint/test pass, internal scenario coverage. Each category includes an Evidence line and a Verification line with specific file/function references.
- **Test count display:** Aggregated test results per tool: `pnpm build` PASS, `pnpm lint` PASS (file count, no issues), `pnpm test` PASS, `pnpm test:e2e` PASS (test count across file count). Individual test file line counts listed in the evidence index.
- **Acceptance criteria checklist:** Rendered as numbered verification items. Each item maps to a spec requirement. Items show VERIFIED status badges. Additional checks section covers disambiguation, error handling, type safety, hardcoded values, and regression gaps.
- **Final status indicator:** A prominent green badge at the bottom of the report reading "APPROVED" with a confidence qualifier ("high confidence"). This badge also appears at the top of the report as a header badge with the same text.

## Permission Dialog

The permission dialog (mock 29) handles sandbox escalation:

- **Dialog structure:** A modal overlay with a dark card. The card contains a context explanation paragraph above the permission request box. The permission request box has an icon, title, subtitle, and disclosure toggle.
- **Permission action description:** Displays the exact command to be executed (e.g., "Run git add a.?") with the requesting agent name ("from OpenAI Codex").
- **Always / Yes / No button options:**
  - "Always": grants persistent permission for this command pattern for the session duration
  - "Yes": grants one-time permission for this specific invocation
  - "No, provide feedback": denies permission and opens a feedback input
- **When this dialog appears:** During the commit/PR flow when the orchestrator agent needs to execute git write operations (add, commit, push) and the workspace sandbox blocks direct access to the `.git` directory. The dialog surfaces before the command runs, blocking execution until the user responds.

## PR Creation Flow

The PR creation flow spans the completion view (mocks 26-27) and the existing Changes panel implementation:

1. **Commit all changes trigger:** A "Commit all changes" heading/link in the completion summary initiates the commit flow. The agent first runs `git status` to check repo state, then reviews the file list for sensitive content.
2. **File staging/review:** The agent lists all files, confirms nothing sensitive is included, then commits. The commit message includes file count and line count. Result displays the branch name and remote tracking status (e.g., "One commit ahead of origin/main").
3. **PR creation button:** After commit, a "Create a PR for this work" section renders. The agent auto-generates title, body, head branch, and base branch. In the current implementation (`src/main.tsx` lines 1888-1912), the "Create Pull Request" button calls `onCreatePullRequest` which invokes `kataShell.createPullRequest` via IPC channel `kata-cloud/github:pr-create`.
4. **PR URL display:** On success, the PR URL is displayed as a clickable link with the PR number (e.g., "PR created: https://github.com/{owner}/{repo}/pull/{n}"). The current implementation renders this in `src/main.tsx` lines 1930-1934 via `createdPullRequest.url` and `createdPullRequest.number`.
5. **Next steps options:** Three bullet suggestions follow the PR URL:
   - Merge the PR
   - Review the PR before merging
   - What should the next spec cover?

## Data Dependencies

| Data | Source | Type |
|------|--------|------|
| `OrchestratorRunRecord` | `src/shared/state.ts` (line 67) | Persisted state record |
| `OrchestratorRunStatus` | `src/shared/state.ts` (line 16) | Union: `"queued" \| "running" \| "completed" \| "failed" \| "interrupted"` |
| `OrchestratorDelegatedTaskRecord` | `src/shared/state.ts` (line 32) | Persisted task record with type, specialist, status, timeline |
| `OrchestratorRunViewModel` | `src/shared/orchestrator-run-view-model.ts` (line 18) | Projected view model for rendering |
| `OrchestratorDelegatedTaskViewModel` | `src/shared/orchestrator-run-view-model.ts` (line 9) | Projected task view model |
| `SpaceGitCreatePullRequestResult` | `src/git/types.ts` (line 64) | PR creation response: url, number, title, branches, timestamp |
| `SpaceGitPullRequestDraftResult` | `src/git/types.ts` (line 47) | Draft generation response: title, body, branches, staged file count |
| `SpaceGitChangesSnapshot` | `src/git/types.ts` | File changes with staged/unstaged summary |
| `GitHubSessionInfo` | `src/git/types.ts` | Session ID, login, createdAt |
| `PullRequestWorkflowError` | `src/git/pr-workflow.ts` (line 75) | Typed error with code and remediation |
| Wave summary data | Not yet modeled | Needs new type: wave number, task names, test counts |
| Verification report data | Not yet modeled | Needs new type: verification categories, evidence, status badges |
| Permission request data | Not yet modeled | Needs new type: command, agent source, permission level |

## Interactions

| Action | Trigger | Effect | IPC Channel |
|--------|---------|--------|-------------|
| Generate PR suggestion | Click "Generate PR Suggestion" button | Calls `generatePullRequestDraft` with repo path, URL, spec context, base branch; populates title/body fields | `kata-cloud/github:pr-draft` |
| Create pull request | Click "Create Pull Request" button | Calls `createPullRequest` with session, title, body, branches; displays PR URL on success | `kata-cloud/github:pr-create` |
| Open created PR | Click "Open PR" button | Opens PR URL in external browser via `openExternalUrl` | `kata-cloud/system:open-external-url` |
| Connect GitHub | Click "Connect GitHub" with token | Creates GitHub session via `createGitHubSession`; stores session info | `kata-cloud/github:session-create` |
| Disconnect GitHub | Click "Disconnect GitHub" | Clears session via `clearGitHubSession` | `kata-cloud/github:session-clear` |
| Stage file | Click "Stage" on a file entry | Calls `stageSpaceFile`; refreshes changes snapshot | `kata-cloud/space-git:file-stage` |
| Unstage file | Click "Unstage" on a file entry | Calls `unstageSpaceFile`; refreshes changes snapshot | `kata-cloud/space-git:file-unstage` |
| Commit all changes | Click "Commit all changes" in completion summary | Not yet implemented; needs new IPC channel for git commit | TBD: `kata-cloud/space-git:commit` |
| Approve permission | Click "Always" or "Yes" in permission dialog | Grants escalated execution; command proceeds | TBD: permission IPC channel |
| Deny permission | Click "No, provide feedback" in permission dialog | Blocks command execution; opens feedback input | TBD: permission IPC channel |
| View verification detail | Navigate to Final verification panel | Renders structured verification report from run data | None (local state rendering) |

## Visual Specifications

### Color Tokens

- **Background (main panel):** `#1a1a2e` (dark navy)
- **Background (sidebar):** `#16162a` (darker navy)
- **Background (card/section):** `#1e1e3a` (slightly lighter navy)
- **Background (permission dialog):** `#2a2a3e` (dark card)
- **Text (primary):** `#e0e0e0` (light gray)
- **Text (secondary):** `#a0a0b0` (muted gray)
- **Accent (success/verified):** `#4caf50` (green) -- used for VERIFIED badges, APPROVED badge, green checkmarks
- **Accent (warning/permission):** `#f5a623` (amber) -- used for shield icon in permission dialog
- **Accent (link):** `#6cb4ee` (light blue) -- used for PR URLs, branch refs
- **Error:** `#e57373` (soft red) -- used for `field-error` class

### Typography

- **Section headings:** Bold, ~16px, primary text color
- **Body text:** Regular, ~14px, primary text color
- **Status badges (VERIFIED, APPROVED):** Bold uppercase, ~12px, green on dark background, inline pill shape
- **Code/terminal output:** Monospace font, ~13px, rendered in fenced blocks with dark background
- **Table text (wave summary):** Regular, ~14px, aligned in columns with header row bold
- **Permission dialog title:** Bold, ~16px
- **Permission dialog subtitle:** Regular, ~13px, secondary text color
- **Button text:** Regular, ~14px, centered

### Spacing & Layout

- **Main content panel:** Full height minus header/nav. Scrollable vertical overflow. Padding: 16px horizontal, 12px vertical between sections.
- **Sidebar:** Fixed width ~280px. Scrollable. Tree items indented ~16px per nesting level.
- **Wave summary table:** Full width within content column. Cell padding: 8px horizontal, 6px vertical. Borders: subtle 1px separator between rows.
- **Verification sections:** Each section has 12px bottom margin. Badge is inline with section title. Evidence/Verification lines indented under the section heading.
- **Permission dialog:** Centered overlay. Card width ~400px. Internal padding: 20px. Button stack has 8px vertical gap between buttons. Footer text centered below buttons.
- **PR creation section:** Fields stacked vertically with 8px gap. Button row uses horizontal flex layout with 8px gap.

## Implementation Gap Analysis

| Feature | Mock Shows | Current Code | Gap |
|---------|-----------|--------------|-----|
| Wave summary table | 4-row table with wave number, task names, test counts | `OrchestratorDelegatedTaskRecord` tracks implement/verify/debug tasks but no wave grouping | No wave data model. Need `OrchestratorWave` type with wave number, task refs, test count. Delegation timeline (`src/shared/orchestrator-delegation.ts`) creates tasks sequentially without wave grouping. |
| Total task/test counts | Aggregated totals row in wave table | `delegatedTasks` array on `OrchestratorRunRecord` (`src/shared/state.ts` line 86) | No test count field on task records. Need `testCount` on `OrchestratorDelegatedTaskRecord` or a separate test results model. |
| CLI command list | Bullet list of `kata-cloud task` invocations with flags | No CLI integration exists | Entire CLI command system is absent. The mock references a CLI (`kata-cloud task "complete"`) that does not exist in the codebase. |
| Commit all changes flow | Inline sequential steps: status check, file review, sensitive file check, commit, branch status | `stageSpaceFile` and `unstageSpaceFile` exist in IPC (`src/shared/shell-api.ts` lines 35-36) but no `commit` channel | Missing git commit IPC channel. Need `kata-cloud/space-git:commit` in `IPC_CHANNELS` and `ShellApi`. Need commit handler in main process. |
| Commit result display | "Committed. 33 files, 3,831 lines" with branch link | No commit result type exists | Need `SpaceGitCommitResult` type with file count, line count, branch name, commit SHA. |
| Verification report structure | Numbered sections with VERIFIED badges, evidence, verification lines | `OrchestratorRunViewModel` (`src/shared/orchestrator-run-view-model.ts`) has `statusLabel` and `errorMessage` but no structured verification data | Need `VerificationReport` type with categories, evidence items, test results, and status badges. No renderer component exists. |
| Verification evidence index | Source file list, task note list, test file list with line counts | Not modeled | Need evidence collection during run completion. |
| APPROVED/FAILED status badge | Green pill badge with confidence level | `statusLabel` in view model returns "Completed"/"Failed" but no confidence qualifier | Need confidence level field on run completion. Need badge component. |
| Permission dialog | Modal with command, agent source, Always/Yes/No buttons, keyboard shortcuts | Not implemented | Entire permission system is absent. Need permission request/response IPC, modal component, keyboard shortcut handler. |
| Sidebar agent tree | Hierarchical tree of coordinator/agent entries with status badges | Left sidebar currently shows spaces and sessions (`src/main.tsx` lines 1278-1429) | No agent hierarchy model. Need `OrchestratorAgentNode` type and tree renderer. |
| Next steps suggestions | Three bullet options after PR creation | `createdPullRequest` state renders URL but no next-step suggestions | Need static or dynamic next-step content after PR creation. |
| Real-time streaming display | Agent output streams to terminal as text blocks | Run execution is synchronous fire-and-forget (`onRunOrchestrator` in `src/main.tsx` lines 883-1038) | Current orchestrator runs complete in a single async call. No streaming architecture exists. Need event-based output streaming. |
| Sensitive file detection in commit flow | Agent reviews file list for sensitive content before committing | `pr-workflow.ts` has `SENSITIVE_DIFF_FILE_PATH_PATTERNS` (line 49) and `isSensitiveDiffFilePath` (line 255) for PR diffs | Sensitive file detection exists for PR diff previews but not for the commit flow. Could reuse `SENSITIVE_DIFF_FILE_PATH_PATTERNS`. |
