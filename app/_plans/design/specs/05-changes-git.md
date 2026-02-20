# Changes & Git

> Mocks: `15-changes-tab-view.png`, `16-changes-tab-unstaged-files.png`, `17-changes-tab-staged-files.png`

## Overview

The Changes view displays the git working tree status for the active space, allowing users to inspect file diffs, stage and unstage individual files, manage branch/worktree lifecycle, and create GitHub pull requests from staged changes. It occupies the right panel when the "Changes" navigation tab is active.

## Component Inventory

| Component | Description | Source File |
|-----------|-------------|-------------|
| Changes panel header | Displays "Changes" title and "Diff and staging entrypoint" subtitle | `src/main.tsx` L1699-L1713 |
| Branch / Worktree info card | Shows `SpaceGitUiState` title, detail, branch name, worktree path, and remediation errors | `src/main.tsx` L1722-L1778 |
| Git lifecycle buttons | Initialize Branch/Worktree, Switch Branch/Worktree, Refresh Changes | `src/main.tsx` L1739-L1774 |
| Staged Summary card | Displays `SpaceGitStagedSummary` counts: file counts, status breakdown, line delta | `src/main.tsx` L1785-L1812 |
| Pull Request card | GitHub session management, PR draft generation, PR creation form | `src/main.tsx` L1813-L1946 |
| File list (`changes-files`) | Scrollable list of `SpaceGitChangeFile` entries with select, status pills, stage/unstage buttons | `src/main.tsx` L1948-L2020 |
| Diff viewer (`changes-diff`) | Renders staged and unstaged diffs for the selected file using `DiffText` | `src/main.tsx` L2021-L2047 |
| `DiffText` | Memoized `<pre>` block that renders highlighted or plain diff output | `src/git/changes-diff-text.tsx` L4-L24 |
| `highlightDiff` | Classifies each diff line by kind (`add`, `remove`, `hunk`, `meta`, `context`) with a configurable max-line threshold | `src/git/changes-diff-highlighting.ts` L57-L85 |
| `parseGitStatusPorcelain` | Parses `git status --porcelain` output into `SpaceGitChangeFile[]` | `src/git/changes.ts` L10-L17 |
| `summarizeStagedChanges` | Aggregates staged file counts and line delta from numstat output | `src/git/changes.ts` L48-L114 |
| `SpaceGitLifecycleService` | Main-process service: lifecycle management, changes snapshot, file diff, stage/unstage | `src/git/space-git-service.ts` L41-L275 |
| `PullRequestWorkflowService` | Main-process service: GitHub session management, PR draft generation, PR creation | `src/git/pr-workflow.ts` L367-L751 |
| `toSpaceGitUiState` | Maps `SpaceGitLifecycleStatus` to UI display fields | `src/git/space-git-ui-state.ts` L12-L56 |
| `resolveSpaceChangesRepoPath` | Resolves the effective repo path from worktree path or space root path | `src/main.tsx` L218-L229 |

## States

### Default / Changes Tab Active (Mock 15)

- **Trigger:** User clicks the "Changes" tab in the left navigation sidebar.
- **Layout:** The right panel receives `panel panel-focused` class. Content stacks vertically: panel header, Branch/Worktree info card, Staged Summary card, Pull Request card, then a two-column `changes-layout` grid (files left, diff right).
- **Content:** Panel header shows "Changes" / "Diff and staging entrypoint". The Branch/Worktree card shows `SpaceGitUiState.title` and `SpaceGitUiState.detail`. Below the summary cards the `changes-layout` grid appears. The left sidebar shows the full application navigation with the "Changes" tab highlighted. A spec/orchestrator conversation is visible in the middle panel from prior view context.
- **Interactive elements:** Initialize Branch/Worktree button, Switch Branch/Worktree button, Refresh Changes button, file select buttons, Stage/Unstage buttons per file, PR workflow buttons.

### Unstaged Files Present (Mock 16)

