import { describe, expect, it, vi } from "vitest";

import { LinearKataAdapter } from "../backends/linear/adapter.js";
import { formatLinearArtifactMarker } from "../backends/linear/artifacts.js";
import { createKataDomainApi } from "../domain/service.js";

const workflowStates = [
  { id: "state-backlog", name: "Backlog", type: "backlog" },
  { id: "state-todo", name: "Todo", type: "unstarted" },
  { id: "state-progress", name: "In Progress", type: "started" },
  { id: "state-agent", name: "Agent Review", type: "started" },
  { id: "state-human", name: "Human Review", type: "started" },
  { id: "state-merging", name: "Merging", type: "started" },
  { id: "state-done", name: "Done", type: "completed" },
];

function createFakeLinearClient(input: { empty?: boolean } = {}) {
  const project = { id: "project-1", name: "Kata CLI", slugId: "kata-cli", url: "https://linear.test/project/kata-cli" };
  const team = { id: "team-1", key: "KATA", name: "Kata" };
  const milestones: any[] = input.empty ? [] : [
    { id: "milestone-1", name: "M001 Launch", description: '<!-- kata:entity {"kataId":"M001","type":"Milestone"} -->\nLaunch', targetDate: null },
  ];
  const issues: any[] = input.empty ? [] : [
    {
      id: "issue-s1",
      identifier: "KATA-1",
      number: 1,
      title: "[S001] Foundation",
      description: '<!-- kata:entity {"kataId":"S001","type":"Slice","parentId":"M001","status":"in_progress"} -->\nFoundation',
      url: "https://linear.test/KATA-1",
      state: workflowStates[2],
      project,
      projectMilestone: milestones[0],
      parent: null,
      children: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      relations: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      inverseRelations: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    },
    {
      id: "issue-t1",
      identifier: "KATA-2",
      number: 2,
      title: "[T001] Verify",
      description: '<!-- kata:entity {"kataId":"T001","type":"Task","parentId":"S001","status":"done","verificationState":"verified"} -->\nVerify',
      url: "https://linear.test/KATA-2",
      state: workflowStates[6],
      project,
      projectMilestone: milestones[0],
      parent: { id: "issue-s1", identifier: "KATA-1" },
      children: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      relations: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      inverseRelations: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    },
  ];
  const documents: any[] = [];
  const commentsByIssue = new Map<string, any[]>();
  const relations: any[] = [];

  const stateById = new Map(workflowStates.map((state) => [state.id, state]));
  const client = {
    graphql: vi.fn(async (request: any) => {
      if (request.query.includes("LinearKataContext")) {
        return {
          viewer: { id: "user-1" },
          organization: { id: "org-1", urlKey: "kata" },
          teams: { nodes: [team], pageInfo: { hasNextPage: false, endCursor: null } },
          projects: { nodes: [project], pageInfo: { hasNextPage: false, endCursor: null } },
          workflowStates: { nodes: workflowStates, pageInfo: { hasNextPage: false, endCursor: null } },
        };
      }
      if (request.query.includes("LinearKataMilestones")) {
        return { project: { id: project.id, name: project.name, milestones: { nodes: milestones, pageInfo: { hasNextPage: false, endCursor: null } } } };
      }
      if (request.query.includes("LinearKataIssues")) {
        return { issues: { nodes: issues, pageInfo: { hasNextPage: false, endCursor: null } } };
      }
      if (request.query.includes("LinearKataProjectDocuments")) {
        return { project: { documents: { nodes: documents, pageInfo: { hasNextPage: false, endCursor: null } } } };
      }
      if (request.query.includes("LinearKataIssueComments")) {
        return { issue: { comments: { nodes: commentsByIssue.get(request.variables.issueId) ?? [], pageInfo: { hasNextPage: false, endCursor: null } } } };
      }
      if (request.query.includes("projectMilestoneCreate")) {
        const node = { id: `milestone-${milestones.length + 1}`, name: request.variables.input.name, description: request.variables.input.description };
        milestones.push(node);
        return { projectMilestoneCreate: { success: true, projectMilestone: node } };
      }
      if (request.query.includes("projectMilestoneUpdate")) {
        const node = milestones.find((milestone) => milestone.id === request.variables.id) ?? milestones[0];
        Object.assign(node, request.variables.input);
        return { projectMilestoneUpdate: { success: true, projectMilestone: node } };
      }
      if (request.query.includes("issueCreate")) {
        const number = issues.length + 1;
        const milestone = milestones.find((candidate) => candidate.id === request.variables.input.projectMilestoneId) ?? null;
        const node = {
          id: `issue-${number}`,
          identifier: `KATA-${number}`,
          number,
          title: request.variables.input.title,
          description: request.variables.input.description,
          url: `https://linear.test/KATA-${number}`,
          state: stateById.get(request.variables.input.stateId) ?? workflowStates[0],
          project,
          projectMilestone: milestone,
          parent: request.variables.input.parentId ? { id: request.variables.input.parentId, identifier: "KATA-1" } : null,
          children: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
          relations: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
          inverseRelations: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        };
        issues.push(node);
        return { issueCreate: { success: true, issue: node } };
      }
      if (request.query.includes("issueUpdate")) {
        const node = issues.find((issue) => issue.id === request.variables.id);
        Object.assign(node, request.variables.input, { state: stateById.get(request.variables.input.stateId) ?? node.state });
        return { issueUpdate: { success: true, issue: node } };
      }
      if (request.query.includes("issueRelationCreate")) {
        relations.push(request.variables.input);
        return { issueRelationCreate: { success: true, issueRelation: { id: `relation-${relations.length}` } } };
      }
      if (request.query.includes("documentCreate")) {
        const document = { id: `doc-${documents.length + 1}`, title: request.variables.input.title, content: request.variables.input.content, updatedAt: "2026-05-06T00:00:00.000Z" };
        documents.push(document);
        return { documentCreate: { success: true, document } };
      }
      if (request.query.includes("documentUpdate")) {
        const document = documents.find((candidate) => candidate.id === request.variables.id);
        Object.assign(document, request.variables.input);
        return { documentUpdate: { success: true, document } };
      }
      if (request.query.includes("commentCreate")) {
        const comments = commentsByIssue.get(request.variables.input.issueId) ?? [];
        const comment = { id: `comment-${comments.length + 1}`, body: request.variables.input.body, updatedAt: "2026-05-06T00:00:00.000Z" };
        comments.push(comment);
        commentsByIssue.set(request.variables.input.issueId, comments);
        return { commentCreate: { success: true, comment } };
      }
      if (request.query.includes("commentUpdate")) {
        for (const comments of commentsByIssue.values()) {
          const comment = comments.find((candidate) => candidate.id === request.variables.id);
          if (comment) {
            Object.assign(comment, request.variables.input);
            return { commentUpdate: { success: true, comment } };
          }
        }
      }
      throw new Error(`Unhandled fake Linear query: ${request.query}`);
    }),
    paginate: vi.fn(async (pageInput: any) => {
      const data = await client.graphql({ query: pageInput.query, variables: pageInput.variables });
      return pageInput.selectConnection(data)?.nodes ?? [];
    }),
    relations,
    documents,
    commentsByIssue,
  };
  return client;
}

