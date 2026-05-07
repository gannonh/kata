import { describe, expect, it } from "vitest";

import { LinearKataAdapter } from "../backends/linear/adapter.js";
import { formatLinearArtifactMarker } from "../backends/linear/artifacts.js";
import { createKataDomainApi } from "../domain/service.js";
import type { KataDomainError } from "../domain/errors.js";

type LinearAdapterInput = ConstructorParameters<typeof LinearKataAdapter>[0];
type LinearAdapterConfig = LinearAdapterInput["config"];
type CreateAdapterConfig = Omit<Partial<LinearAdapterConfig>, "states" | "labels"> & {
  states?: Partial<LinearAdapterConfig["states"]>;
  labels?: Record<string, string>;
};
interface FakeLinearIssue {
  id: string;
  identifier: string;
  number: number;
  title: string;
  description: string;
  url: string;
  state: { id: string; name: string; type: string };
  labels: { nodes: Array<{ name: string }> };
  project: ReturnType<typeof createFakeProject>;
  projectMilestone: ReturnType<typeof createFakeMilestone>;
  parent: FakeLinearIssue | null;
  children: { nodes: FakeLinearIssue[] };
  relations: { nodes: unknown[] };
  inverseRelations: { nodes: unknown[] };
}
interface FakeLinearLabel {
  id: string;
  name: string;
}
interface FakeLinearDocument {
  id: string;
  title: string;
  content: string;
  updatedAt?: string | null;
}
interface FakeLinearComment {
  id: string;
  issueId: string;
  body: string;
  updatedAt?: string | null;
}
type FakeLinearClientOptions = {
  organizationUrlKey?: string;
  milestones?: Array<{ id: string; name: string; description?: string | null; targetDate?: string | null }>;
  issues?: FakeLinearIssue[];
  states?: Array<{ id: string; name: string; type: string }>;
  labels?: FakeLinearLabel[];
  documents?: FakeLinearDocument[];
  comments?: FakeLinearComment[];
};

function createAdapter(
  client: LinearAdapterInput["client"] = createFakeLinearClient(),
  config: CreateAdapterConfig = {},
) {
  const { states, labels, ...restConfig } = config;
  return new LinearKataAdapter({
    client,
    workspacePath: "/workspace",
    config: {
      kind: "linear",
      workspace: "kata",
      team: "KATA",
      project: "kata-cli",
      ...restConfig,
      states: {
        backlog: "Backlog",
        todo: "Todo",
        in_progress: "In Progress",
        agent_review: "Agent Review",
        human_review: "Human Review",
        merging: "Merging",
        done: "Done",
        ...states,
      },
      labels: {
        ...labels,
      },
    },
  });
}