- **Trigger:** The changes snapshot contains files where `unstagedStatus !== null`. Loaded automatically when navigating to Changes view or after Refresh.
- **Layout:** Same as Mock 15. The file list section populates with file entries. Each file shows a selectable path label, status pills, and action buttons.
- **Content:** File entries display `changes-pill is-unstaged` badges reading "Unstaged: {status label}" (e.g., "Unstaged: Modified", "Unstaged: Untracked"). The Staged Summary card shows "0 staged / N unstaged". Each unstaged file shows a "Stage" button.
- **Interactive elements:** Clicking a file path selects it and triggers diff loading. "Stage" button calls `stageSpaceFile` IPC and refreshes the snapshot.

### Staged Files Present (Mock 17)

- **Trigger:** User stages one or more files using the "Stage" button, or files were already staged in the working tree.
- **Layout:** Same grid layout. Files with staged changes show `changes-pill is-staged` badges. The Staged Summary card updates with non-zero counts.
- **Content:** File entries display "Staged: {status label}" pills in green. The summary card shows updated counts (e.g., "5 staged / 3 unstaged", "Added 2, Modified 3, Deleted 0"). The Pull Request section becomes actionable. Files that are both staged and unstaged show both pills. The left sidebar shows collapsible sections: "Tasks" listing spec tasks with checkboxes, "Changes" listing staged/unstaged file groups, and "PRs" listing pull request entries.
- **Interactive elements:** "Unstage" button appears for staged files. "Generate PR Suggestion" button enables when `hasStagedChanges` is true. "Create Pull Request" button requires a connected GitHub session, a non-empty title, and a non-empty base branch.

## File Status Indicators

- **Modified files:** Status code `M`. Label: "Modified". Pill text: "Staged: Modified" or "Unstaged: Modified".
- **Added/new files:** Status code `A` for staged additions. Label: "Added". Untracked files use status code `?` with label "Untracked".
- **Deleted files:** Status code `D`. Label: "Deleted".
- **Renamed files:** Status code `R`. Label: "Renamed". Path displayed as `{previousPath} -> {path}` via `toChangePathLabel()` (L239-L245).
- **Copied files:** Status code `C`. Label: "Copied".
- **Conflict files:** `isConflicted: true` when status code matches merge conflict set (`DD`, `AU`, `UD`, `UA`, `DU`, `AA`, `UU`) or either index contains `U`. Label: "Conflict".
- **Staged vs unstaged distinction:** Staged files show `changes-pill is-staged` with green border (`rgba(96, 211, 148, 0.55)`) and green text (`#a6f0c4`). Unstaged files show `changes-pill is-unstaged` with amber border (`rgba(242, 198, 109, 0.5)`) and amber text (`#f8dea4`). A file can show both pills simultaneously when it has both staged and unstaged changes.
- **File path display:** Full relative path from repo root. Quoted paths with octal-encoded UTF-8 are decoded by `decodeQuotedPath()` (`src/git/changes.ts` L197-L246). Rename arrows (`->`) are parsed by `splitPathField()` (L164-L179).

## Diff View

- **Added line highlighting:** `changes-diff__line--add` class. Text color `#b9f3cd`, background `rgba(65, 170, 109, 0.18)`. Lines starting with `+`.
- **Removed line highlighting:** `changes-diff__line--remove` class. Text color `#ffb8b8`, background `rgba(194, 88, 88, 0.2)`. Lines starting with `-`.
- **Hunk headers:** `changes-diff__line--hunk` class. Text color `#9ec3ff`, background `rgba(62, 104, 178, 0.2)`. Lines starting with `@@`.
- **Metadata lines:** `changes-diff__line--meta` class. Text color `#95a7cb`. Includes `diff --git`, `index`, `---`, `+++`, `rename from/to`, `new file mode`, `deleted file mode`, `Binary files` lines.
- **Context lines:** `changes-diff__line--context` class. Uses `var(--text)` color (`#dbe2ee`). Lines starting with a space.
- **Line number display:** Not implemented. Diff lines render as raw git diff output without explicit line numbers.
- **File header format:** The diff section header shows "Diff" as an `<h3>` and the selected file path (or "Select a file") as a `<p>` subtitle.
- **Syntax highlighting approach:** No language-aware syntax highlighting. The `highlightDiff` function classifies lines purely by diff prefix character. When diff exceeds `DEFAULT_MAX_HIGHLIGHT_LINES` (2500), it falls back to plain `<pre>` rendering without line-level classification. CRLF line endings are normalized.
- **Font:** `"IBM Plex Mono", "SF Mono", Consolas, monospace` at `0.75rem` with `line-height: 1.4`.
- **Staged vs unstaged diffs:** When a file has both staged and unstaged changes, two `changes-diff__panel` sections render: "Staged" (header `<h4>`) showing `stagedDiff` and "Unstaged" showing `unstagedDiff`. Each panel is independently scrollable up to `var(--changes-diff-max-height)`.

