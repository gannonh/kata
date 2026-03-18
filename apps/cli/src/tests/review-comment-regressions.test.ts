import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { LinearClient } from "../resources/extensions/linear/linear-client.ts";
import { registerLinearTools } from "../resources/extensions/linear/linear-tools.ts";

const projectRoot = join(fileURLToPath(import.meta.url), "..", "..", "..");

type RegisteredTool = {
  name: string;
  parameters: {
    properties?: Record<string, unknown>;
  };
  execute: (_id?: string, params?: Record<string, unknown>) => Promise<unknown>;
};

function registerTools(client: Record<string, unknown>): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();
  const pi = {
    registerTool(tool: RegisteredTool) {
      tools.set(tool.name, tool);
    },
  };
  registerLinearTools(pi as never, client as never);
  return tools;
}

test("LinearClient.listIssues normalizes label connections", async () => {
  const client = new LinearClient("test-key");
  (client as unknown as { graphql: unknown }).graphql = async () => ({
    issues: {
      nodes: [
        {
          id: "issue-1",
          identifier: "KAT-1",
          title: "Test issue",
          priority: 0,
          url: "https://example.com/issues/1",
          state: {
            id: "state-1",
            name: "Todo",
            type: "unstarted",
            color: "#000000",
            position: 0,
          },
          assignee: null,
          labels: {
            nodes: [
              {
                id: "label-1",
                name: "Bug",
                color: "#ff0000",
                isGroup: false,
              },
            ],
          },
          parent: null,
          children: { nodes: [] },
          project: null,
          projectMilestone: null,
          createdAt: "2026-03-12T00:00:00Z",
          updatedAt: "2026-03-12T00:00:00Z",
        },
      ],
      pageInfo: {
        hasNextPage: false,
        endCursor: null,
      },
    },
  });

  const issues = await client.listIssues({ first: 1 });

  assert.deepEqual(issues[0].labels, [
    {
      id: "label-1",
      name: "Bug",
      color: "#ff0000",
      isGroup: false,
    },
  ]);
});

test("Linear list tools preserve explicit first=0 filters", async () => {
  const calls: Array<{ name: string; params: unknown }> = [];
  const tools = registerTools({
    listTeams: async () => [],
    getTeam: async () => null,
    createProject: async () => ({}),
    getProject: async () => null,
    listProjects: async (params?: unknown) => {
      calls.push({ name: "projects", params });
      return [];
    },
    updateProject: async () => ({}),
    deleteProject: async () => true,
    createMilestone: async () => ({}),
    getMilestone: async () => null,
    listMilestones: async () => [],
    updateMilestone: async () => ({}),
    deleteMilestone: async () => true,
    createIssue: async () => ({}),
    getIssue: async () => null,
    listIssues: async () => [],
    updateIssue: async () => ({}),
    deleteIssue: async () => true,
    listWorkflowStates: async () => [],
    createLabel: async () => ({}),
    getLabel: async () => null,
    listLabels: async () => [],
    updateLabel: async () => ({}),
    deleteLabel: async () => true,
    ensureLabel: async () => ({}),
    createDocument: async () => ({}),
    getDocument: async () => null,
    listDocuments: async (params?: unknown) => {
      calls.push({ name: "documents", params });
      return [];
    },
    updateDocument: async () => ({}),
    deleteDocument: async () => true,
    getViewer: async () => ({}),
  });

  await tools.get("linear_list_projects")!.execute(undefined, { first: 0 });
  await tools.get("linear_list_documents")!.execute(undefined, { first: 0 });

  assert.deepEqual(calls, [
    { name: "projects", params: { first: 0 } },
    { name: "documents", params: { first: 0 } },
  ]);
});

test("linear_update_issue schema constrains priority to the Linear domain", () => {
  const tools = registerTools({
    listTeams: async () => [],
    getTeam: async () => null,
    createProject: async () => ({}),
    getProject: async () => null,
    listProjects: async () => [],
    updateProject: async () => ({}),
    deleteProject: async () => true,
    createMilestone: async () => ({}),
    getMilestone: async () => null,
    listMilestones: async () => [],
    updateMilestone: async () => ({}),
    deleteMilestone: async () => true,
    createIssue: async () => ({}),
    getIssue: async () => null,
    listIssues: async () => [],
    updateIssue: async () => ({}),
    deleteIssue: async () => true,
    listWorkflowStates: async () => [],
    createLabel: async () => ({}),
    getLabel: async () => null,
    listLabels: async () => [],
    updateLabel: async () => ({}),
    deleteLabel: async () => true,
    ensureLabel: async () => ({}),
    createDocument: async () => ({}),
    getDocument: async () => null,
    listDocuments: async () => [],
    updateDocument: async () => ({}),
    deleteDocument: async () => true,
    getViewer: async () => ({}),
  });

  const prioritySchema = tools.get("linear_update_issue")!.parameters.properties!
    .priority as { type?: string; minimum?: number; maximum?: number };

  assert.equal(prioritySchema.type, "integer");
  assert.equal(prioritySchema.minimum, 0);
  assert.equal(prioritySchema.maximum, 4);
});

test("Kata auto-start prompt does not duplicate the manual deferral path", () => {
  const source = readFileSync(
    join(projectRoot, "src", "resources", "extensions", "kata", "guided-flow.ts"),
    "utf-8",
  );
  const promptStart = source.indexOf("const choice = await showNextAction(ctx as any, {");
  const promptEnd = source.indexOf("if (choice === \"auto\")", promptStart);
  const promptBlock = source.slice(promptStart, promptEnd);

  assert.equal((promptBlock.match(/id: "manual"/g) ?? []).length, 0);
  assert.match(
    promptBlock,
    /notYetMessage: "Continue manually\. Run \/kata auto when ready\."/,
  );
});
