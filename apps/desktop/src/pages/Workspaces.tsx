import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { CreateWorkspaceModal } from '../components/workspaces/CreateWorkspaceModal';
import { pickDirectory } from '../services/system/dialog';
import { useCreateWorkspaceHotkey } from '../hooks/useCreateWorkspaceHotkey';
import { deriveNameFromIdentifier, isGitHubRepoUrl } from '../types/workspace';
import { getWorkspaceClient, toErrorMessage, useWorkspacesStore } from '../store/workspaces';
import type { GitHubRepoOption, WorkspaceCreateFromSource } from '../services/workspaces/types';

type WorkspaceAction = 'clone' | 'create' | null;

export function deriveNameFromRepoPath(repoPath: string): string {
  const sanitized = repoPath.trim().replace(/[\\/]+$/, '');
  const segment = sanitized.split(/[\\/]/).filter(Boolean).at(-1) ?? '';
  return segment.trim() || 'Workspace';
}

export function deriveNameFromRepoUrl(repoUrl: string): string {
  try {
    return deriveNameFromIdentifier(new URL(repoUrl).pathname);
  } catch {
    return 'Workspace';
  }
}

export function deriveNameFromRepositoryInput(repositoryName: string): string {
  return deriveNameFromIdentifier(repositoryName);
}

export function buildDefaultCloneLocation(home: string): string {
  const normalizedHome = home.trim().replace(/[\\/]+$/, '');
  return `${normalizedHome}/kata/repos`;
}

export function deriveUniqueWorkspaceName(baseName: string, workspaces: { name: string }[]): string {
  const normalizedBase = baseName.trim() || 'Workspace';
  const existingNames = new Set(workspaces.map((workspace) => workspace.name.toLowerCase()));

  if (!existingNames.has(normalizedBase.toLowerCase())) {
    return normalizedBase;
  }

  let counter = 2;
  while (existingNames.has(`${normalizedBase} ${counter}`.toLowerCase())) {
    counter += 1;
  }
  return `${normalizedBase} ${counter}`;
}

export function normalizeSearchTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function repoMatchScore(repo: GitHubRepoOption, query: string): number {
  const tokens = normalizeSearchTokens(query);
  if (!tokens.length) {
    return 1;
  }

  const name = repo.nameWithOwner.toLowerCase();
  const url = repo.url.toLowerCase();
  const haystack = `${name} ${url}`;
  if (!tokens.every((token) => haystack.includes(token))) {
    return 0;
  }

  let score = 10;
  for (const token of tokens) {
    if (name === token || url === token) {
      score += 150;
    } else if (name.startsWith(token)) {
      score += 80;
    } else if (url.startsWith(token)) {
      score += 60;
    } else if (name.includes(token)) {
      score += 30;
    } else if (url.includes(token)) {
      score += 20;
    }
  }

  return score;
}