## Staging Workflow

1. **Loading changes:** When the Changes view activates (`state.activeView === "changes"`), `loadChangesSnapshot()` fires automatically. It calls `kataShell.getSpaceChanges({ repoPath })` which invokes `SpaceGitLifecycleService.getChanges()` via IPC channel `kata-cloud/space-git:changes`. The returned `SpaceGitChangesSnapshot` populates the file list and summary.

2. **Selecting a file:** Clicking a file's path button sets `selectedChangePath`. A `useEffect` watches this value and calls `kataShell.getSpaceFileDiff()` with `includeStaged` and `includeUnstaged` flags based on the file's status. The diff result populates `DiffText`.

3. **Staging a file:** Clicking "Stage" on an unstaged file calls `kataShell.stageSpaceFile({ repoPath, filePath })` via IPC channel `kata-cloud/space-git:file-stage`. The main process runs `git add -- {filePath}`, then returns a fresh `SpaceGitChangesSnapshot`. The UI applies this snapshot via `applyChangesSnapshot()`, preserving the current file selection if still present.

4. **Unstaging a file:** Clicking "Unstage" on a staged file calls `kataShell.unstageSpaceFile({ repoPath, filePath })` via IPC channel `kata-cloud/space-git:file-unstage`. The main process tries `git restore --staged -- {filePath}`, falling back to `git reset -q -- {filePath}`. Returns a fresh snapshot.

5. **Stage/unstage button states:** During an in-flight action, the button text changes to "Staging..." or "Unstaging..." and disables. The `activeFileActionKey` state tracks which file/action pair is in progress.

6. **Commit interface:** There is no commit interface in the current implementation. The workflow goes directly from staging to pull request creation. The PR card provides title input, body textarea, base branch input, and action buttons (Generate PR Suggestion, Create Pull Request).

7. **Auto-refresh:** The changes snapshot reloads when `activeSpace.gitStatus.updatedAt` changes (e.g., after initialize or switch lifecycle operations).

## Data Dependencies

| Data | Source | Type |
|------|--------|------|
| `SpaceGitChangesSnapshot` | `kataShell.getSpaceChanges()` | `{ files: SpaceGitChangeFile[], stagedSummary, stagedFileCount, unstagedFileCount, hasStagedChanges, updatedAt }` |
| `SpaceGitFileDiffResult` | `kataShell.getSpaceFileDiff()` | `{ stagedDiff: string \| null, unstagedDiff: string \| null, updatedAt }` |
| `SpaceGitUiState` | `toSpaceGitUiState(activeSpace.gitStatus)` | `{ title, detail, branchName, worktreePath, remediation, isError }` |
| `SpaceGitLifecycleStatus` | `activeSpace.gitStatus` on `SpaceRecord` | `{ phase, message, remediation, branchName, worktreePath, updatedAt }` |
| `GitHubSessionInfo` | `kataShell.createGitHubSession()` | `{ sessionId, login, createdAt }` |
| `SpaceGitPullRequestDraftResult` | `kataShell.generatePullRequestDraft()` | `{ title, body, headBranch, baseBranch, stagedFileCount, updatedAt }` |
| `SpaceGitCreatePullRequestResult` | `kataShell.createPullRequest()` | `{ url, number, title, headBranch, baseBranch, updatedAt }` |
| `activeChangesRepoPath` | `resolveSpaceChangesRepoPath(activeSpace)` | `string \| null` (worktree path preferred, falls back to `rootPath`) |
| `activeSpace.repoUrl` | `SpaceRecord.repoUrl` | `string \| undefined` (GitHub remote URL) |