function createFakeLinearClient(options: FakeLinearClientOptions = {}): LinearAdapterInput["client"] {
  const states = options.states ?? [
    { id: "state-backlog", name: "Backlog", type: "backlog" },
    { id: "state-todo", name: "Todo", type: "unstarted" },
    { id: "state-progress", name: "In Progress", type: "started" },
    { id: "state-agent-review", name: "Agent Review", type: "started" },
    { id: "state-human-review", name: "Human Review", type: "started" },
    { id: "state-merging", name: "Merging", type: "started" },
    { id: "state-done", name: "Done", type: "completed" },
  ];
  const labels = options.labels ?? [
    { id: "label-slice", name: "kata/slice" },
    { id: "label-task", name: "kata/task" },
    { id: "label-issue", name: "kata/issue" },
  ];
  const documents = options.documents ?? [];
  const comments = options.comments ?? [];
  const project = createFakeProject();
  const milestone = createFakeMilestone();
  const slice = createFakeIssue({
    id: "issue-s1",
    identifier: "KATA-1",
    number: 1,
    title: "[S001] Foundation",
    description: "Foundation",
    state: { id: "state-progress", name: "In Progress", type: "started" },
    labels: ["kata/slice"],
    project,
    projectMilestone: milestone,
  });
  const task = createFakeIssue({
    id: "issue-t1",
    identifier: "KATA-2",
    number: 2,
    title: "[T001] Verify",
    description: "Verify",
    state: { id: "state-done", name: "Done", type: "completed" },
    labels: ["kata/task"],
    project,
    projectMilestone: milestone,
    parent: slice,
  });

  return {
    async graphql<T>(input: { query: string; variables?: any }): Promise<T> {
      if (input.query.includes("LinearKataContext")) {
        return {
          viewer: { id: "user-1" },
          organization: { id: "org-1", urlKey: options.organizationUrlKey ?? "kata" },
          teams: {
            nodes: [{ id: "team-1", key: "KATA", name: "Kata" }],
          },
          projects: {
            nodes: [
              {
                id: "project-1",
                name: "Kata CLI",
                slugId: "kata-cli",
                url: "https://linear.test/project/kata-cli",
              },
            ],
          },
          workflowStates: {
            nodes: states,
          },
          issueLabels: {
            nodes: labels,
          },
        } as T;
      }

      if (input.query.includes("LinearKataMilestones")) {
        return {
          project: {
            id: "project-1",
            name: "Kata CLI",
            projectMilestones: {
              nodes: options.milestones ?? [milestone],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        } as T;
      }

      if (input.query.includes("LinearKataIssues")) {
        return {
          issues: {
            nodes: options.issues ?? [slice, task],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        } as T;
      }

      if (input.query.includes("LinearKataIssueComments")) {
        return {
          issue: {
            comments: {
              nodes: comments.filter((comment) => comment.issueId === input.variables?.issueId),
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        } as T;
      }

      if (input.query.includes("LinearKataProjectDocuments")) {
        const connection = {
          nodes: documents,
          pageInfo: { hasNextPage: false, endCursor: null },
        };
        return {
          documents: connection,
          project: { documents: connection },
        } as T;
      }

      if (input.query.includes("LinearKataCommentCreate")) {
        const comment = {
          id: `comment-${comments.length + 1}`,
          issueId: input.variables.input.issueId,
          body: input.variables.input.body,
          updatedAt: "2026-05-06T12:00:00.000Z",
        };
        comments.push(comment);
        return {
          commentCreate: {
            success: true,
            comment,
          },
        } as T;
      }

      if (input.query.includes("LinearKataCommentUpdate")) {
        const comment = comments.find((candidate) => candidate.id === input.variables.id);
        if (!comment) throw new Error(`Missing comment ${input.variables.id}`);
        comment.body = input.variables.input.body;
        comment.updatedAt = "2026-05-06T12:00:00.000Z";
        return {
          commentUpdate: {
            success: true,
            comment,
          },
        } as T;
      }

      if (input.query.includes("LinearKataDocumentCreate")) {
        const document = {
          id: `document-${documents.length + 1}`,
          title: input.variables.input.title,
          content: input.variables.input.content,
          updatedAt: "2026-05-06T12:00:00.000Z",
        };
        documents.push(document);
        return {
          documentCreate: {
            success: true,
            document,
          },
        } as T;
      }

      if (input.query.includes("LinearKataDocumentUpdate")) {
        const document = documents.find((candidate) => candidate.id === input.variables.id);
        if (!document) throw new Error(`Missing document ${input.variables.id}`);
        document.title = input.variables.input.title;
        document.content = input.variables.input.content;
        document.updatedAt = "2026-05-06T12:00:00.000Z";
        return {
          documentUpdate: {
            success: true,
            document,
          },
        } as T;
      }

      throw new Error(`Unexpected Linear query: ${input.query}`);
    },
    async paginate<Node, Data>(input: {
      query: string;
      variables?: Record<string, unknown>;
      selectConnection: (data: Data) => { nodes?: Array<Node | null> | null };
    }): Promise<Node[]> {
      const data = await this.graphql<Data>({ query: input.query, variables: input.variables });
      return (input.selectConnection(data).nodes ?? []).filter((node): node is Node => node !== null);
    },
  };
}

function createFakeProject() {
  return {
    id: "project-1",
    name: "Kata CLI",
    slugId: "kata-cli",
    url: "https://linear.test/project/kata-cli",
  };
}

function createFakeMilestone() {
  return {
    id: "milestone-1",
    name: "M001 Launch",
    description: "Launch",
    targetDate: null,
  };
}

function createFakeIssue(input: {
  id: string;
  identifier: string;
  number: number;
  title: string;
  description: string;
  state: { id: string; name: string; type: string };
  labels?: string[];
  project?: ReturnType<typeof createFakeProject>;
  projectMilestone?: ReturnType<typeof createFakeMilestone>;
  parent?: FakeLinearIssue | null;
  relations?: unknown[];
  inverseRelations?: unknown[];
}): FakeLinearIssue {
  return {
    id: input.id,
    identifier: input.identifier,
    number: input.number,
    title: input.title,
    description: input.description,
    url: `https://linear.test/${input.identifier}`,
    state: input.state,
    labels: { nodes: (input.labels ?? []).map((name) => ({ name })) },
    project: input.project ?? createFakeProject(),
    projectMilestone: input.projectMilestone ?? createFakeMilestone(),
    parent: input.parent ?? null,
    children: { nodes: [] },
    relations: { nodes: input.relations ?? [] },
    inverseRelations: { nodes: input.inverseRelations ?? [] },
  };
}

function createMutationFakeLinearClient(options: {
  milestones?: Array<{ id: string; name: string; description?: string | null; targetDate?: string | null }>;
  labels?: FakeLinearLabel[];
  mutationResult?: Partial<{
    projectUpdate: unknown;
    projectMilestoneCreate: unknown;
    projectMilestoneUpdate: unknown;
    issueCreate: unknown;
    issueUpdate: unknown;
    issueRelationCreate: unknown;
  }>;
} = {}): { client: LinearAdapterInput["client"]; created: any[]; issueCreateInputs: any[] } {
  const states = [
    { id: "state-backlog", name: "Backlog", type: "backlog" },
    { id: "state-todo", name: "Todo", type: "unstarted" },
    { id: "state-progress", name: "In Progress", type: "started" },
    { id: "state-agent-review", name: "Agent Review", type: "started" },
    { id: "state-human-review", name: "Human Review", type: "started" },
    { id: "state-merging", name: "Merging", type: "started" },
    { id: "state-done", name: "Done", type: "completed" },
  ];
  const project = createFakeProject();
  const labels = options.labels ?? [
    { id: "label-slice", name: "kata/slice" },
    { id: "label-task", name: "kata/task" },
    { id: "label-issue", name: "kata/issue" },
  ];
  const created: any[] = [];
  const issueCreateInputs: any[] = [];
  const client: LinearAdapterInput["client"] = {
    async graphql<T>(request: { query: string; variables?: any }): Promise<T> {
      if (request.query.includes("LinearKataContext")) {
        return {
          viewer: { id: "user-1" },
          organization: { id: "org-1", urlKey: "kata" },
          teams: { nodes: [{ id: "team-1", key: "KATA", name: "Kata" }] },
          projects: { nodes: [project] },
          workflowStates: { nodes: states },
          issueLabels: { nodes: labels },
        } as T;
      }

      if (request.query.includes("LinearKataMilestones")) {
        return {
          project: {
            id: "project-1",
            name: "Kata CLI",
            projectMilestones: {
              nodes: options.milestones ?? [],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        } as T;
      }

      if (request.query.includes("LinearKataIssues")) {
        return {
          issues: {
            nodes: created.filter((record) => record.kind === "issue").map((record) => record.node),
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        } as T;
      }

      if (request.query.includes("LinearKataProjectUpdate")) {
        return { projectUpdate: options.mutationResult?.projectUpdate ?? { success: true, project } } as T;
      }

      if (request.query.includes("LinearKataProjectMilestoneCreate")) {
        if (options.mutationResult?.projectMilestoneCreate) {
          return { projectMilestoneCreate: options.mutationResult.projectMilestoneCreate } as T;
        }
        return {
          projectMilestoneCreate: {
            success: true,
            projectMilestone: {
              id: "milestone-1",
              name: request.variables.input.name,
              description: request.variables.input.description,
            },
          },
        } as T;
      }

      if (request.query.includes("LinearKataProjectMilestoneUpdate")) {
        return {
          projectMilestoneUpdate: options.mutationResult?.projectMilestoneUpdate ?? {
            success: true,
            projectMilestone: {
              id: request.variables.id,
              name: "M001 Phase A",
              description: request.variables.input.description,
            },
          },
        } as T;
      }

      if (request.query.includes("LinearKataIssueCreate")) {
        issueCreateInputs.push(request.variables.input);
        if (options.mutationResult?.issueCreate) {
          return { issueCreate: options.mutationResult.issueCreate } as T;
        }
        const input = request.variables.input;
        const parent = created.find((record) => record.kind === "issue" && record.node.id === input.parentId)?.node ?? null;
        const node = {
          id: `issue-${created.filter((record) => record.kind === "issue").length + 1}`,
          identifier: `KATA-${created.filter((record) => record.kind === "issue").length + 1}`,
          number: created.filter((record) => record.kind === "issue").length + 1,
          title: input.title,
          description: input.description,
          url: `https://linear.test/${created.length + 1}`,
          state: states.find((state) => state.id === input.stateId),
          project,
          projectMilestone: input.projectMilestoneId
            ? { id: input.projectMilestoneId, name: "M001 Phase A", description: "Build Linear" }
            : null,
          parent,
          children: { nodes: [] },
          labels: { nodes: [] },
          relations: { nodes: [] },
          inverseRelations: { nodes: [] },
        };
        created.push({ kind: "issue", node });
        return { issueCreate: { success: true, issue: node } } as T;
      }

      if (request.query.includes("LinearKataIssueUpdate")) {
        return { issueUpdate: options.mutationResult?.issueUpdate } as T;
      }

      if (request.query.includes("LinearKataIssueRelationCreate")) {
        created.push({ kind: "relation", input: request.variables.input });
        return {
          issueRelationCreate: options.mutationResult?.issueRelationCreate ?? { success: true },
        } as T;
      }

      throw new Error(`Unexpected Linear query: ${request.query}`);
    },
    async paginate<Node, Data>(input: {
      query: string;
      variables?: Record<string, unknown>;
      selectConnection: (data: Data) => { nodes?: Array<Node | null> | null };
    }): Promise<Node[]> {
      const data = await this.graphql<Data>({ query: input.query, variables: input.variables });
      return (input.selectConnection(data).nodes ?? []).filter((node): node is Node => node !== null);
    },
  };
  return { client, created, issueCreateInputs };
}

describe("LinearKataAdapter reads and discovery", () => {
  it("returns Linear project context", async () => {
    await expect(createAdapter().getProjectContext()).resolves.toEqual({
      backend: "linear",
      workspacePath: "/workspace",
      title: "Kata CLI",
      description: "Linear project kata-cli in workspace kata",
    });
  });

  it("lists and selects active milestones", async () => {
    const adapter = createAdapter();

    await expect(adapter.listMilestones()).resolves.toEqual([
      { id: "M001", title: "M001 Launch", goal: "Launch", status: "active", active: true },
    ]);
    await expect(adapter.getActiveMilestone()).resolves.toMatchObject({ id: "M001", active: true });
  });

  it("lists slices and tasks for a milestone", async () => {
    const adapter = createAdapter();

    await expect(adapter.listSlices({ milestoneId: "M001" })).resolves.toEqual([
      expect.objectContaining({
        id: "S001",
        milestoneId: "M001",
        title: "Foundation",
        status: "in_progress",
      }),
    ]);
    await expect(adapter.listTasks({ sliceId: "S001" })).resolves.toEqual([
      expect.objectContaining({
        id: "T001",
        sliceId: "S001",
        title: "Verify",
        status: "done",
        verificationState: "verified",
      }),
    ]);
  });

  it("builds a domain snapshot from Linear reads", async () => {
    const snapshot = await createKataDomainApi(createAdapter()).project.getSnapshot();

    expect(snapshot.context.backend).toBe("linear");
    expect(snapshot.activeMilestone).toMatchObject({ id: "M001" });
    expect(snapshot.slices).toEqual([
      expect.objectContaining({
        id: "S001",
        tasks: [
          expect.objectContaining({
            id: "T001",
            verificationState: "verified",
          }),
        ],
      }),
    ]);
  });

  it("decodes native blocking relation direction from relation endpoints", async () => {
    const project = createFakeProject();
    const milestone = createFakeMilestone();
    const blocker = createFakeIssue({
      id: "issue-s1",
      identifier: "KATA-1",
      number: 1,
      title: "[S001] Foundation",
      description: "Foundation",
      state: { id: "state-progress", name: "In Progress", type: "started" },
      labels: ["kata/slice"],
      project,
      projectMilestone: milestone,
    });
    const blocked = createFakeIssue({
      id: "issue-s2",
      identifier: "KATA-2",
      number: 2,
      title: "[S002] UI",
      description: "UI",
      state: { id: "state-progress", name: "In Progress", type: "started" },
      labels: ["kata/slice"],
      project,
      projectMilestone: milestone,
      inverseRelations: [
        {
          id: "relation-1",
          type: "blocks",
          issue: blocker,
          relatedIssue: { id: "issue-s2", identifier: "KATA-2", title: "[S002] UI" },
        },
      ],
    });

    const slices = await createAdapter(createFakeLinearClient({ issues: [blocker, blocked] })).listSlices({
      milestoneId: "M001",
    });

    expect(slices).toEqual([
      expect.objectContaining({ id: "S001", blockedBy: [], blocking: ["S002"] }),
      expect.objectContaining({ id: "S002", blockedBy: ["S001"], blocking: [] }),
    ]);
  });

  it("classifies issues with configured label names", async () => {
    const project = createFakeProject();
    const milestone = createFakeMilestone();
    const slice = createFakeIssue({
      id: "issue-s1",
      identifier: "KATA-1",
      number: 1,
      title: "[I001] Foundation",
      description: "Foundation",
      state: { id: "state-progress", name: "In Progress", type: "started" },
      labels: ["custom/slice"],
      project,
      projectMilestone: milestone,
    });
    const task = createFakeIssue({
      id: "issue-t1",
      identifier: "KATA-2",
      number: 2,
      title: "[S002] Verify",
      description: "Verify",
      state: { id: "state-done", name: "Done", type: "completed" },
      labels: ["custom/task"],
      project,
      projectMilestone: milestone,
      parent: slice,
    });
    const issue = createFakeIssue({
      id: "issue-i1",
      identifier: "KATA-3",
      number: 3,
      title: "[S003] Follow up",
      description: "Follow up",
      state: { id: "state-todo", name: "Todo", type: "unstarted" },
      labels: ["custom/issue"],
      project,
      projectMilestone: milestone,
    });
    const adapter = createAdapter(createFakeLinearClient({
      issues: [slice, task, issue],
      labels: [
        { id: "custom-slice-id", name: "custom/slice" },
        { id: "custom-task-id", name: "custom/task" },
        { id: "custom-issue-id", name: "custom/issue" },
      ],
    }), {
      labels: {
        slice: "custom/slice",
        task: "custom/task",
        issue: "custom/issue",
      },
    });

    await expect(adapter.listSlices({ milestoneId: "M001" })).resolves.toEqual([
      expect.objectContaining({ id: "I001" }),
    ]);
    await expect(adapter.listTasks({ sliceId: "I001" })).resolves.toEqual([
      expect.objectContaining({ id: "S002" }),
    ]);
    await expect(adapter.listOpenIssues()).resolves.toEqual([expect.objectContaining({ id: "S003" })]);
  });

  it("rejects duplicate discovered Kata ids", async () => {
    const milestones = [
      { id: "milestone-1", name: "M001 Launch", description: "Launch", targetDate: null },
      { id: "milestone-2", name: "M001 Duplicate", description: "Duplicate", targetDate: null },
    ];

    await expect(createAdapter(createFakeLinearClient({ milestones })).listMilestones()).rejects.toMatchObject({
      code: "INVALID_CONFIG",
    } satisfies Partial<KataDomainError>);
  });

  it("marks tasks verified from configured done state", async () => {
    const project = createFakeProject();
    const milestone = createFakeMilestone();
    const slice = createFakeIssue({
      id: "issue-s1",
      identifier: "KATA-1",
      number: 1,
      title: "[S001] Foundation",
      description: "Foundation",
      state: { id: "state-progress", name: "In Progress", type: "started" },
      labels: ["kata/slice"],
      project,
      projectMilestone: milestone,
    });
    const task = createFakeIssue({
      id: "issue-t1",
      identifier: "KATA-2",
      number: 2,
      title: "[T001] Verify",
      description: "Verify",
      state: { id: "state-complete", name: "Complete", type: "started" },
      labels: ["kata/task"],
      project,
      projectMilestone: milestone,
      parent: slice,
    });
    const client = createFakeLinearClient({
      states: [
        { id: "state-backlog", name: "Backlog", type: "backlog" },
        { id: "state-todo", name: "Todo", type: "unstarted" },
        { id: "state-progress", name: "In Progress", type: "started" },
        { id: "state-agent-review", name: "Agent Review", type: "started" },
        { id: "state-human-review", name: "Human Review", type: "started" },
        { id: "state-merging", name: "Merging", type: "started" },
        { id: "state-complete", name: "Complete", type: "started" },
      ],
      issues: [slice, task],
    });
    const adapter = createAdapter(client, {
      states: { done: "Complete" },
    });

    await expect(adapter.listTasks({ sliceId: "S001" })).resolves.toEqual([
      expect.objectContaining({ id: "T001", status: "done", verificationState: "verified" }),
    ]);
  });

  it("rejects mismatched Linear workspace url keys", async () => {
    await expect(createAdapter(createFakeLinearClient({ organizationUrlKey: "other" })).getProjectContext()).rejects.toMatchObject({
      code: "INVALID_CONFIG",
    } satisfies Partial<KataDomainError>);
  });

  it("accepts Linear workspace organization ids", async () => {
    await expect(createAdapter(createFakeLinearClient(), { workspace: "org-1" }).getProjectContext()).resolves.toMatchObject({
      backend: "linear",
      workspacePath: "/workspace",
      description: "Linear project kata-cli in workspace org-1",
    });
  });

  it("creates project, milestone, slice, task, standalone issue, and dependency records", async () => {
    const states = [
      { id: "state-backlog", name: "Backlog", type: "backlog" },
      { id: "state-todo", name: "Todo", type: "unstarted" },
      { id: "state-progress", name: "In Progress", type: "started" },
      { id: "state-agent-review", name: "Agent Review", type: "started" },
      { id: "state-human-review", name: "Human Review", type: "started" },
      { id: "state-merging", name: "Merging", type: "started" },
      { id: "state-done", name: "Done", type: "completed" },
    ];
    const project = createFakeProject();
    const created: any[] = [];
    const client: LinearAdapterInput["client"] = {
      async graphql<T>(request: { query: string; variables?: any }): Promise<T> {
        if (request.query.includes("LinearKataContext")) {
          return {
            viewer: { id: "user-1" },
            organization: { id: "org-1", urlKey: "kata" },
            teams: { nodes: [{ id: "team-1", key: "KATA", name: "Kata" }] },
            projects: { nodes: [project] },
            workflowStates: { nodes: states },
            issueLabels: {
              nodes: [
                { id: "label-slice", name: "kata/slice" },
                { id: "label-task", name: "kata/task" },
                { id: "label-issue", name: "kata/issue" },
              ],
            },
          } as T;
        }

        if (request.query.includes("LinearKataMilestones")) {
          return {
            project: {
              id: "project-1",
              name: "Kata CLI",
              projectMilestones: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
            },
          } as T;
        }

        if (request.query.includes("LinearKataIssues")) {
          return {
            issues: {
              nodes: created.filter((record) => record.kind === "issue").map((record) => record.node),
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          } as T;
        }

        if (request.query.includes("LinearKataProjectUpdate")) {
          project.name = request.variables.input.name;
          return { projectUpdate: { success: true, project } } as T;
        }

        if (request.query.includes("LinearKataProjectMilestoneCreate")) {
          return {
            projectMilestoneCreate: {
              success: true,
              projectMilestone: {
                id: "milestone-1",
                name: request.variables.input.name,
                description: request.variables.input.description,
              },
            },
          } as T;
        }

        if (request.query.includes("LinearKataProjectMilestoneUpdate")) {
          return {
            projectMilestoneUpdate: {
              success: true,
              projectMilestone: {
                id: request.variables.id,
                name: "M001 Phase A",
                description: request.variables.input.description,
              },
            },
          } as T;
        }

        if (request.query.includes("LinearKataIssueCreate")) {
          const input = request.variables.input;
          const parent = created.find((record) => record.kind === "issue" && record.node.id === input.parentId)?.node ?? null;
          const node = {
            id: `issue-${created.length + 1}`,
            identifier: `KATA-${created.length + 1}`,
            number: created.length + 1,
            title: input.title,
            description: input.description,
            url: `https://linear.test/KATA-${created.length + 1}`,
            state: states.find((state) => state.id === input.stateId),
            project,
            projectMilestone: input.projectMilestoneId
              ? { id: input.projectMilestoneId, name: "M001 Phase A", description: "Build Linear" }
              : null,
            parent,
            children: { nodes: [] },
            labels: { nodes: [] },
            relations: { nodes: [] },
            inverseRelations: { nodes: [] },
          };
          created.push({ kind: "issue", node });
          return { issueCreate: { success: true, issue: node } } as T;
        }

        if (request.query.includes("LinearKataIssueUpdate")) {
          const record = created.find((candidate) => candidate.kind === "issue" && candidate.node.id === request.variables.id);
          record.node = {
            ...record.node,
            ...request.variables.input,
            state: states.find((state) => state.id === request.variables.input.stateId) ?? record.node.state,
          };
          return { issueUpdate: { success: true, issue: record.node } } as T;
        }

        if (request.query.includes("LinearKataIssueRelationCreate")) {
          created.push({ kind: "relation", input: request.variables.input });
          return { issueRelationCreate: { success: true } } as T;
        }

        if (request.query.includes("LinearKataIssueComments")) {
          return { issue: { comments: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } as T;
        }

        if (request.query.includes("LinearKataProjectDocuments")) {
          return { documents: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } as T;
        }

        throw new Error(`Unexpected Linear query: ${request.query}`);
      },
      async paginate<Node, Data>(input: {
        query: string;
        variables?: Record<string, unknown>;
        selectConnection: (data: Data) => { nodes?: Array<Node | null> | null };
      }): Promise<Node[]> {
        const data = await this.graphql<Data>({ query: input.query, variables: input.variables });
        return (input.selectConnection(data).nodes ?? []).filter((node): node is Node => node !== null);
      },
    };
    const adapter = createAdapter(client);

    await expect(adapter.upsertProject({ title: "Kata CLI", description: "Updated" })).resolves.toMatchObject({
      backend: "linear",
      title: "Kata CLI",
      description: "Updated",
    });
    const milestone = await adapter.createMilestone({ title: "Phase A", goal: "Build Linear" });
    const foundation = await adapter.createSlice({ milestoneId: milestone.id, title: "Foundation", goal: "First" });
    const dependent = await adapter.createSlice({
      milestoneId: milestone.id,
      title: "Dependent",
      goal: "Second",
      blockedBy: [foundation.id],
    });
    const task = await adapter.createTask({ sliceId: foundation.id, title: "Verify", description: "Check it" });
    const issue = await adapter.createIssue({ title: "Standalone", design: "Design", plan: "Plan" });

    expect(milestone).toMatchObject({ id: "M001", status: "active" });
    expect(foundation).toMatchObject({ id: "S001", milestoneId: "M001" });
    expect(dependent).toMatchObject({ id: "S002", blockedBy: ["S001"] });
    expect(task).toMatchObject({ id: "T001", sliceId: "S001", verificationState: "pending" });
    expect(issue).toMatchObject({ id: "I001", status: "backlog" });

    const relation = created.find((record) => record.kind === "relation");
    const dependentLinearId = created.find((record) => record.kind === "issue" && record.node.title === "[S002] Dependent")
      ?.node.id;
    const foundationLinearId = created.find((record) => record.kind === "issue" && record.node.title === "[S001] Foundation")
      ?.node.id;
    expect(relation?.input).toEqual({
      issueId: foundationLinearId,
      relatedIssueId: dependentLinearId,
      type: "blocks",
    });

    const foundationNode = created.find((record) => record.kind === "issue" && record.node.id === foundationLinearId)?.node;
    const dependentNode = created.find((record) => record.kind === "issue" && record.node.id === dependentLinearId)?.node;
    const relationNode = {
      id: "relation-1",
      type: "blocks",
      issue: foundationNode,
      relatedIssue: dependentNode,
    };
    foundationNode.relations.nodes = [relationNode];
    dependentNode.inverseRelations.nodes = [relationNode];

    const rediscoveredSlices = await createAdapter(
      createFakeLinearClient({
        milestones: [{ id: "milestone-1", name: "M001 Phase A", description: "Build Linear", targetDate: null }],
        issues: [foundationNode, dependentNode],
      }),
    ).listSlices({ milestoneId: "M001" });
    expect(rediscoveredSlices).toEqual([
      expect.objectContaining({ id: "S001", blockedBy: [], blocking: ["S002"] }),
      expect.objectContaining({ id: "S002", blockedBy: ["S001"], blocking: [] }),
    ]);
  });

  it("sends configured Linear label ids when creating issues", async () => {
    const { client, issueCreateInputs } = createMutationFakeLinearClient({
      labels: [
        { id: "custom-slice-id", name: "custom/slice" },
        { id: "custom-task-id", name: "custom/task" },
        { id: "custom-issue-id", name: "custom/issue" },
      ],
    });
    const adapter = createAdapter(client, {
      labels: {
        slice: "custom/slice",
        task: "custom/task",
        issue: "custom/issue",
      },
    });

    const milestone = await adapter.createMilestone({ title: "Phase A", goal: "Build Linear" });
    const slice = await adapter.createSlice({ milestoneId: milestone.id, title: "Foundation", goal: "First" });
    await adapter.createTask({ sliceId: slice.id, title: "Verify", description: "Check it" });
    await adapter.createIssue({ title: "Standalone", design: "Design", plan: "Plan" });

    expect(issueCreateInputs.map((input) => input.labelIds)).toEqual([
      ["custom-slice-id"],
      ["custom-task-id"],
      ["custom-issue-id"],
    ]);
  });

  it("rejects malformed mutation payloads before updating local state", async () => {
    const failedProject = createMutationFakeLinearClient({
      mutationResult: {
        projectUpdate: { success: false, project: { id: "project-1", name: "Renamed" } },
      },
    });
    const projectAdapter = createAdapter(failedProject.client);

    await expect(projectAdapter.upsertProject({ title: "Renamed", description: "Updated" })).rejects.toMatchObject({
      code: "UNKNOWN",
    } satisfies Partial<KataDomainError>);
    await expect(projectAdapter.getProjectContext()).resolves.toMatchObject({ title: "Kata CLI" });

    const missingMilestone = createMutationFakeLinearClient({
      mutationResult: {
        projectMilestoneCreate: { success: true, projectMilestone: { id: "", name: "M001 Phase A" } },
      },
    });
    const milestoneAdapter = createAdapter(missingMilestone.client);

    await expect(milestoneAdapter.createMilestone({ title: "Phase A", goal: "Build Linear" })).rejects.toMatchObject({
      code: "UNKNOWN",
    } satisfies Partial<KataDomainError>);
    await expect(milestoneAdapter.listMilestones()).resolves.toEqual([]);
  });

  it("rejects failed dependency relation creation without adding dependency state", async () => {
    const { client } = createMutationFakeLinearClient({
      mutationResult: {
        issueRelationCreate: { success: false },
      },
    });
    const adapter = createAdapter(client);

    const milestone = await adapter.createMilestone({ title: "Phase A", goal: "Build Linear" });
    const foundation = await adapter.createSlice({ milestoneId: milestone.id, title: "Foundation", goal: "First" });
    await expect(
      adapter.createSlice({
        milestoneId: milestone.id,
        title: "Dependent",
        goal: "Second",
        blockedBy: [foundation.id],
      }),
    ).rejects.toMatchObject({
      code: "UNKNOWN",
    } satisfies Partial<KataDomainError>);

    await expect(adapter.listSlices({ milestoneId: milestone.id })).resolves.toEqual([
      expect.objectContaining({ id: "S001", blockedBy: [], blocking: [] }),
      expect.objectContaining({ id: "S002", blockedBy: [], blocking: [] }),
    ]);
  });

  it("updates slice, task, issue, and milestone statuses", async () => {
    const project = createFakeProject();
    const milestone = createFakeMilestone();
    const slice = createFakeIssue({
      id: "issue-s1",
      identifier: "KATA-1",
      number: 1,
      title: "[S001] Foundation",
      description: "Foundation",
      state: { id: "state-progress", name: "In Progress", type: "started" },
      labels: ["kata/slice"],
      project,
      projectMilestone: milestone,
    });
    const task = createFakeIssue({
      id: "issue-t1",
      identifier: "KATA-2",
      number: 2,
      title: "[T001] Verify",
      description: "Verify",
      state: { id: "state-todo", name: "Todo", type: "unstarted" },
      labels: ["kata/task"],
      project,
      projectMilestone: milestone,
      parent: slice,
    });
    const issue = createFakeIssue({
      id: "issue-i1",
      identifier: "KATA-3",
      number: 3,
      title: "[I001] Standalone",
      description: "Standalone",
      state: { id: "state-backlog", name: "Backlog", type: "backlog" },
      labels: ["kata/issue"],
      project,
      projectMilestone: milestone,
    });
    const issues = [slice, task, issue];
    const client = createFakeLinearClient({ issues });
    const originalGraphql = client.graphql.bind(client);
    client.graphql = async <T>(request: { query: string; variables?: any }): Promise<T> => {
      if (request.query.includes("LinearKataIssueUpdate")) {
        const node = issues.find((candidate) => candidate.id === request.variables.id);
        if (!node) throw new Error(`Missing issue ${request.variables.id}`);
        const state = request.variables.input.stateId === "state-done"
          ? { id: "state-done", name: "Done", type: "completed" }
          : node.state;
        Object.assign(node, { state });
        return { issueUpdate: { success: true, issue: node } } as T;
      }

      if (request.query.includes("LinearKataProjectMilestoneUpdate")) {
        return {
          projectMilestoneUpdate: {
            success: true,
            projectMilestone: {
              id: request.variables.id,
              name: milestone.name,
              description: request.variables.input.description,
            },
          },
        } as T;
      }

      return originalGraphql<T>(request);
    };
    const adapter = createAdapter(client);

    await expect(adapter.updateSliceStatus({ sliceId: "S001", status: "done" })).resolves.toMatchObject({
      id: "S001",
      status: "done",
    });
    await expect(
      adapter.updateTaskStatus({ taskId: "T001", status: "done", verificationState: "verified" }),
    ).resolves.toMatchObject({
      id: "T001",
      status: "done",
      verificationState: "verified",
    });
    await expect(adapter.updateIssueStatus({ issueId: "I001", status: "done" })).resolves.toMatchObject({
      id: "I001",
      status: "done",
    });
    await expect(adapter.completeMilestone({ milestoneId: "M001", summary: "Complete" })).resolves.toMatchObject({
      id: "M001",
      status: "done",
      active: false,
    });
  });
});

describe("LinearKataAdapter artifacts", () => {
  it("writes and lists project artifacts as Linear documents", async () => {
    const client = createFakeLinearClient();
    const adapter = createAdapter(client);

    const artifact = await adapter.writeArtifact({
      scopeType: "project",
      scopeId: "PROJECT",
      artifactType: "project-brief",
      title: "PROJECT",
      content: "# Project",
      format: "markdown",
    });

    expect(artifact).toMatchObject({
      scopeType: "project",
      scopeId: "PROJECT",
      artifactType: "project-brief",
      title: "PROJECT",
      content: "# Project",
      provenance: {
        backend: "linear",
        backendId: "document:document-1",
      },
    });
  });

  it("writes milestone artifacts as Linear documents", async () => {
    const client = createFakeLinearClient();
    const adapter = createAdapter(client);

    const artifact = await adapter.writeArtifact({
      scopeType: "milestone",
      scopeId: "M001",
      artifactType: "requirements",
      title: "M001 Requirements",
      content: "# Requirements",
      format: "markdown",
    });

    expect(artifact).toMatchObject({
      scopeType: "milestone",
      scopeId: "M001",
      artifactType: "requirements",
      title: "M001 Requirements",
      content: "# Requirements",
      format: "markdown",
      provenance: {
        backend: "linear",
        backendId: "document:document-1",
      },
    });
  });

  it("writes slice, task, and standalone issue artifacts as Linear comments", async () => {
    const project = createFakeProject();
    const milestone = createFakeMilestone();
    const slice = createFakeIssue({
      id: "issue-s1",
      identifier: "KATA-1",
      number: 1,
      title: "[S001] Foundation",
      description: "Foundation",
      state: { id: "state-progress", name: "In Progress", type: "started" },
      labels: ["kata/slice"],
      project,
      projectMilestone: milestone,
    });
    const task = createFakeIssue({
      id: "issue-t1",
      identifier: "KATA-2",
      number: 2,
      title: "[T001] Verify",
      description: "Verify",
      state: { id: "state-todo", name: "Todo", type: "unstarted" },
      labels: ["kata/task"],
      project,
      projectMilestone: milestone,
      parent: slice,
    });
    const issue = createFakeIssue({
      id: "issue-i1",
      identifier: "KATA-3",
      number: 3,
      title: "[I001] Standalone",
      description: "Standalone",
      state: { id: "state-backlog", name: "Backlog", type: "backlog" },
      labels: ["kata/issue"],
      project,
      projectMilestone: milestone,
    });
    const client = createFakeLinearClient({ issues: [slice, task, issue] });
    const adapter = createAdapter(client);

    await expect(
      adapter.writeArtifact({
        scopeType: "slice",
        scopeId: "S001",
        artifactType: "plan",
        title: "Slice plan",
        content: "# Plan",
        format: "markdown",
      }),
    ).resolves.toMatchObject({
      scopeType: "slice",
      scopeId: "S001",
      artifactType: "plan",
      title: "Slice plan",
      content: "# Plan",
      format: "markdown",
      provenance: {
        backend: "linear",
        backendId: "comment:comment-1",
      },
    });
    await expect(
      adapter.writeArtifact({
        scopeType: "task",
        scopeId: "T001",
        artifactType: "verification",
        title: "Verification",
        content: "Verified",
        format: "markdown",
      }),
    ).resolves.toMatchObject({
      scopeType: "task",
      scopeId: "T001",
      artifactType: "verification",
      content: "Verified",
    });
    await expect(
      adapter.writeArtifact({
        scopeType: "issue",
        scopeId: "I001",
        artifactType: "plan",
        title: "Issue plan",
        content: "# Issue plan",
        format: "markdown",
      }),
    ).resolves.toMatchObject({
      scopeType: "issue",
      scopeId: "I001",
      artifactType: "plan",
      content: "# Issue plan",
    });
  });

  it("lists milestone artifacts from plain Linear project documents by title", async () => {
    const client = createFakeLinearClient({
      documents: [
        {
          id: "document-1",
          title: "M001 Requirements",
          content: "# Requirements",
          updatedAt: "2026-05-06T12:00:00.000Z",
        },
        {
          id: "document-2",
          title: "M002 Plan",
          content: formatLinearArtifactMarker({
            scopeType: "milestone",
            scopeId: "M002",
            artifactType: "plan",
            content: "# Other",
          }),
          updatedAt: "2026-05-06T13:00:00.000Z",
        },
      ],
    });
    const adapter = createAdapter(client);

    await expect(adapter.listArtifacts({ scopeType: "milestone", scopeId: "M001" })).resolves.toEqual([
      expect.objectContaining({
        id: "milestone:M001:requirements",
        scopeType: "milestone",
        scopeId: "M001",
        artifactType: "requirements",
        title: "M001 Requirements",
        content: "# Requirements",
        format: "markdown",
        updatedAt: "2026-05-06T12:00:00.000Z",
        provenance: {
          backend: "linear",
          backendId: "document:document-1",
        },
      }),
    ]);
  });

  it("lists project artifacts from plain Linear project documents by title", async () => {
    const client = createFakeLinearClient({
      documents: [
        {
          id: "document-1",
          title: "PROJECT",
          content: "# Project brief",
          updatedAt: "2026-05-06T12:00:00.000Z",
        },
      ],
    });
    const adapter = createAdapter(client);

    await expect(adapter.listArtifacts({ scopeType: "project", scopeId: "PROJECT" })).resolves.toEqual([
      expect.objectContaining({
        id: "project:PROJECT:project-brief",
        scopeType: "project",
        scopeId: "PROJECT",
        artifactType: "project-brief",
        title: "PROJECT",
        content: "# Project brief",
      }),
    ]);
  });

  it("lists issue-backed artifacts from marked Linear issue comments and reads by type", async () => {
    const client = createFakeLinearClient({
      comments: [
        {
          id: "comment-1",
          issueId: "issue-s1",
          body: formatLinearArtifactMarker({
            scopeType: "slice",
            scopeId: "S001",
            artifactType: "plan",
            content: "# Plan",
          }),
          updatedAt: "2026-05-06T12:00:00.000Z",
        },
        {
          id: "comment-2",
          issueId: "issue-s1",
          body: '<!-- kata:artifact {"scopeType":"task","scopeId":"T001","artifactType":"verification"} -->\nVerified',
          updatedAt: "2026-05-06T13:00:00.000Z",
        },
      ],
    });
    const adapter = createAdapter(client);

    await expect(adapter.listArtifacts({ scopeType: "slice", scopeId: "S001" })).resolves.toEqual([
      expect.objectContaining({
        id: "slice:S001:plan",
        scopeType: "slice",
        scopeId: "S001",
        artifactType: "plan",
        title: "plan",
        content: "# Plan",
        format: "markdown",
        updatedAt: "2026-05-06T12:00:00.000Z",
        provenance: {
          backend: "linear",
          backendId: "comment:comment-1",
        },
      }),
    ]);
    await expect(
      adapter.readArtifact({ scopeType: "slice", scopeId: "S001", artifactType: "plan" }),
    ).resolves.toMatchObject({
      scopeType: "slice",
      scopeId: "S001",
      artifactType: "plan",
      content: "# Plan",
    });
    await expect(
      adapter.readArtifact({ scopeType: "slice", scopeId: "S001", artifactType: "summary" }),
    ).resolves.toBeNull();
  });

  it("does not write artifacts when the scope type does not match the tracked entity", async () => {
    const adapter = createAdapter();

    await expect(adapter.listArtifacts({ scopeType: "task", scopeId: "S001" })).resolves.toEqual([]);
    await expect(
      adapter.writeArtifact({
        scopeType: "task",
        scopeId: "S001",
        artifactType: "verification",
        title: "Verification",
        content: "Verified",
        format: "markdown",
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("LinearKataAdapter snapshots and dependencies", () => {
  it("exposes dependency-gated next actions from Linear native relations and roadmap documents", async () => {
    const client = createFakeLinearClient();
    const adapter = createAdapter(client);
    const api = createKataDomainApi(adapter);

    const snapshot = await api.project.getSnapshot();

    expect(snapshot.nextAction.workflow).toBe("kata-execute-phase");
    expect(snapshot.slices.find((slice) => slice.id === "S001")).toMatchObject({
      blockedBy: [],
      tasks: [expect.objectContaining({ id: "T001" })],
    });
  });
});
