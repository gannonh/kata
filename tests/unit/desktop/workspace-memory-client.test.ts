import { describe, expect, test } from 'vitest';

import { createMemoryWorkspaceClient } from '../../../apps/desktop/src/services/workspaces/memory-client';

describe('workspace memory client', () => {
  test('creates and lists workspaces', async () => {
    const client = createMemoryWorkspaceClient();
    await client.createLocal({ repoPath: '/tmp/repo', workspaceName: 'KAT-154' });
    const all = await client.list();
    expect(all).toHaveLength(1);
  });

  test('tracks active workspace', async () => {
    const client = createMemoryWorkspaceClient();
    const ws = await client.createLocal({ repoPath: '/tmp/repo', workspaceName: 'KAT-154' });
    await client.setActive(ws.id);
    expect(await client.getActiveId()).toBe(ws.id);
  });

  test('creates github workspaces and uses provided branch/base refs', async () => {
    const client = createMemoryWorkspaceClient();
    const ws = await client.createGitHub({
      repoUrl: 'https://github.com/org/repo',
      workspaceName: 'KAT-154 GH',
      branchName: 'workspace/custom-branch',
      baseRef: 'origin/main',
    });

    expect(ws.sourceType).toBe('github');
    expect(ws.branch).toBe('workspace/custom-branch');
    expect(ws.baseRef).toBe('origin/main');
  });

  test('creates new github repo workspace from repository name', async () => {
    const client = createMemoryWorkspaceClient();
    const ws = await client.createNewGitHub({
      repositoryName: 'kat-154-created',
      workspaceName: 'KAT-154 Created',
      cloneRootPath: '/tmp/repos',
    });

    expect(ws.sourceType).toBe('github');
    expect(ws.source).toBe('https://github.com/me/kat-154-created');
    expect(ws.repoRootPath).toBe('/tmp/repos/kat-154-created');
  });

  test('defaults create new clone root and accepts owner/repo form', async () => {
    const client = createMemoryWorkspaceClient();
    const ws = await client.createNewGitHub({
      repositoryName: 'kata-sh/kat-154-created.git',
      workspaceName: 'KAT-154 Created',
    });

    expect(ws.source).toBe('https://github.com/kata-sh/kat-154-created');
    expect(ws.repoRootPath).toBe('/tmp/repos/kat-154-created');
  });

  test('supports seeded state defaults', async () => {
    const client = createMemoryWorkspaceClient({
      activeWorkspaceId: 'ws_seed',
      workspaces: [
        {
          id: 'ws_seed',
          name: 'Seed',
          sourceType: 'local',
          source: '/tmp/repo',
          repoRootPath: '/tmp/repo',
          worktreePath: '/tmp/repo.worktrees/seed',
          branch: 'workspace/seed-ws',
          status: 'ready',
          createdAt: '2026-02-28T00:00:00.000Z',
          updatedAt: '2026-02-28T00:00:00.000Z',
        },
      ],
    });

    expect((await client.list()).length).toBe(1);
    expect(await client.getActiveId()).toBe('ws_seed');
  });

  test('archives and removes workspaces', async () => {
    const client = createMemoryWorkspaceClient();
    const ws = await client.createLocal({ repoPath: '/tmp/repo', workspaceName: 'KAT-154' });

    await client.archive(ws.id);
    const archived = await client.list();
    expect(archived[0]?.status).toBe('archived');
    expect(await client.getActiveId()).toBeNull();

    await client.remove(ws.id, false);
    expect(await client.list()).toHaveLength(0);
  });

  test('clears active workspace when removing active entry directly', async () => {
    const client = createMemoryWorkspaceClient();
    const ws = await client.createLocal({ repoPath: '/tmp/repo', workspaceName: 'KAT-154' });
    expect(await client.getActiveId()).toBe(ws.id);

    await client.remove(ws.id, true);
    expect(await client.getActiveId()).toBeNull();
  });

  test('throws for invalid github URL and missing ids', async () => {
    const client = createMemoryWorkspaceClient();
    await expect(
      client.createGitHub({
        repoUrl: 'https://gitlab.com/org/repo',
        workspaceName: 'KAT-154 GH',
      }),
    ).rejects.toThrow(/github\.com/i);
    await expect(client.setActive('missing')).rejects.toThrow(/not found/i);
    await expect(client.archive('missing')).rejects.toThrow(/not found/i);
    await expect(client.remove('missing', false)).rejects.toThrow(/not found/i);
  });

  test('throws for invalid create-new repository names', async () => {
    const client = createMemoryWorkspaceClient();
    await expect(
      client.createNewGitHub({
        repositoryName: '  ',
        workspaceName: 'KAT-154',
      }),
    ).rejects.toThrow(/repository name is required/i);
    await expect(
      client.createNewGitHub({
        repositoryName: 'owner/repo/extra',
        workspaceName: 'KAT-154',
      }),
    ).rejects.toThrow(/<owner>\/<name>/i);
    await expect(
      client.createNewGitHub({
        repositoryName: '////',
        workspaceName: 'KAT-154',
      }),
    ).rejects.toThrow(/<owner>\/<name>/i);
  });

  test('lists github repo suggestions from existing github workspaces', async () => {
    const now = '2026-02-28T00:00:00.000Z';
    const client = createMemoryWorkspaceClient({
      workspaces: [
        {
          id: 'ws_a',
          name: 'A',
          sourceType: 'github',
          source: 'https://github.com/kata-sh/repo-a.git',
          repoRootPath: '/tmp/repo-a',
          worktreePath: '/tmp/repo-a.worktrees/a',
          branch: 'workspace/a',
          status: 'ready',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'ws_b',
          name: 'B',
          sourceType: 'github',
          source: 'not a valid url',
          repoRootPath: '/tmp/repo-b',
          worktreePath: '/tmp/repo-b.worktrees/b',
          branch: 'workspace/b',
          status: 'ready',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'ws_local',
          name: 'Local',
          sourceType: 'local',
          source: '/tmp/local',
          repoRootPath: '/tmp/local',
          worktreePath: '/tmp/local.worktrees/local',
          branch: 'workspace/local',
          status: 'ready',
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    const all = await client.listGitHubRepos();
    expect(all).toHaveLength(2);
    expect(all.map((repo) => repo.nameWithOwner)).toContain('kata-sh/repo-a');
    expect(all.map((repo) => repo.nameWithOwner)).toContain('not a valid url');

    const filtered = await client.listGitHubRepos('repo-a');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.url).toBe('https://github.com/kata-sh/repo-a.git');
  });

  test('lists known repos derived from existing github workspaces', async () => {
    const now = '2026-02-28T00:00:00.000Z';
    const client = createMemoryWorkspaceClient({
      workspaces: [
        {
          id: 'ws_a',
          name: 'A',
          sourceType: 'github',
          source: 'https://github.com/kata-sh/repo-a.git',
          repoRootPath: '/tmp/repo-a',
          worktreePath: '/tmp/repo-a.worktrees/a',
          branch: 'workspace/a',
          status: 'ready',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'ws_b',
          name: 'B',
          sourceType: 'github',
          source: 'https://github.com/kata-sh/repo-a',
          repoRootPath: '/tmp/repo-a',
          worktreePath: '/tmp/repo-a.worktrees/b',
          branch: 'workspace/b',
          status: 'ready',
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    const repos = await client.listKnownRepos();
    expect(repos).toHaveLength(1);
    expect(repos[0]?.id).toBe('kata-sh/repo-a');
  });

  test('filters known repos and repo source lists with query terms', async () => {
    const now = '2026-02-28T00:00:00.000Z';
    const client = createMemoryWorkspaceClient({
      workspaces: [
        {
          id: 'ws_a',
          name: 'A',
          sourceType: 'github',
          source: 'https://github.com/kata-sh/repo-a.git',
          repoRootPath: '/tmp/repo-a',
          worktreePath: '/tmp/repo-a.worktrees/a',
          branch: 'workspace/a',
          status: 'ready',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'ws_b',
          name: 'B',
          sourceType: 'github',
          source: 'https://gitlab.com/kata-sh/repo-b',
          repoRootPath: '/tmp/repo-b',
          worktreePath: '/tmp/repo-b.worktrees/b',
          branch: 'workspace/b',
          status: 'ready',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'ws_c',
          name: 'C',
          sourceType: 'github',
          source: 'not-a-valid-url',
          repoRootPath: '/tmp/repo-c',
          worktreePath: '/tmp/repo-c.worktrees/c',
          branch: 'workspace/c',
          status: 'ready',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'ws_local',
          name: 'Local',
          sourceType: 'local',
          source: '/tmp/local',
          repoRootPath: '/tmp/local',
          worktreePath: '/tmp/local.worktrees/local',
          branch: 'workspace/local',
          status: 'ready',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'ws_root',
          name: 'Root',
          sourceType: 'github',
          source: 'https://github.com/',
          repoRootPath: '/tmp/root',
          worktreePath: '/tmp/root.worktrees/root',
          branch: 'workspace/root',
          status: 'ready',
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    const knownRepos = await client.listKnownRepos('repo-a');
    expect(knownRepos).toHaveLength(1);
    expect(knownRepos[0]?.id).toBe('kata-sh/repo-a');

    const branches = await client.listRepoBranches('kata-sh/repo-a', 'main');
    expect(branches).toHaveLength(1);
    expect(branches[0]?.name).toBe('main');

    const pullRequests = await client.listRepoPullRequests('kata-sh/repo-a', 'improvements');
    expect(pullRequests).toHaveLength(1);
    expect(pullRequests[0]?.number).toBe(26);

    const issues = await client.listRepoIssues('kata-sh/repo-a', '155');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.number).toBe(155);

    const fallbackBranches = await client.listRepoBranches('');
    expect(fallbackBranches[1]?.name).toContain('feature/repo-next');

    const fallbackPullRequests = await client.listRepoPullRequests('');
    expect(fallbackPullRequests[0]?.title).toContain('feat(repo):');
  });

  test('creates workspace from known repo source', async () => {
    const client = createMemoryWorkspaceClient();
    const fromDefault = await client.createFromSource({
      repoId: 'kata-sh/kata-cloud-agents',
      source: { type: 'default' },
    });
    expect(fromDefault.sourceType).toBe('github');
    expect(fromDefault.source).toBe('https://github.com/kata-sh/kata-cloud-agents');

    const fromPullRequest = await client.createFromSource({
      repoId: 'kata-sh/kata-cloud-agents',
      source: { type: 'pull_request', value: 26 },
    });
    expect(fromPullRequest.baseRef).toContain('origin/feature/');

    const fromBranch = await client.createFromSource({
      repoId: 'kata-sh/kata-cloud-agents',
      source: { type: 'branch', value: 'feature/kat-155-workspace-and-repo-mgmt' },
    });
    expect(fromBranch.baseRef).toBe('origin/feature/kat-155-workspace-and-repo-mgmt');

    const fromIssue = await client.createFromSource({
      repoId: 'kata-sh/kata-cloud-agents',
      source: { type: 'issue', value: 155 },
    });
    expect(fromIssue.branch).toBe('feature/issue-155');
  });

  test('validates create-from input and missing pull-request source', async () => {
    const client = createMemoryWorkspaceClient();

    await expect(
      client.createFromSource({
        repoId: '   ',
        source: { type: 'default' },
      }),
    ).rejects.toThrow(/repository selection is required/i);

    await expect(
      client.createFromSource({
        repoId: 'kata-sh/kata-cloud-agents',
        source: { type: 'pull_request', value: 9999 },
      }),
    ).rejects.toThrow(/pull request not found/i);

    const fallbackWorkspace = await client.createFromSource({
      repoId: '///',
      cloneRootPath: '   ',
      source: { type: 'default' },
    });
    expect(fallbackWorkspace.name).toBe('Workspace');
    expect(fallbackWorkspace.repoRootPath).toMatch(/^\/tmp\/repo-cache\//);
  });

  test('handles slug/id fallbacks when input and runtime entropy are minimal', async () => {
    const originalCrypto = globalThis.crypto;
    try {
      Object.defineProperty(globalThis, 'crypto', {
        value: undefined,
        configurable: true,
      });

      const client = createMemoryWorkspaceClient();
      const ws = await client.createLocal({
        repoPath: '/tmp/repo',
        workspaceName: '***',
      });

      expect(ws.branch).toMatch(/^workspace\/workspace-/);
      expect(ws.worktreePath).toContain('/workspace');
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        configurable: true,
      });
    }
  });
});