## Interactions

| Action | Trigger | Effect | IPC Channel |
|--------|---------|--------|-------------|
| Load changes | View activates or git status updates | Fetches `SpaceGitChangesSnapshot`, populates file list and summary | `kata-cloud/space-git:changes` |
| Select file | Click file path button | Sets `selectedChangePath`, triggers diff fetch | (local state) |
| Load file diff | `selectedChange` changes | Fetches staged/unstaged diff for selected file | `kata-cloud/space-git:file-diff` |
| Stage file | Click "Stage" button | Runs `git add`, returns refreshed snapshot | `kata-cloud/space-git:file-stage` |
| Unstage file | Click "Unstage" button | Runs `git restore --staged` (or `git reset`), returns refreshed snapshot | `kata-cloud/space-git:file-unstage` |
| Initialize git | Click "Initialize Branch/Worktree" | Creates branch and worktree, updates `gitStatus` on space | `kata-cloud/space-git:initialize` |
| Switch git | Click "Switch Branch/Worktree" | Switches to space branch in worktree | `kata-cloud/space-git:switch` |
| Refresh changes | Click "Refresh Changes" | Re-fetches changes snapshot | `kata-cloud/space-git:changes` |
| Connect GitHub | Enter token, click "Connect GitHub" | Validates token via GitHub API, stores session | `kata-cloud/github:session-create` |
| Disconnect GitHub | Click "Disconnect GitHub" | Clears session record | `kata-cloud/github:session-clear` |
| Generate PR draft | Click "Generate PR Suggestion" | Reads staged diff + spec context, produces suggested title/body | `kata-cloud/github:pr-draft` |
| Create PR | Click "Create Pull Request" | POSTs to GitHub API, returns PR URL and number | `kata-cloud/github:pr-create` |
| Open created PR | Click "Open PR" | Opens PR URL in external browser | `kata-cloud/system:open-external-url` |

## Visual Specifications

### Color Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--panel-border` | `#2a3347` | Card borders, input borders, file item borders |
| `--panel-focus` | `#55b5ff` | Selected file border, focused panel border |
| `--text` | `#dbe2ee` | Primary text, context diff lines |
| `--muted` | `#9aaccc` | Subtitle text, file counts, status pills default |
| Staged pill border | `rgba(96, 211, 148, 0.55)` | `changes-pill.is-staged` border |
| Staged pill text | `#a6f0c4` | `changes-pill.is-staged` color |
| Unstaged pill border | `rgba(242, 198, 109, 0.5)` | `changes-pill.is-unstaged` border |
| Unstaged pill text | `#f8dea4` | `changes-pill.is-unstaged` color |
| Diff add text | `#b9f3cd` | Added lines |
| Diff add background | `rgba(65, 170, 109, 0.18)` | Added line highlight |
| Diff remove text | `#ffb8b8` | Removed lines |
| Diff remove background | `rgba(194, 88, 88, 0.2)` | Removed line highlight |
| Diff hunk text | `#9ec3ff` | Hunk header lines |
| Diff hunk background | `rgba(62, 104, 178, 0.2)` | Hunk header highlight |
| Diff meta text | `#95a7cb` | Metadata lines |
| Card background | `rgba(15, 18, 24, 0.62)` | `.changes-files`, `.changes-diff` |
| File/panel background | `rgba(20, 25, 35, 0.82)` | `.changes-file`, `.changes-diff__panel` |

### Typography

