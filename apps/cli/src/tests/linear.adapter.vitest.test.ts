import { describe, expect, it } from "vitest";

import { LinearKataAdapter } from "../backends/linear/adapter.js";
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
type FakeLinearClientOptions = {
  organizationUrlKey?: string;
  milestones?: Array<{ id: string; name: string; description?: string | null; targetDate?: string | null }>;
  issues?: FakeLinearIssue[];
  states?: Array<{ id: string; name: string; type: string }>;
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
    async graphql<T>(input: { query: string }): Promise<T> {
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
        } as T;
      }

      if (input.query.includes("LinearKataMilestones")) {
        return {
          project: {
            id: "project-1",
            name: "Kata CLI",
            milestones: {
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
              nodes: [],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        } as T;
      }

      if (input.query.includes("LinearKataProjectDocuments")) {
        return {
          documents: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        } as T;
      }

      throw new Error(`Unexpected Linear query: ${input.query}`);
    },
    async paginate<Node, Data>(input: {
      query: string;
      selectConnection: (data: Data) => { nodes?: Array<Node | null> | null };
    }): Promise<Node[]> {
      const data = await this.graphql<Data>({ query: input.query });
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
    const adapter = createAdapter(createFakeLinearClient({ issues: [slice, task, issue] }), {
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
});