function createAdapter(client = createFakeLinearClient()) {
  return new LinearKataAdapter({
    client: client as any,
    workspacePath: "/workspace",
    config: {
      kind: "linear",
      workspace: "kata",
      team: "KATA",
      project: "kata-cli",
      states: {
        backlog: "Backlog",
        todo: "Todo",
        in_progress: "In Progress",
        agent_review: "Agent Review",
        human_review: "Human Review",
        merging: "Merging",
        done: "Done",
      },
      labels: {},
    },
  });
}

describe("LinearKataAdapter", () => {
  it("reads project, milestone, slices, tasks, and snapshots", async () => {
    const adapter = createAdapter();

    await expect(adapter.getProjectContext()).resolves.toMatchObject({ backend: "linear", workspacePath: "/workspace", title: "Kata CLI" });
    await expect(adapter.getActiveMilestone()).resolves.toMatchObject({ id: "M001", active: true });
    await expect(adapter.listSlices({ milestoneId: "M001" })).resolves.toEqual([
      expect.objectContaining({ id: "S001", milestoneId: "M001", title: "Foundation", status: "in_progress" }),
    ]);
    await expect(adapter.listTasks({ sliceId: "S001" })).resolves.toEqual([
      expect.objectContaining({ id: "T001", sliceId: "S001", title: "Verify", status: "done", verificationState: "verified" }),
    ]);

    await expect(createKataDomainApi(adapter).project.getSnapshot()).resolves.toMatchObject({
      context: { backend: "linear" },
      activeMilestone: { id: "M001" },
      slices: [{ id: "S001", tasks: [{ id: "T001", verificationState: "verified" }] }],
      nextAction: { workflow: "kata-execute-phase" },
    });
  });

  it("creates and updates Linear records with native dependencies", async () => {
    const client = createFakeLinearClient({ empty: true });
    const adapter = createAdapter(client);

    const milestone = await adapter.createMilestone({ title: "Phase A", goal: "Build Linear" });
    const foundation = await adapter.createSlice({ milestoneId: milestone.id, title: "Foundation", goal: "First" });
    const dependent = await adapter.createSlice({ milestoneId: milestone.id, title: "Dependent", goal: "Second", blockedBy: [foundation.id] });
    const task = await adapter.createTask({ sliceId: foundation.id, title: "Verify", description: "Check it" });
    const issue = await adapter.createIssue({ title: "Standalone", design: "Design", plan: "Plan" });

    expect(milestone).toMatchObject({ id: "M001", status: "active" });
    expect(foundation).toMatchObject({ id: "S001", milestoneId: "M001" });
    expect(dependent).toMatchObject({ id: "S002", blockedBy: ["S001"] });
    expect(task).toMatchObject({ id: "T001", sliceId: "S001", verificationState: "pending" });
    expect(issue).toMatchObject({ id: "I001", status: "backlog" });
    expect(client.relations[0]).toMatchObject({ issueId: "issue-2", relatedIssueId: "issue-1", type: "blocks" });

    await expect(adapter.updateSliceStatus({ sliceId: "S001", status: "done" })).resolves.toMatchObject({ id: "S001", status: "done" });
    await expect(adapter.updateTaskStatus({ taskId: "T001", status: "done", verificationState: "verified" })).resolves.toMatchObject({ id: "T001", status: "done", verificationState: "verified" });
    await expect(adapter.updateIssueStatus({ issueId: "I001", status: "done" })).resolves.toMatchObject({ id: "I001", status: "done" });
  });

  it("stores milestone artifacts as documents and issue artifacts as comments", async () => {
    const client = createFakeLinearClient();
    client.documents.push({
      id: "doc-existing",
      title: "M001 Requirements",
      content: formatLinearArtifactMarker({ scopeType: "milestone", scopeId: "M001", artifactType: "requirements", content: "old" }),
      updatedAt: "2026-05-06T00:00:00.000Z",
    });
    const adapter = createAdapter(client);

    await expect(adapter.writeArtifact({ scopeType: "milestone", scopeId: "M001", artifactType: "requirements", title: "Requirements", content: "# Requirements", format: "markdown" })).resolves.toMatchObject({
      scopeType: "milestone",
      scopeId: "M001",
      artifactType: "requirements",
      content: "# Requirements",
      provenance: { backend: "linear" },
    });
    await expect(adapter.readArtifact({ scopeType: "milestone", scopeId: "M001", artifactType: "requirements" })).resolves.toMatchObject({ content: "# Requirements" });
    await expect(adapter.writeArtifact({ scopeType: "slice", scopeId: "S001", artifactType: "plan", title: "Slice plan", content: "# Plan", format: "markdown" })).resolves.toMatchObject({
      scopeType: "slice",
      scopeId: "S001",
      artifactType: "plan",
      content: "# Plan",
    });
  });
});
