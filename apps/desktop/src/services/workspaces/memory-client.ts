import {
  deriveNameFromIdentifier,
  deriveWorkspaceBranchName,
  isGitHubRepoUrl,
  toSlug,
  type Workspace,
} from '../../types/workspace';
import type {
  CreateWorkspaceFromSourceInput,
  CreateGitHubWorkspaceInput,
  CreateLocalWorkspaceInput,
  CreateNewGitHubWorkspaceInput,
  GitHubRepoOption,
  WorkspaceBranchOption,
  WorkspaceClient,
  WorkspaceIssueOption,
  WorkspaceKnownRepoOption,
  WorkspacePullRequestOption,
} from './types';

interface MemoryWorkspaceState {
  activeWorkspaceId: string | null;
  workspaces: Workspace[];
}

function generateWorkspaceId(): string {
  const fallback = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const suffix = globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 8) ?? fallback;
  return `ws_${suffix}`;
}

const toWorkspaceSlug = toSlug;

function parseRepositoryInput(repositoryName: string): {
  owner: string;
  repo: string;
  url: string;
} {
  const normalized = repositoryName.trim().replace(/\.git$/i, '');
  if (!normalized) {
    throw new Error('Repository name is required');
  }

  const segments = normalized
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0 || segments.length > 2) {
    throw new Error('Repository name must be "<name>" or "<owner>/<name>"');
  }

  const [owner, repo] = segments.length === 2 ? segments : ['me', segments[0]];

  return {
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
  };
}

function toRepoId(repoUrl: string): string | null {
  try {
    const parsed = new URL(repoUrl);
    if (parsed.hostname !== 'github.com') {
      return null;
    }
    const value = parsed.pathname.replace(/^\/+/, '').replace(/\.git$/i, '');
    return value || null;
  } catch {
    return null;
  }
}

const deriveWorkspaceNameFromRepoId = deriveNameFromIdentifier;

function deriveIssueBranchName(issueNumber: number): string {
  return `feature/issue-${issueNumber}`;
}

function repoCacheKey(repoId: string): string {
  return repoId.replaceAll('/', '__');
}

function rankByQuery<T extends { updatedAt: string }>(
  items: T[],
  query: string | undefined,
  toHaystack: (item: T) => string,
): T[] {
  const normalizedQuery = query?.trim().toLowerCase();
  const filtered = normalizedQuery
    ? items.filter((item) => toHaystack(item).toLowerCase().includes(normalizedQuery))
    : items;
  return [...filtered]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 20);
}

