import { beforeEach, describe, expect, test } from 'vitest';

import { createMemoryWorkspaceClient } from '../../../apps/desktop/src/services/workspaces/memory-client';
import {
  getWorkspaceClient,
  resetWorkspacesStore,
  setWorkspaceClient,
  useWorkspacesStore,
} from '../../../apps/desktop/src/store/workspaces';
import type { WorkspaceClient } from '../../../apps/desktop/src/services/workspaces/types';

describe('useWorkspacesStore', () => {
  beforeEach(() => {
    setWorkspaceClient(createMemoryWorkspaceClient());
    resetWorkspacesStore();
  });

  test('load fetches workspaces into state', async () => {
    await useWorkspacesStore.getState().load();
    expect(Array.isArray(useWorkspacesStore.getState().workspaces)).toBe(true);
  });

  test('createLocal appends and sets active workspace', async () => {
    await useWorkspacesStore
      .getState()
      .createLocal({ repoPath: '/tmp/repo', workspaceName: 'KAT-154' });
    const state = useWorkspacesStore.getState();
    expect(state.workspaces.length).toBe(1);
    expect(state.activeWorkspaceId).toBe(state.workspaces[0]?.id ?? null);
  });

  test('createLocal returns the created workspace', async () => {
    const workspace = await useWorkspacesStore
      .getState()
      .createLocal({ repoPath: '/tmp/repo', workspaceName: 'KAT-154' });
    expect(workspace.name).toBe('KAT-154');
    expect(workspace.id).toBeTruthy();
  });

  test('createGitHub archive and remove lifecycle', async () => {
    const store = useWorkspacesStore.getState();
    await store.createGitHub({
      repoUrl: 'https://github.com/org/repo',
      workspaceName: 'KAT-154 GH',
    });

    const created = useWorkspacesStore.getState().workspaces[0];
    expect(created?.name).toBe('KAT-154 GH');
    if (!created) {
      throw new Error('expected workspace to be created');
    }

    await useWorkspacesStore.getState().archive(created.id);
    expect(
      useWorkspacesStore.getState().workspaces.find((workspace) => workspace.id === created.id)
        ?.status,
    ).toBe('archived');

    await useWorkspacesStore.getState().remove(created.id, false);
    expect(
      useWorkspacesStore.getState().workspaces.find((workspace) => workspace.id === created.id),
    ).toBeUndefined();
  });

  test('createNewGitHub appends and sets active workspace', async () => {
    const workspace = await useWorkspacesStore.getState().createNewGitHub({
      repositoryName: 'kat-154-created',
      workspaceName: 'kat-154-created',
      cloneRootPath: '/tmp/repos',
    });

    expect(workspace.name).toBe('kat-154-created');
    const state = useWorkspacesStore.getState();
    expect(state.activeWorkspaceId).toBe(workspace.id);
  });

  test('quickCreateFromRepo appends workspace and sets active workspace', async () => {
    const workspace = await useWorkspacesStore.getState().quickCreateFromRepo('kata-sh/kata-cloud-agents');
    const state = useWorkspacesStore.getState();
    expect(workspace.source).toBe('https://github.com/kata-sh/kata-cloud-agents');
    expect(state.activeWorkspaceId).toBe(workspace.id);
    expect(state.workspaces.some((entry) => entry.id === workspace.id)).toBe(true);
  });

  test('loadKnownRepos stores known repos and loading state', async () => {
    await useWorkspacesStore.getState().createGitHub({
      repoUrl: 'https://github.com/kata-sh/kata-cloud-agents',
      workspaceName: 'kata-cloud-agents',
    });

    const knownRepos = await useWorkspacesStore.getState().loadKnownRepos();
    expect(knownRepos.length).toBe(1);
    expect(useWorkspacesStore.getState().isLoadingKnownRepos).toBe(false);
    expect(useWorkspacesStore.getState().knownRepos[0]?.id).toBe('kata-sh/kata-cloud-agents');
  });

  test('archiving a non-active workspace preserves active selection', async () => {
    await useWorkspacesStore
      .getState()
      .createLocal({ repoPath: '/tmp/repo', workspaceName: 'Workspace A' });
    const first = useWorkspacesStore.getState().workspaces[0];
    if (!first) {
      throw new Error('expected first workspace');
    }

    await useWorkspacesStore
      .getState()
      .createLocal({ repoPath: '/tmp/repo', workspaceName: 'Workspace B' });
    const activeBefore = useWorkspacesStore.getState().activeWorkspaceId;

    await useWorkspacesStore.getState().archive(first.id);
    const state = useWorkspacesStore.getState();
    expect(state.activeWorkspaceId).toBe(activeBefore);
    expect(state.workspaces.find((workspace) => workspace.id === first.id)?.status).toBe(
      'archived',
    );
  });

  test('setActive success and remove non-active preserve active selection', async () => {
    await useWorkspacesStore
      .getState()
      .createLocal({ repoPath: '/tmp/repo', workspaceName: 'Workspace A' });
    const first = useWorkspacesStore.getState().workspaces[0];
    if (!first) {
      throw new Error('expected first workspace');
    }

    await useWorkspacesStore
      .getState()
      .createLocal({ repoPath: '/tmp/repo', workspaceName: 'Workspace B' });
    const second = useWorkspacesStore.getState().workspaces[1];
    if (!second) {
      throw new Error('expected second workspace');
    }

    await useWorkspacesStore.getState().setActive(first.id);
    expect(useWorkspacesStore.getState().activeWorkspaceId).toBe(first.id);

    await useWorkspacesStore.getState().remove(second.id, false);
    expect(useWorkspacesStore.getState().activeWorkspaceId).toBe(first.id);
  });

  test('create actions re-throw errors after setting lastError', async () => {
    const failingClient: WorkspaceClient = {
      list: async () => [],
      listGitHubRepos: async () => [],
      listKnownRepos: async () => [],
      listRepoBranches: async () => [],
      listRepoPullRequests: async () => [],
      listRepoIssues: async () => [],
      createLocal: async () => {
        throw new Error('local failed');
      },
      createGitHub: async () => {
        throw new Error('github failed');
      },
      createNewGitHub: async () => {
        throw new Error('github new failed');
      },
      createFromSource: async () => {
        throw new Error('create from failed');
      },
      setActive: async () => {},
      getActiveId: async () => null,
      archive: async () => {},
      remove: async () => {},
    };

    setWorkspaceClient(failingClient);
    resetWorkspacesStore();

    await expect(
      useWorkspacesStore
        .getState()
        .createLocal({ repoPath: '/tmp/repo', workspaceName: 'KAT-154' }),
    ).rejects.toThrow('local failed');
    expect(useWorkspacesStore.getState().lastError).toBe('local failed');
    expect(useWorkspacesStore.getState().isCreating).toBe(false);

    await expect(
      useWorkspacesStore
        .getState()
        .createGitHub({ repoUrl: 'https://github.com/org/repo', workspaceName: 'KAT-154' }),
    ).rejects.toThrow('github failed');
    expect(useWorkspacesStore.getState().lastError).toBe('github failed');
    expect(useWorkspacesStore.getState().isCreating).toBe(false);

    await expect(
      useWorkspacesStore.getState().createNewGitHub({
        repositoryName: 'kat-154-created',
        workspaceName: 'KAT-154',
        cloneRootPath: '/tmp/repos',
      }),
    ).rejects.toThrow('github new failed');
    expect(useWorkspacesStore.getState().lastError).toBe('github new failed');
    expect(useWorkspacesStore.getState().isCreating).toBe(false);
  });

  test('stores errors from failing non-create client actions', async () => {
    const failingClient: WorkspaceClient = {
      list: async () => {
        throw new Error('load failed');
      },
      listGitHubRepos: async () => [],
      listKnownRepos: async () => [],
      listRepoBranches: async () => [],
      listRepoPullRequests: async () => [],
      listRepoIssues: async () => [],
      createLocal: async () => {
        throw new Error('local failed');
      },
      createGitHub: async () => {
        throw new Error('github failed');
      },
      createNewGitHub: async () => {
        throw new Error('github new failed');
      },
      createFromSource: async () => {
        throw new Error('create from failed');
      },
      setActive: async () => {
        throw new Error('active failed');
      },
      getActiveId: async () => null,
      archive: async () => {
        throw new Error('archive failed');
      },
      remove: async () => {
        throw new Error('remove failed');
      },
    };

    setWorkspaceClient(failingClient);
    resetWorkspacesStore();

    await useWorkspacesStore.getState().load();
    expect(useWorkspacesStore.getState().lastError).toBe('load failed');

    await useWorkspacesStore.getState().setActive('ws_missing');
    expect(useWorkspacesStore.getState().lastError).toBe('active failed');

    await useWorkspacesStore.getState().archive('ws_missing');
    expect(useWorkspacesStore.getState().lastError).toBe('archive failed');

    await useWorkspacesStore.getState().remove('ws_missing', false);
    expect(useWorkspacesStore.getState().lastError).toBe('remove failed');
  });

  test('stores errors for repo list lookups and rethrows option-loading failures', async () => {
    const failingClient: WorkspaceClient = {
      list: async () => [],
      listGitHubRepos: async () => [],
      listKnownRepos: async () => {
        throw new Error('known repos failed');
      },
      listRepoBranches: async () => {
        throw new Error('branches failed');
      },
      listRepoPullRequests: async () => {
        throw new Error('pull requests failed');
      },
      listRepoIssues: async () => {
        throw new Error('issues failed');
      },
      createLocal: async () => {
        throw new Error('local failed');
      },
      createGitHub: async () => {
        throw new Error('github failed');
      },
      createNewGitHub: async () => {
        throw new Error('github new failed');
      },
      createFromSource: async () => {
        throw new Error('create from failed');
      },
      setActive: async () => {},
      getActiveId: async () => null,
      archive: async () => {},
      remove: async () => {},
    };

    setWorkspaceClient(failingClient);
    resetWorkspacesStore();

    expect(await useWorkspacesStore.getState().loadKnownRepos()).toEqual([]);
    expect(useWorkspacesStore.getState().knownRepos).toEqual([]);
    expect(useWorkspacesStore.getState().lastError).toBe('known repos failed');
    expect(useWorkspacesStore.getState().isLoadingKnownRepos).toBe(false);

    await expect(useWorkspacesStore.getState().listRepoBranches('org/repo')).rejects.toThrow(
      'branches failed',
    );
    expect(useWorkspacesStore.getState().lastError).toBe('branches failed');

    await expect(useWorkspacesStore.getState().listRepoPullRequests('org/repo')).rejects.toThrow(
      'pull requests failed',
    );
    expect(useWorkspacesStore.getState().lastError).toBe('pull requests failed');

    await expect(useWorkspacesStore.getState().listRepoIssues('org/repo')).rejects.toThrow(
      'issues failed',
    );
    expect(useWorkspacesStore.getState().lastError).toBe('issues failed');
  });

  test('handles non-Error throws and exposes current client', async () => {
    const nonErrorClient: WorkspaceClient = {
      list: async () => {
        throw 'boom';
      },
      listGitHubRepos: async () => {
        throw 'boom';
      },
      listKnownRepos: async () => {
        throw 'boom';
      },
      listRepoBranches: async () => {
        throw 'boom';
      },
      listRepoPullRequests: async () => {
        throw 'boom';
      },
      listRepoIssues: async () => {
        throw 'boom';
      },
      createLocal: async () => {
        throw 'boom';
      },
      createGitHub: async () => {
        throw 'boom';
      },
      createNewGitHub: async () => {
        throw 'boom';
      },
      createFromSource: async () => {
        throw 'boom';
      },
      setActive: async () => {
        throw 'boom';
      },
      getActiveId: async () => null,
      archive: async () => {
        throw 'boom';
      },
      remove: async () => {
        throw 'boom';
      },
    };

    setWorkspaceClient(nonErrorClient);
    expect(getWorkspaceClient()).toBe(nonErrorClient);
    resetWorkspacesStore();

    await useWorkspacesStore.getState().load();
    expect(useWorkspacesStore.getState().lastError).toBe('boom');
  });

  test('extracts message from object-shaped errors', async () => {
    const objectErrorClient: WorkspaceClient = {
      list: async () => {
        throw { message: 'object message' };
      },
      listGitHubRepos: async () => [],
      listKnownRepos: async () => [],
      listRepoBranches: async () => [],
      listRepoPullRequests: async () => [],
      listRepoIssues: async () => [],
      createLocal: async () => {
        throw { error: 'top level error field' };
      },
      createGitHub: async () => {
        throw { error: { message: 'nested error message' } };
      },
      createNewGitHub: async () => {
        throw { message: 'new repo object message' };
      },
      createFromSource: async () => {
        throw { message: 'create from object message' };
      },
      setActive: async () => {
        throw {};
      },
      getActiveId: async () => null,
      archive: async () => {
        throw '';
      },
      remove: async () => {
        throw null;
      },
    };

    setWorkspaceClient(objectErrorClient);
    resetWorkspacesStore();

    await useWorkspacesStore.getState().load();
    expect(useWorkspacesStore.getState().lastError).toBe('object message');

    await expect(
      useWorkspacesStore
        .getState()
        .createLocal({ repoPath: '/tmp/repo', workspaceName: 'KAT-154' }),
    ).rejects.toBeTruthy();
    expect(useWorkspacesStore.getState().lastError).toBe('top level error field');

    await expect(
      useWorkspacesStore
        .getState()
        .createGitHub({ repoUrl: 'https://github.com/org/repo', workspaceName: 'KAT-154' }),
    ).rejects.toBeTruthy();
    expect(useWorkspacesStore.getState().lastError).toBe('nested error message');

    await expect(
      useWorkspacesStore.getState().createNewGitHub({
        repositoryName: 'kat-154-created',
        workspaceName: 'KAT-154',
        cloneRootPath: '/tmp/repos',
      }),
    ).rejects.toBeTruthy();
    expect(useWorkspacesStore.getState().lastError).toBe('new repo object message');

    await useWorkspacesStore.getState().setActive('ws_missing');
    expect(useWorkspacesStore.getState().lastError).toBe('Unexpected error');
  });
});