export function rankRepos(repos: GitHubRepoOption[], query: string): GitHubRepoOption[] {
  return repos
    .map((repo) => ({ repo, score: repoMatchScore(repo, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      return right.repo.updatedAt.localeCompare(left.repo.updatedAt);
    })
    .map((entry) => entry.repo)
    .slice(0, 20);
}

type GlobalProcessEnv = {
  process?: {
    env?: {
      HOME?: string;
    };
  };
};

const HOME_DIR: string = (() => {
  const home = (globalThis as GlobalProcessEnv).process?.env?.HOME;
  return typeof home === 'string' ? home : '~';
})();

const DEFAULT_CLONE_LOCATION = buildDefaultCloneLocation(HOME_DIR);

export function Workspaces() {
  const navigate = useNavigate();
  const workspaces = useWorkspacesStore((state) => state.workspaces);
  const knownRepos = useWorkspacesStore((state) => state.knownRepos);
  const isCreating = useWorkspacesStore((state) => state.isCreating);
  const isLoadingKnownRepos = useWorkspacesStore((state) => state.isLoadingKnownRepos);
  const lastError = useWorkspacesStore((state) => state.lastError);
  const load = useWorkspacesStore((state) => state.load);
  const loadKnownRepos = useWorkspacesStore((state) => state.loadKnownRepos);
  const quickCreateFromRepo = useWorkspacesStore((state) => state.quickCreateFromRepo);
  const createFromSource = useWorkspacesStore((state) => state.createFromSource);
  const listRepoBranches = useWorkspacesStore((state) => state.listRepoBranches);
  const listRepoPullRequests = useWorkspacesStore((state) => state.listRepoPullRequests);
  const listRepoIssues = useWorkspacesStore((state) => state.listRepoIssues);
  const createLocal = useWorkspacesStore((state) => state.createLocal);
  const createGitHub = useWorkspacesStore((state) => state.createGitHub);
  const createNewGitHub = useWorkspacesStore((state) => state.createNewGitHub);
  const setActive = useWorkspacesStore((state) => state.setActive);
  const archive = useWorkspacesStore((state) => state.archive);
  const remove = useWorkspacesStore((state) => state.remove);

  const [action, setAction] = useState<WorkspaceAction>(null);

  const [githubRepoUrl, setGithubRepoUrl] = useState('');
  const [allGithubRepos, setAllGithubRepos] = useState<GitHubRepoOption[]>([]);
  const [githubRepoSearchResults, setGithubRepoSearchResults] = useState<GitHubRepoOption[]>([]);
  const [debouncedRepoQuery, setDebouncedRepoQuery] = useState('');
  const [isLoadingGithubRepos, setIsLoadingGithubRepos] = useState(false);
  const [hasLoadedGithubRepos, setHasLoadedGithubRepos] = useState(false);
  const [githubRepoSearchError, setGithubRepoSearchError] = useState<string | null>(null);
  const [cloneLocation, setCloneLocation] = useState(DEFAULT_CLONE_LOCATION);
  const [newRepositoryName, setNewRepositoryName] = useState('');
  const [isPickingLocalRepo, setIsPickingLocalRepo] = useState(false);
  const [isPickingCloneLocation, setIsPickingCloneLocation] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdRepoUrl, setCreatedRepoUrl] = useState<string | null>(null);
  const [isCreateFromOpen, setIsCreateFromOpen] = useState(false);
  const [createFromRepoId, setCreateFromRepoId] = useState<string | null>(null);

  useEffect(() => {
    void load();
    void loadKnownRepos();
  }, [load, loadKnownRepos]);

  const onHotkey = useCallback(() => {
    setCreateFromRepoId(knownRepos[0]?.id ?? null);
    setIsCreateFromOpen(true);
  }, [knownRepos]);
  useCreateWorkspaceHotkey(onHotkey);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally resets form errors when action tab changes
  useEffect(() => {
    setFormError(null);
    setGithubRepoSearchError(null);
  }, [action]);

  useEffect(() => {
    if (action !== 'clone' || hasLoadedGithubRepos) {
      return;
    }

    let canceled = false;
    void (async () => {
      setIsLoadingGithubRepos(true);
      setGithubRepoSearchError(null);
      try {
        const repos = await getWorkspaceClient().listGitHubRepos();
        if (canceled) {
          return;
        }
        setAllGithubRepos(repos);
        setHasLoadedGithubRepos(true);
      } catch (error) {
        if (!canceled) {
          setGithubRepoSearchError(toErrorMessage(error));
        }
      } finally {
        if (!canceled) {
          setIsLoadingGithubRepos(false);
        }
      }
    })();

    return () => {
      canceled = true;
    };
  }, [action, hasLoadedGithubRepos]);

  useEffect(() => {
    if (action !== 'clone') {
      return;
    }

    const timer = window.setTimeout(() => {
      setDebouncedRepoQuery(githubRepoUrl);
    }, 280);

    return () => {
      window.clearTimeout(timer);
    };
  }, [action, githubRepoUrl]);

  useEffect(() => {
    if (action !== 'clone') {
      return;
    }
    setGithubRepoSearchResults(rankRepos(allGithubRepos, debouncedRepoQuery));
  }, [action, allGithubRepos, debouncedRepoQuery]);

  async function onPickLocalRepo() {
    setFormError(null);
    setIsPickingLocalRepo(true);
    try {
      const selectedPath = await pickDirectory();
      if (!selectedPath) {
        return;
      }

      await createLocal({
        repoPath: selectedPath,
        workspaceName: deriveUniqueWorkspaceName(
          deriveNameFromRepoPath(selectedPath),
          workspaces,
        ),
      });
      setCreatedRepoUrl(null);
      setAction(null);
    } catch (error) {
      setFormError(toErrorMessage(error));
    } finally {
      setIsPickingLocalRepo(false);
    }
  }

  async function onPickCloneLocation() {
    setFormError(null);
    setIsPickingCloneLocation(true);
    try {
      const selectedPath = await pickDirectory(cloneLocation.trim() || undefined);
      if (!selectedPath) {
        return;
      }
      setCloneLocation(selectedPath);
    } catch (error) {
      setFormError(toErrorMessage(error));
    } finally {
      setIsPickingCloneLocation(false);
    }
  }

  async function onSubmitClone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!githubRepoUrl.trim()) {
      setFormError('GitHub repository URL is required.');
      return;
    }
    if (!isGitHubRepoUrl(githubRepoUrl.trim())) {
      setFormError('Only github.com repositories are supported.');
      return;
    }
    try {
      await createGitHub({
        repoUrl: githubRepoUrl.trim(),
        workspaceName: deriveUniqueWorkspaceName(
          deriveNameFromRepoUrl(githubRepoUrl.trim()),
          workspaces,
        ),
        cloneRootPath: cloneLocation.trim(),
      });

      setCreatedRepoUrl(null);
      setGithubRepoUrl('');
      await loadKnownRepos();
      setAction(null);
    } catch (error) {
      setFormError(toErrorMessage(error));
    }
  }

  async function onSubmitCreateNew(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!newRepositoryName.trim()) {
      setFormError('Repository name is required.');
      return;
    }
    try {
      const workspace = await createNewGitHub({
        repositoryName: newRepositoryName.trim(),
        workspaceName: deriveUniqueWorkspaceName(
          deriveNameFromRepositoryInput(newRepositoryName),
          workspaces,
        ),
        cloneRootPath: cloneLocation.trim(),
      });

      setCreatedRepoUrl(workspace.sourceType === 'github' ? workspace.source : null);
      setNewRepositoryName('');
      await loadKnownRepos();
      setAction(null);
    } catch (error) {
      setFormError(toErrorMessage(error));
    }
  }

  async function onQuickCreate(repoId: string) {
    setFormError(null);
    try {
      await quickCreateFromRepo(repoId);
      await loadKnownRepos();
    } catch (error) {
      setFormError(toErrorMessage(error));
    }
  }

  async function onCreateFrom(input: { repoId: string; source: WorkspaceCreateFromSource }) {
    setFormError(null);
    try {
      await createFromSource(input);
      await loadKnownRepos();
    } catch (error) {
      setFormError(toErrorMessage(error));
    }
  }

  async function onOpenWorkspace(workspaceId: string) {
    await setActive(workspaceId);
    const storeError = useWorkspacesStore.getState().lastError;
    if (storeError) {
      setFormError(storeError);
      return;
    }
    navigate('/');
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Workspaces</h1>
      <p className="mt-2 text-slate-400">
        Create and manage isolated git workspaces for active work.
      </p>

      <section className="mt-6 rounded border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-slate-200">Quick Create From Known Repos</h2>
          <button
            type="button"
            onClick={() => {
              setCreateFromRepoId(knownRepos[0]?.id ?? null);
              setIsCreateFromOpen(true);
            }}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200"
          >
            Create from... <span aria-hidden="true">⌘N</span>
          </button>
        </div>

        {isLoadingKnownRepos ? (
          <p className="mt-3 text-sm text-slate-400">Loading repositories...</p>
        ) : null}
        {!isLoadingKnownRepos && knownRepos.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            No known repos yet. Create a GitHub workspace first to enable quick create.
          </p>
        ) : null}

        {!isLoadingKnownRepos && knownRepos.length > 0 ? (
          <ul className="mt-3 space-y-2" aria-label="Known repositories">
            {knownRepos.map((repo, index) => (
              <li
                key={repo.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900/30 px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => void onQuickCreate(repo.id)}
                  className="text-left text-sm text-slate-100 hover:text-slate-200"
                >
                  {repo.nameWithOwner}
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCreateFromRepoId(repo.id);
                      setIsCreateFromOpen(true);
                    }}
                    className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200"
                  >
                    Create from...
                  </button>
                  <span className="text-xs text-slate-500">{index + 1}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="mt-6 rounded border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="text-sm font-medium text-slate-200">Add Repository</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void onPickLocalRepo()}
            disabled={isCreating || isPickingLocalRepo}
            className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-900"
          >
            {isPickingLocalRepo ? 'Opening Finder...' : 'Local Repo'}
          </button>
          <button
            type="button"
            onClick={() => setAction('clone')}
            className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-900"
          >
            Clone Remote
          </button>
          <button
            type="button"
            onClick={() => setAction('create')}
            className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-900"
          >
            Create New
          </button>
        </div>

        {action === 'clone' ? (
          <form onSubmit={onSubmitClone} className="mt-4 space-y-4">
            <label className="block text-sm text-slate-200">
              GitHub repository URL
              <div className="relative mt-1">
                <input
                  value={githubRepoUrl}
                  onChange={(event) => setGithubRepoUrl(event.target.value)}
                  className="block w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 pr-10 text-slate-100"
                  placeholder="https://github.com/org/repo"
                />
                {isLoadingGithubRepos ? (
                  <output className="absolute inset-y-0 right-3 flex items-center" aria-live="polite">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-slate-100" />
                    <span className="sr-only">Loading repositories</span>
                  </output>
                ) : null}
              </div>
              {githubRepoSearchError ? (
                <p className="mt-2 text-xs text-rose-400">{githubRepoSearchError}</p>
              ) : null}
              {githubRepoSearchResults.length > 0 ? (
                <ul className="mt-2 max-h-56 overflow-auto rounded border border-slate-700 bg-slate-950">
                  {githubRepoSearchResults.map((repo) => (
                    <li key={repo.url}>
                      <button
                        type="button"
                        onClick={() => {
                          setGithubRepoUrl(repo.url);
                          setGithubRepoSearchError(null);
                        }}
                        className="flex w-full flex-col items-start gap-1 border-b border-slate-800 px-3 py-2 text-left last:border-b-0 hover:bg-slate-800/70"
                      >
                        <span className="text-sm text-slate-100">
                          {repo.nameWithOwner}
                          {repo.isPrivate ? ' · private' : ' · public'}
                        </span>
                        <span className="text-xs text-slate-400">{repo.url}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </label>

            <label className="block text-sm text-slate-200">
              Repo location
              <div className="mt-1 flex items-center gap-2">
                <input
                  value={cloneLocation}
                  onChange={(event) => setCloneLocation(event.target.value)}
                  className="block w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  placeholder="/Users/me/kata/repos"
                />
                <button
                  type="button"
                  onClick={() => void onPickCloneLocation()}
                  disabled={isPickingCloneLocation}
                  className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-200"
                >
                  {isPickingCloneLocation ? 'Opening...' : 'Browse'}
                </button>
              </div>
            </label>

            <button
              type="submit"
              disabled={isCreating}
              className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : 'Add Cloned Repo'}
            </button>
          </form>
        ) : null}

        {action === 'create' ? (
          <form onSubmit={onSubmitCreateNew} className="mt-4 space-y-4">
            <label className="block text-sm text-slate-200">
              Repository name
              <input
                value={newRepositoryName}
                onChange={(event) => setNewRepositoryName(event.target.value)}
                className="mt-1 block w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                placeholder="kat-154-created or owner/kat-154-created"
              />
            </label>

            <label className="block text-sm text-slate-200">
              Repo location
              <div className="mt-1 flex items-center gap-2">
                <input
                  value={cloneLocation}
                  onChange={(event) => setCloneLocation(event.target.value)}
                  className="block w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  placeholder="/Users/me/kata/repos"
                />
                <button
                  type="button"
                  onClick={() => void onPickCloneLocation()}
                  disabled={isPickingCloneLocation}
                  className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-200"
                >
                  {isPickingCloneLocation ? 'Opening...' : 'Browse'}
                </button>
              </div>
            </label>

            <button
              type="submit"
              disabled={isCreating}
              className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : 'Create New Repo'}
            </button>
          </form>
        ) : null}

        {(formError || lastError) && (
          <p role="alert" className="mt-3 text-sm text-rose-400">
            {formError ?? lastError}
          </p>
        )}
        {createdRepoUrl ? (
          <p className="mt-3 text-sm text-emerald-300">
            Repository created.{' '}
            <a
              href={createdRepoUrl}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-emerald-200"
            >
              View repository
            </a>
          </p>
        ) : null}
      </div>

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-slate-100">Workspace list</h2>
        {workspaces.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No workspaces yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {workspaces.map((workspace) => (
              <li
                key={workspace.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900/30 px-3 py-2"
              >
                <button
                  type="button"
                  aria-label={`Open workspace ${workspace.name}`}
                  onClick={() => void onOpenWorkspace(workspace.id)}
                  className="min-w-[220px] flex-1 text-left"
                >
                  <p className="font-medium text-slate-100">{workspace.name}</p>
                  <p className="text-xs text-slate-400">
                    {workspace.branch} · {workspace.sourceType} · {workspace.status}
                  </p>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void archive(workspace.id)}
                    className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200"
                  >
                    Archive
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(workspace.id, false)}
                    className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CreateWorkspaceModal
        isOpen={isCreateFromOpen}
        enableIssuesTab={false}
        initialRepoId={createFromRepoId}
        repos={knownRepos}
        onClose={() => setIsCreateFromOpen(false)}
        onCreate={onCreateFrom}
        loadBranches={listRepoBranches}
        loadPullRequests={listRepoPullRequests}
        loadIssues={listRepoIssues}
      />
    </div>
  );
}