function listKnownReposFromState(state: MemoryWorkspaceState): WorkspaceKnownRepoOption[] {
  const map = new Map<string, WorkspaceKnownRepoOption>();
  for (const workspace of state.workspaces) {
    if (workspace.sourceType !== 'github') {
      continue;
    }
    const repoId = toRepoId(workspace.source);
    if (!repoId) {
      continue;
    }
    const existing = map.get(repoId);
    if (!existing || workspace.updatedAt > existing.updatedAt) {
      map.set(repoId, {
        id: repoId,
        nameWithOwner: repoId,
        url: `https://github.com/${repoId}`,
        updatedAt: workspace.updatedAt,
      });
    }
  }

  return [...map.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function listRepoBranchesMock(repoId: string): WorkspaceBranchOption[] {
  const now = new Date().toISOString();
  const slug = repoId.split('/').filter(Boolean).at(-1) ?? 'repo';
  return [
    { name: 'main', isDefault: true, updatedAt: now },
    { name: `feature/${slug}-next`, isDefault: false, updatedAt: now },
  ];
}

function listRepoPullRequestsMock(repoId: string): WorkspacePullRequestOption[] {
  const now = new Date().toISOString();
  const slug = repoId.split('/').filter(Boolean).at(-1) ?? 'repo';
  return [
    {
      number: 26,
      title: `feat(${slug}): follow-up workspace improvements`,
      headBranch: `feature/${slug}-improvements`,
      updatedAt: now,
    },
  ];
}

function listRepoIssuesMock(repoId: string): WorkspaceIssueOption[] {
  const now = new Date().toISOString();
  return [
    {
      number: 155,
      title: `${repoId}: Workspace and repo mgmt`,
      updatedAt: now,
    },
  ];
}

function upsertWorkspace(
  state: MemoryWorkspaceState,
  input: {
    sourceType: Workspace['sourceType'];
    source: string;
    repoRootPath: string;
    worktreePath: string;
    workspaceName: string;
    branchName?: string;
    baseRef?: string;
  },
): Workspace {
  const id = generateWorkspaceId();
  const now = new Date().toISOString();
  const branch = input.branchName ?? deriveWorkspaceBranchName(input.workspaceName, id.slice(-4));
  const workspace: Workspace = {
    id,
    name: input.workspaceName,
    sourceType: input.sourceType,
    source: input.source,
    repoRootPath: input.repoRootPath,
    worktreePath: input.worktreePath,
    branch,
    baseRef: input.baseRef,
    status: 'ready',
    createdAt: now,
    updatedAt: now,
  };

  state.workspaces.push(workspace);
  return { ...workspace };
}

export function createMemoryWorkspaceClient(
  initialState: Partial<MemoryWorkspaceState> = {},
): WorkspaceClient {
  const state: MemoryWorkspaceState = {
    activeWorkspaceId: initialState.activeWorkspaceId ?? null,
    workspaces: (initialState.workspaces ?? []).map((ws) => ({ ...ws })),
  };

  return {
    list: async () => state.workspaces.map((workspace) => ({ ...workspace })),
    listKnownRepos: async (query?: string) =>
      rankByQuery(listKnownReposFromState(state), query, (repo) => {
        return `${repo.nameWithOwner} ${repo.url}`;
      }),
    listRepoBranches: async (repoId: string, query?: string) =>
      rankByQuery(listRepoBranchesMock(repoId), query, (branch) => branch.name),
    listRepoPullRequests: async (repoId: string, query?: string) =>
      rankByQuery(listRepoPullRequestsMock(repoId), query, (pr) => {
        return `${pr.number} ${pr.title} ${pr.headBranch}`;
      }),
    listRepoIssues: async (repoId: string, query?: string) =>
      rankByQuery(listRepoIssuesMock(repoId), query, (issue) => {
        return `${issue.number} ${issue.title}`;
      }),
    listGitHubRepos: async (query?: string) => {
      const candidates = new Map<string, GitHubRepoOption>();
      for (const workspace of state.workspaces) {
        if (workspace.sourceType !== 'github') {
          continue;
        }
        const nameWithOwner = toRepoId(workspace.source) ?? workspace.source;

        candidates.set(workspace.source, {
          nameWithOwner,
          url: workspace.source,
          isPrivate: true,
          updatedAt: workspace.updatedAt,
        });
      }

      const fallback: GitHubRepoOption = {
        nameWithOwner: 'org/repo',
        url: 'https://github.com/org/repo',
        isPrivate: true,
        updatedAt: new Date().toISOString(),
      };
      if (!candidates.size) {
        candidates.set(fallback.url, fallback);
      }

      const normalizedQuery = query?.trim().toLowerCase();
      const list = [...candidates.values()];
      if (!normalizedQuery) {
        return list.slice(0, 20);
      }

      return list
        .filter((repo) => {
          const haystack = `${repo.nameWithOwner} ${repo.url}`.toLowerCase();
          return haystack.includes(normalizedQuery);
        })
        .slice(0, 20);
    },
    createLocal: async (input: CreateLocalWorkspaceInput) => {
      const slug = toWorkspaceSlug(input.workspaceName);
      const workspace = upsertWorkspace(state, {
        sourceType: 'local',
        source: input.repoPath,
        repoRootPath: input.repoPath,
        worktreePath: `${input.repoPath}.worktrees/${slug}`,
        workspaceName: input.workspaceName,
        branchName: input.branchName,
        baseRef: input.baseRef,
      });
      state.activeWorkspaceId = workspace.id;
      return workspace;
    },
    createGitHub: async (input: CreateGitHubWorkspaceInput) => {
      if (!isGitHubRepoUrl(input.repoUrl)) {
        throw new Error('Only github.com repositories are supported');
      }

      const slug = toWorkspaceSlug(input.workspaceName);
      const parsedUrl = new URL(input.repoUrl);
      const repoPath = parsedUrl.pathname.replace(/^\/+/, '').replace(/\.git$/i, '');
      const ownerRepo = repoPath.replace('/', '__');
      const root = input.cloneRootPath?.trim() || '/tmp/repo-cache';
      const cachePath = `${root}/${ownerRepo}`;
      const workspace = upsertWorkspace(state, {
        sourceType: 'github',
        source: input.repoUrl,
        repoRootPath: cachePath,
        worktreePath: `${cachePath}.worktrees/${slug}`,
        workspaceName: input.workspaceName,
        branchName: input.branchName,
        baseRef: input.baseRef,
      });
      state.activeWorkspaceId = workspace.id;
      return workspace;
    },
    createNewGitHub: async (input: CreateNewGitHubWorkspaceInput) => {
      const parsed = parseRepositoryInput(input.repositoryName);
      const slug = toWorkspaceSlug(parsed.repo);
      const root = input.cloneRootPath?.trim() || '/tmp/repos';
      const workspace = upsertWorkspace(state, {
        sourceType: 'github',
        source: parsed.url,
        repoRootPath: `${root}/${parsed.repo}`,
        worktreePath: `${root}/${parsed.repo}.worktrees/${slug}`,
        workspaceName: input.workspaceName,
        branchName: input.branchName,
        baseRef: input.baseRef,
      });
      state.activeWorkspaceId = workspace.id;
      return workspace;
    },
    createFromSource: async (input: CreateWorkspaceFromSourceInput) => {
      const repoId = input.repoId.trim();
      if (!repoId) {
        throw new Error('Repository selection is required');
      }
      const repoUrl = `https://github.com/${repoId}`;
      const workspaceName = input.workspaceName?.trim() || deriveWorkspaceNameFromRepoId(repoId);
      const cacheKey = repoCacheKey(repoId);
      const root = input.cloneRootPath?.trim() || '/tmp/repo-cache';
      const cachePath = `${root}/${cacheKey}`;
      const worktreePath = `${cachePath}.worktrees/${toWorkspaceSlug(workspaceName)}`;

      let created: Workspace;
      switch (input.source.type) {
        case 'default':
          created = upsertWorkspace(state, {
            sourceType: 'github',
            source: repoUrl,
            repoRootPath: cachePath,
            worktreePath,
            workspaceName,
            baseRef: 'origin/main',
          });
          break;
        case 'pull_request': {
          const pullRequestNumber = input.source.value;
          const pullRequest = listRepoPullRequestsMock(repoId).find(
            (entry) => entry.number === pullRequestNumber,
          );
          if (!pullRequest) {
            throw new Error(`Pull request not found: ${pullRequestNumber}`);
          }
          created = upsertWorkspace(state, {
            sourceType: 'github',
            source: repoUrl,
            repoRootPath: cachePath,
            worktreePath,
            workspaceName,
            baseRef: `origin/${pullRequest.headBranch}`,
          });
          break;
        }
        case 'branch':
          created = upsertWorkspace(state, {
            sourceType: 'github',
            source: repoUrl,
            repoRootPath: cachePath,
            worktreePath,
            workspaceName,
            baseRef: `origin/${input.source.value}`,
          });
          break;
        case 'issue':
          created = upsertWorkspace(state, {
            sourceType: 'github',
            source: repoUrl,
            repoRootPath: cachePath,
            worktreePath,
            workspaceName,
            branchName: deriveIssueBranchName(input.source.value),
            baseRef: 'origin/main',
          });
          break;
      }
      state.activeWorkspaceId = created.id;
      return created;
    },
    setActive: async (id: string) => {
      const found = state.workspaces.some((workspace) => workspace.id === id);
      if (!found) {
        throw new Error(`Workspace not found: ${id}`);
      }
      state.activeWorkspaceId = id;
    },
    getActiveId: async () => state.activeWorkspaceId,
    archive: async (id: string) => {
      const workspace = state.workspaces.find((entry) => entry.id === id);
      if (!workspace) {
        throw new Error(`Workspace not found: ${id}`);
      }

      workspace.status = 'archived';
      workspace.updatedAt = new Date().toISOString();
      if (state.activeWorkspaceId === id) {
        state.activeWorkspaceId = null;
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    remove: async (id: string, _removeFiles: boolean) => {
      const next = state.workspaces.filter((workspace) => workspace.id !== id);
      if (next.length === state.workspaces.length) {
        throw new Error(`Workspace not found: ${id}`);
      }

      state.workspaces = next;
      if (state.activeWorkspaceId === id) {
        state.activeWorkspaceId = null;
      }
    },
  };
}
