import { create } from 'zustand';

import { workspaceClient as defaultWorkspaceClient } from '../services/workspaces';
import type {
  CreateWorkspaceFromSourceInput,
  CreateGitHubWorkspaceInput,
  CreateLocalWorkspaceInput,
  CreateNewGitHubWorkspaceInput,
  WorkspaceBranchOption,
  WorkspaceClient,
  WorkspaceIssueOption,
  WorkspaceKnownRepoOption,
  WorkspacePullRequestOption,
} from '../services/workspaces/types';
import type { Workspace } from '../types/workspace';

interface WorkspacesState {
  workspaces: Workspace[];
  knownRepos: WorkspaceKnownRepoOption[];
  activeWorkspaceId: string | null;
  isCreating: boolean;
  isLoadingKnownRepos: boolean;
  lastError: string | null;
  load: () => Promise<void>;
  loadKnownRepos: (query?: string) => Promise<WorkspaceKnownRepoOption[]>;
  listRepoBranches: (repoId: string, query?: string) => Promise<WorkspaceBranchOption[]>;
  listRepoPullRequests: (
    repoId: string,
    query?: string,
  ) => Promise<WorkspacePullRequestOption[]>;
  listRepoIssues: (repoId: string, query?: string) => Promise<WorkspaceIssueOption[]>;
  quickCreateFromRepo: (repoId: string, workspaceName?: string) => Promise<Workspace>;
  createFromSource: (input: CreateWorkspaceFromSourceInput) => Promise<Workspace>;
  createLocal: (input: CreateLocalWorkspaceInput) => Promise<Workspace>;
  createGitHub: (input: CreateGitHubWorkspaceInput) => Promise<Workspace>;
  createNewGitHub: (input: CreateNewGitHubWorkspaceInput) => Promise<Workspace>;
  setActive: (id: string) => Promise<void>;
  archive: (id: string) => Promise<void>;
  remove: (id: string, removeFiles: boolean) => Promise<void>;
}

const defaultState = {
  workspaces: [] as Workspace[],
  knownRepos: [] as WorkspaceKnownRepoOption[],
  activeWorkspaceId: null as string | null,
  isCreating: false,
  isLoadingKnownRepos: false,
  lastError: null as string | null,
};

let workspaceClient: WorkspaceClient = defaultWorkspaceClient;

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error && typeof error === 'object') {
    const message = Reflect.get(error, 'message');
    if (typeof message === 'string' && message.trim()) {
      return message;
    }

    const nestedError = Reflect.get(error, 'error');
    if (typeof nestedError === 'string' && nestedError.trim()) {
      return nestedError;
    }
    if (nestedError && typeof nestedError === 'object') {
      const nestedMessage = Reflect.get(nestedError, 'message');
      if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
        return nestedMessage;
      }
    }
  }

  return 'Unexpected error';
}

export const useWorkspacesStore = create<WorkspacesState>()((set) => {
  async function runCreate(clientCall: () => Promise<Workspace>): Promise<Workspace> {
    set({ isCreating: true, lastError: null });
    try {
      const workspace = await clientCall();
      set((state) => ({
        workspaces: [...state.workspaces, workspace],
        activeWorkspaceId: workspace.id,
      }));
      return workspace;
    } catch (error) {
      set({ lastError: toErrorMessage(error) });
      throw error;
    } finally {
      set({ isCreating: false });
    }
  }

  async function runQuery<T>(clientCall: () => Promise<T>): Promise<T> {
    try {
      return await clientCall();
    } catch (error) {
      set({ lastError: toErrorMessage(error) });
      throw error;
    }
  }

  return {
    ...defaultState,

    load: async () => {
      try {
        const [workspaces, activeWorkspaceId] = await Promise.all([
          workspaceClient.list(),
          workspaceClient.getActiveId(),
        ]);
        set({ workspaces, activeWorkspaceId, lastError: null });
      } catch (error) {
        set({ lastError: toErrorMessage(error) });
      }
    },
    loadKnownRepos: async (query?: string) => {
      set({ isLoadingKnownRepos: true });
      try {
        const knownRepos = await workspaceClient.listKnownRepos(query);
        set({ knownRepos, lastError: null });
        return knownRepos;
      } catch (error) {
        set({ knownRepos: [], lastError: toErrorMessage(error) });
        return [];
      } finally {
        set({ isLoadingKnownRepos: false });
      }
    },
    listRepoBranches: (repoId, query) =>
      runQuery(() => workspaceClient.listRepoBranches(repoId, query)),
    listRepoPullRequests: (repoId, query) =>
      runQuery(() => workspaceClient.listRepoPullRequests(repoId, query)),
    listRepoIssues: (repoId, query) =>
      runQuery(() => workspaceClient.listRepoIssues(repoId, query)),
    quickCreateFromRepo: (repoId, workspaceName) =>
      runCreate(() =>
        workspaceClient.createFromSource({
          repoId,
          workspaceName,
          source: { type: 'default' },
        }),
      ),
    createFromSource: (input) => runCreate(() => workspaceClient.createFromSource(input)),

    createLocal: (input) => runCreate(() => workspaceClient.createLocal(input)),
    createGitHub: (input) => runCreate(() => workspaceClient.createGitHub(input)),
    createNewGitHub: (input) => runCreate(() => workspaceClient.createNewGitHub(input)),

    setActive: async (id) => {
      try {
        await workspaceClient.setActive(id);
        set({ activeWorkspaceId: id, lastError: null });
      } catch (error) {
        set({ lastError: toErrorMessage(error) });
      }
    },

    archive: async (id) => {
      try {
        await workspaceClient.archive(id);
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === id
              ? { ...workspace, status: 'archived', updatedAt: new Date().toISOString() }
              : workspace,
          ),
          activeWorkspaceId: state.activeWorkspaceId === id ? null : state.activeWorkspaceId,
          lastError: null,
        }));
      } catch (error) {
        set({ lastError: toErrorMessage(error) });
      }
    },

    remove: async (id, removeFiles) => {
      try {
        await workspaceClient.remove(id, removeFiles);
        set((state) => ({
          workspaces: state.workspaces.filter((workspace) => workspace.id !== id),
          activeWorkspaceId: state.activeWorkspaceId === id ? null : state.activeWorkspaceId,
          lastError: null,
        }));
      } catch (error) {
        set({ lastError: toErrorMessage(error) });
      }
    },
  };
});

export function setWorkspaceClient(client: WorkspaceClient): void {
  workspaceClient = client;
}

export function getWorkspaceClient(): WorkspaceClient {
  return workspaceClient;
}

export function resetWorkspacesStore(): void {
  useWorkspacesStore.setState(defaultState);
}
