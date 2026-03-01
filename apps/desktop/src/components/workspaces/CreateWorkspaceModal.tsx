import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  WorkspaceBranchOption,
  WorkspaceCreateFromSource,
  WorkspaceIssueOption,
  WorkspaceKnownRepoOption,
  WorkspacePullRequestOption,
} from '../../services/workspaces/types';

type CreateFromTab = 'pull_requests' | 'branches' | 'issues';

interface CreateWorkspaceModalProps {
  isOpen: boolean;
  enableIssuesTab?: boolean;
  initialRepoId?: string | null;
  repos: WorkspaceKnownRepoOption[];
  onClose: () => void;
  onCreate: (input: { repoId: string; source: WorkspaceCreateFromSource }) => Promise<void>;
  loadPullRequests: (repoId: string, query?: string) => Promise<WorkspacePullRequestOption[]>;
  loadBranches: (repoId: string, query?: string) => Promise<WorkspaceBranchOption[]>;
  loadIssues: (repoId: string, query?: string) => Promise<WorkspaceIssueOption[]>;
}

export function CreateWorkspaceModal({
  isOpen,
  enableIssuesTab = false,
  initialRepoId,
  repos,
  onClose,
  onCreate,
  loadPullRequests,
  loadBranches,
  loadIssues,
}: CreateWorkspaceModalProps) {
  const [repoId, setRepoId] = useState(initialRepoId ?? repos[0]?.id ?? '');
  const [tab, setTab] = useState<CreateFromTab>('branches');
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pullRequests, setPullRequests] = useState<WorkspacePullRequestOption[]>([]);
  const [branches, setBranches] = useState<WorkspaceBranchOption[]>([]);
  const [issues, setIssues] = useState<WorkspaceIssueOption[]>([]);
  const [selectedPullRequest, setSelectedPullRequest] = useState<number | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedIssue, setSelectedIssue] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setRepoId(initialRepoId ?? repos[0]?.id ?? '');
    setTab('branches');
    setQuery('');
    setError(null);
  }, [initialRepoId, isOpen, repos]);

  useEffect(() => {
    if (!enableIssuesTab && tab === 'issues') {
      setTab('branches');
    }
  }, [enableIssuesTab, tab]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally resets search when tab changes
  useEffect(() => {
    setQuery('');
  }, [tab]);

  const handleEscape = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, handleEscape]);

  useEffect(() => {
    if (!isOpen || !repoId) {
      return;
    }

    let canceled = false;
    void (async () => {
      setIsLoading(true);
      setError(null);
      try {
        if (tab === 'pull_requests') {
          const items = await loadPullRequests(repoId, query);
          if (canceled) return;
          setPullRequests(items);
          setSelectedPullRequest(items[0]?.number ?? null);
        } else if (tab === 'branches') {
          const items = await loadBranches(repoId, query);
          if (canceled) return;
          setBranches(items);
          setSelectedBranch(items[0]?.name ?? '');
        } else if (enableIssuesTab) {
          const items = await loadIssues(repoId, query);
          if (canceled) return;
          setIssues(items);
          setSelectedIssue(items[0]?.number ?? null);
        }
      } catch (loadError) {
        if (!canceled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load options');
        }
      } finally {
        if (!canceled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      canceled = true;
    };
  }, [enableIssuesTab, isOpen, loadBranches, loadIssues, loadPullRequests, query, repoId, tab]);

  const canCreate = useMemo(() => {
    if (isLoading) return false;
    if (!repoId) return false;
    if (tab === 'pull_requests') return selectedPullRequest !== null;
    if (tab === 'branches') return Boolean(selectedBranch);
    if (!enableIssuesTab) return false;
    return selectedIssue !== null;
  }, [enableIssuesTab, isLoading, repoId, selectedBranch, selectedIssue, selectedPullRequest, tab]);

  if (!isOpen) {
    return null;
  }

  async function handleCreate() {
    if (!repoId || isLoading) return;
    setError(null);
    try {
      if (tab === 'pull_requests' && selectedPullRequest !== null) {
        await onCreate({ repoId, source: { type: 'pull_request', value: selectedPullRequest } });
      } else if (tab === 'branches' && selectedBranch) {
        await onCreate({ repoId, source: { type: 'branch', value: selectedBranch } });
      } else if (enableIssuesTab && tab === 'issues' && selectedIssue !== null) {
        await onCreate({ repoId, source: { type: 'issue', value: selectedIssue } });
      } else {
        return;
      }
      onClose();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create workspace');
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay dismisses modal on click
    <div role="presentation" className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-8" onClick={onClose}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only prevents backdrop close */}
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Create workspace"
        className="w-full max-w-3xl rounded border border-slate-700 bg-slate-950 shadow-xl"
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h3 className="text-base font-semibold text-slate-100">Create workspace from...</h3>
        </div>

        <div className="space-y-4 p-4">
          <label className="block text-sm text-slate-200">
            Repository
            <select
              value={repoId}
              onChange={(event) => setRepoId(event.target.value)}
              className="mt-1 block w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
            >
              {repos.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.nameWithOwner}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab('branches')}
              className={`rounded px-3 py-1.5 text-sm ${
                tab === 'branches' ? 'bg-slate-200 text-slate-900' : 'bg-slate-800 text-slate-200'
              }`}
            >
              Branches
            </button>
            <button
              type="button"
              onClick={() => setTab('pull_requests')}
              className={`rounded px-3 py-1.5 text-sm ${
                tab === 'pull_requests' ? 'bg-slate-200 text-slate-900' : 'bg-slate-800 text-slate-200'
              }`}
            >
              Pull requests
            </button>
            <button
              type="button"
              disabled={!enableIssuesTab}
              title={enableIssuesTab ? undefined : 'Coming soon: create from GitHub issues'}
              onClick={() => {
                if (enableIssuesTab) {
                  setTab('issues');
                }
              }}
              className={`rounded px-3 py-1.5 text-sm ${
                !enableIssuesTab
                  ? 'cursor-not-allowed bg-slate-800 text-slate-500 opacity-60'
                  : tab === 'issues'
                    ? 'bg-slate-200 text-slate-900'
                    : 'bg-slate-800 text-slate-200'
              }`}
            >
              Issues
            </button>
          </div>

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="block w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
            placeholder={
              tab === 'pull_requests'
                ? 'Search by title, number'
                : tab === 'branches'
                  ? 'Search by branch name'
                  : 'Search by issue number, title'
            }
          />

          <div className="max-h-72 overflow-auto rounded border border-slate-800 bg-slate-900/50">
            {isLoading ? (
              <p className="px-3 py-2 text-sm text-slate-400">Loading...</p>
            ) : null}
            {!isLoading && tab === 'pull_requests' && pullRequests.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-400">No pull requests found.</p>
            ) : null}
            {!isLoading && tab === 'branches' && branches.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-400">No branches found.</p>
            ) : null}
            {!isLoading && tab === 'issues' && issues.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-400">No issues found.</p>
            ) : null}

            {!isLoading && tab === 'pull_requests'
              ? pullRequests.map((entry) => (
                  <button
                    key={entry.number}
                    type="button"
                    onClick={() => setSelectedPullRequest(entry.number)}
                    className={`block w-full border-b border-slate-800 px-3 py-2 text-left text-sm last:border-b-0 ${
                      selectedPullRequest === entry.number ? 'bg-slate-800 text-slate-100' : 'text-slate-300'
                    }`}
                  >
                    #{entry.number} {entry.title}
                  </button>
                ))
              : null}

            {!isLoading && tab === 'branches'
              ? branches.map((entry) => (
                  <button
                    key={entry.name}
                    type="button"
                    onClick={() => setSelectedBranch(entry.name)}
                    className={`block w-full border-b border-slate-800 px-3 py-2 text-left text-sm last:border-b-0 ${
                      selectedBranch === entry.name ? 'bg-slate-800 text-slate-100' : 'text-slate-300'
                    }`}
                  >
                    {entry.name}
                    {entry.isDefault ? ' (default)' : ''}
                  </button>
                ))
              : null}

            {!isLoading && tab === 'issues'
              ? issues.map((entry) => (
                  <button
                    key={entry.number}
                    type="button"
                    onClick={() => setSelectedIssue(entry.number)}
                    className={`block w-full border-b border-slate-800 px-3 py-2 text-left text-sm last:border-b-0 ${
                      selectedIssue === entry.number ? 'bg-slate-800 text-slate-100' : 'text-slate-300'
                    }`}
                  >
                    #{entry.number} {entry.title}
                  </button>
                ))
              : null}
          </div>

          {error ? (
            <p role="alert" className="text-sm text-rose-400">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-800 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => void handleCreate()}
            className="rounded bg-slate-200 px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
          >
            Create workspace
          </button>
        </div>
      </div>
    </div>
  );
}
