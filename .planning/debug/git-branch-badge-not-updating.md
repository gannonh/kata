---
status: diagnosed
trigger: "GitWatcher file watching + IPC broadcast is not causing the branch badge to update in the UI when a git checkout happens"
created: 2026-02-03T00:00:00Z
updated: 2026-02-03T00:00:00Z
---

## Current Focus

hypothesis: GitBranchBadge has its own local state and does NOT listen to onGitStatusChanged or useGitStatus - it only fetches once on mount/workingDirectory change
test: Code review of GitBranchBadge vs useGitStatus
expecting: GitBranchBadge should use useGitStatus hook but doesn't
next_action: Report root cause

## Symptoms

expected: Branch badge updates in real-time when git checkout happens
actual: Branch badge does NOT update on checkout or window focus
errors: none
reproduction: Run `git checkout -b test-live-uat` while app is open
started: Since implementation

## Eliminated

(none needed - root cause found on first hypothesis)

## Evidence

- timestamp: 2026-02-03T00:01:00Z
  checked: GitBranchBadge component in FreeFormInput.tsx (lines 1870-1935)
  found: GitBranchBadge manages its own local React state (useState<GitState | null>) and only fetches git status in a useEffect triggered by [workingDirectory] changes. It has NO listener for onGitStatusChanged events and does NOT use the useGitStatus hook.
  implication: This is the primary root cause. The GitBranchBadge is completely disconnected from the real-time update pipeline.

- timestamp: 2026-02-03T00:02:00Z
  checked: useGitStatus hook (lines 100-113)
  found: The useGitStatus hook correctly listens for onGitStatusChanged and compares changedDir === workspaceRootPath. It also refreshes on window focus. This hook works correctly.
  implication: The infrastructure for real-time updates exists and works, but GitBranchBadge doesn't use it.

- timestamp: 2026-02-03T00:03:00Z
  checked: FreeFormInput component usage of useGitStatus (line 253)
  found: FreeFormInput does call useGitStatus at line 253, but only to get currentBranch for the PrBadge's branch-change trigger. The gitState from useGitStatus is named `prGitState` and is NOT passed to GitBranchBadge.
  implication: The data is available in the parent but not wired to GitBranchBadge.

- timestamp: 2026-02-03T00:04:00Z
  checked: Path mismatch analysis
  found: useGitStatus (line 253) is called with workspaceRootPath (derived from workspace.rootPath). GitBranchBadge (line 1419) receives workingDirectory prop (the session's working directory). The GitWatcher in ipc.ts (line 833) keys watchers by the dirPath passed to GIT_STATUS. If workspaceRootPath !== workingDirectory, the GitWatcher is started for whichever path was queried first. The onGitStatusChanged listener in useGitStatus compares changedDir === workspaceRootPath (line 106). So there's potentially also a path mismatch between what the watcher broadcasts and what the listener expects.
  implication: Secondary issue - even if GitBranchBadge used onGitStatusChanged, paths might not match.

- timestamp: 2026-02-03T00:05:00Z
  checked: GitWatcher keying in ipc.ts (line 828-835)
  found: The GIT_STATUS handler starts a watcher keyed by dirPath - whatever path was passed by the caller. useGitStatus passes workspaceRootPath. GitBranchBadge passes workingDirectory. If these differ, two separate watchers could be created, or only one watcher exists for the "wrong" path.
  implication: The watcher may be watching the workspaceRootPath (from useGitStatus's call) while GitBranchBadge queries workingDirectory. If these are different directories, the watcher won't cover GitBranchBadge's directory.

## Resolution

root_cause: |
  **PRIMARY: GitBranchBadge is completely disconnected from the real-time update pipeline.**

  The GitBranchBadge component (FreeFormInput.tsx:1870-1935) uses its own local useState
  and only fetches git status via a useEffect triggered by workingDirectory changes.
  It has NO listener for the GIT_STATUS_CHANGED IPC event and does NOT use the useGitStatus hook.

  The real-time update infrastructure exists and works:
  1. GitWatcher (git-watcher.ts) watches .git/HEAD and fires callbacks on changes
  2. IPC handler (ipc.ts:130-136) broadcasts GIT_STATUS_CHANGED to all windows
  3. Preload (preload/index.ts:420-428) bridges onGitStatusChanged correctly
  4. useGitStatus hook (useGitStatus.ts:101-113) listens for onGitStatusChanged and refreshes

  But GitBranchBadge bypasses all of this by doing its own one-shot fetch.

  **SECONDARY: Potential path mismatch between watcher and badge.**

  Even if GitBranchBadge were wired up to onGitStatusChanged:
  - useGitStatus is called with workspaceRootPath (workspace.rootPath from config)
  - GitBranchBadge fetches using workingDirectory (session's working dir)
  - GitWatcher is keyed by whichever dirPath was passed to GIT_STATUS first
  - onGitStatusChanged listener compares changedDir === workspaceRootPath

  If workingDirectory is a subdirectory of workspaceRootPath (or a different repo),
  the path comparison would fail and updates would be silently dropped.

fix: (not applied - diagnosis only)
verification: (not applied)
files_changed: []