| Element | Size | Font |
|---------|------|------|
| Panel header `<h2>` | Inherited (default) | System font stack |
| Section header `<h3>` | `0.83rem` | System font stack |
| Diff panel header `<h4>` | `0.78rem` | System font stack |
| File path button | `0.79rem` | System font stack |
| Status pill | `0.7rem` | System font stack |
| Subtitle `<p>` | `0.75rem` | System font stack |
| Diff code | `0.75rem` / `line-height: 1.4` | `"IBM Plex Mono", "SF Mono", Consolas, monospace` |

### Spacing & Layout

| Property | Value |
|----------|-------|
| Changes layout grid | `grid-template-columns: minmax(240px, 1fr) minmax(320px, 1.4fr)` |
| Changes layout gap | `0.75rem` |
| Card padding | `0.75rem` (files/diff sections), `0.52rem` (file items), `0.55rem` (diff panels) |
| Card border radius | `10px` (sections), `8px` (file items, diff panels) |
| File list gap | `0.55rem` |
| File list max-height | `clamp(14rem, 42vh, 38rem)` (desktop), `clamp(10rem, 34vh, 22rem)` (narrow) |
| Diff max-height | `clamp(15rem, 48vh, 42rem)` (desktop), `clamp(12rem, 40vh, 26rem)` (narrow) |
| Diff line horizontal margin | `-0.25rem` / `0.25rem` padding (inline highlight bleed) |
| Diff line border radius | `4px` |
| Pill padding | `0.15rem 0.45rem` |
| Pill border radius | `999px` |

## Implementation Gap Analysis

| Feature | Mock Shows | Current Code | Gap |
|---------|-----------|--------------|-----|
| Left sidebar file tree grouping | Mocks 16-17 show "Changes" section in left sidebar with "Staged" and "Unstaged" sub-groups listing files | Not implemented. File list is flat in the right panel `changes-files` section without staged/unstaged grouping | Left sidebar does not subdivide files by staging status. The right panel file list shows all files in a flat list with inline pills indicating staged/unstaged status. |
| Left sidebar "Tasks" section | Mock 17 shows a "Tasks" section in the left sidebar with checkboxes for spec-derived tasks | Not implemented in Changes view. Task display is part of the orchestrator/spec domain. | No task list rendered in the left sidebar when Changes view is active. |
| Left sidebar "PRs" section | Mock 17 shows a "PRs" section listing created pull requests | Not implemented. Created PR info shows inline in the PR card. | No dedicated PR list in the left sidebar. |
| Commit message input | Standard git workflow expects a commit step between staging and PR | Not implemented. The workflow jumps from staging directly to PR creation. | No commit message field, no commit button. Users must commit via external tooling before creating a PR. |
| Line numbers in diff | Typical diff viewers show line numbers | Not implemented. Diff renders raw git output without line number columns. | `DiffText` renders lines without line number gutters. |
| File-level diff header | Typical diff tools show `a/path` and `b/path` header | Included in raw git diff output as metadata lines, but not parsed into a separate header component | File diff header is part of the raw diff text, styled as `changes-diff__line--meta`. |
| Inline stage/unstage from diff | Some tools allow staging individual hunks from the diff view | Not implemented. Stage/unstage operates on whole files only. | Hunk-level staging is not available. |
| Batch stage/unstage all | Some tools offer "Stage All" / "Unstage All" buttons | Not implemented. Each file must be staged/unstaged individually. | No bulk stage/unstage controls. |
| File type icons | Mocks may show file type indicators | Not implemented. File paths rendered as plain text. | No file extension icons or git status icons. |
| Diff stats per file | Shows insertions/deletions per file in the file list | Not implemented per file. Only aggregate staged summary provides line delta. | Per-file `+N / -N` not shown in the file list. |
| Sensitive file redaction in diff view | PR workflow redacts sensitive content in diff previews | `sanitizeDiffPreview()` in `pr-workflow.ts` L273-L284 handles redaction for PR body generation | Redaction applies only to PR draft body, not to the live diff viewer. The in-app diff view renders raw diff output without redaction. |
