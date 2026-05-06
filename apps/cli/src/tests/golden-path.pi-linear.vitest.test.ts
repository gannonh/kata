import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { resolveBackend } from "../backends/resolve-backend.js";
import { runDoctor } from "../commands/doctor.js";
import { runSetup } from "../commands/setup.js";
import { createKataDomainApi } from "../domain/service.js";
import { runJsonCommand } from "../transports/json.js";

function createGoldenFakeLinearClient() {
  const client = {
    graphql: vi.fn(async (request: any) => {
      if (request.query.includes("LinearKataContext")) {
        return {
          viewer: { id: "user-1" },
          organization: { id: "org-1", urlKey: "kata" },
          teams: { nodes: [{ id: "team-1", key: "KATA", name: "Kata" }], pageInfo: { hasNextPage: false, endCursor: null } },
          projects: { nodes: [{ id: "project-1", name: "Kata CLI", slugId: "kata-cli", url: "https://linear.test/project/kata-cli" }], pageInfo: { hasNextPage: false, endCursor: null } },
          workflowStates: {
            nodes: [
              { id: "state-backlog", name: "Backlog", type: "backlog" },
              { id: "state-todo", name: "Todo", type: "unstarted" },
              { id: "state-progress", name: "In Progress", type: "started" },
              { id: "state-agent", name: "Agent Review", type: "started" },
              { id: "state-human", name: "Human Review", type: "started" },
              { id: "state-merging", name: "Merging", type: "started" },
              { id: "state-done", name: "Done", type: "completed" },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        };
      }
      if (request.query.includes("LinearKataMilestones")) {
        return { project: { id: "project-1", name: "Kata CLI", milestones: { nodes: [{ id: "milestone-1", name: "M001 Linear Golden", description: '<!-- kata:entity {"kataId":"M001","type":"Milestone"} -->\nLinear golden' }], pageInfo: { hasNextPage: false, endCursor: null } } } };
      }
      if (request.query.includes("LinearKataIssues")) return { issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } };
      if (request.query.includes("LinearKataProjectDocuments")) return { project: { documents: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } };
      if (request.query.includes("LinearKataIssueComments")) return { issue: { comments: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } };
      return {};
    }),
    paginate: vi.fn(async (input: any) => {
      const data = await client.graphql({ query: input.query, variables: input.variables });
      return input.selectConnection(data)?.nodes ?? [];
    }),
  };
  return client;
}

describe("golden path: pi + linear", () => {
  it("covers setup, doctor, resolveBackend, and a linear-backed runtime json operation", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-linear-golden-"));
    const workspaceDir = join(tmp, "repo");
    const cliSkillsDir = join(workspaceDir, "apps", "cli", "skills");

    try {
      mkdirSync(join(cliSkillsDir, "kata-health"), { recursive: true });
      writeFileSync(join(workspaceDir, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
      writeFileSync(join(cliSkillsDir, "kata-health", "SKILL.md"), "# Kata Health\n", "utf8");

      const setupResult = await runSetup({
        pi: true,
        env: { PI_CODING_AGENT_DIR: join(tmp, "pi-agent"), LINEAR_API_KEY: "lin_test" } as any,
        packageVersion: "9.9.9-test",
        cwd: workspaceDir,
        interactive: false,
        onboarding: { backend: "linear", linearWorkspace: "kata", linearTeam: "KATA", linearProject: "kata-cli" },
      });
      expect(setupResult.ok).toBe(true);
      const preferences = readFileSync(join(workspaceDir, ".kata", "preferences.md"), "utf8");
      expect(preferences).toContain("mode: linear");
      expect(preferences).toContain('workspace: "kata"');
      expect(preferences).toContain('team: "KATA"');
      expect(preferences).toContain('project: "kata-cli"');

      const linearClient = createGoldenFakeLinearClient();
      const doctor = await runDoctor({
        cwd: workspaceDir,
        env: { PI_CODING_AGENT_DIR: join(tmp, "pi-agent"), LINEAR_API_KEY: "lin_test" } as any,
        packageVersion: "9.9.9-test",
        linearClient: linearClient as any,
      });
      expect(doctor.status).toBe("ok");
      expect(doctor.checks.find((check) => check.name === "linear-auth")).toMatchObject({ status: "ok" });
      expect(doctor.checks.find((check) => check.name === "linear-project")).toMatchObject({ status: "ok" });
      expect(doctor.checks.find((check) => check.name === "linear-workflow-states")).toMatchObject({ status: "ok" });

      const adapter = await resolveBackend({ workspacePath: workspaceDir, env: { LINEAR_API_KEY: "lin_test" } as any, linearClient: linearClient as any });
      const output = await runJsonCommand({ operation: "milestone.getActive", payload: {} }, createKataDomainApi(adapter));
      expect(JSON.parse(output)).toMatchObject({ ok: true, data: { id: "M001", status: "active" } });
      expect(existsSync(join(tmp, "pi-agent", "skills", "kata-health", "SKILL.md"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
