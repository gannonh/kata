import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { resolveBackend } from "../backends/resolve-backend.js";
import { runDoctor } from "../commands/doctor.js";
import { PI_SETUP_MARKER_FILENAME, PI_SETTINGS_FILENAME, runSetup } from "../commands/setup.js";
import { createKataDomainApi } from "../domain/service.js";
import { runJsonCommand } from "../transports/json.js";

describe("golden path: pi + github projects v2", () => {
  it("covers setup/doctor flow and a github-backed runtime json operation", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-golden-path-"));
    const workspaceDir = join(tmp, "repo");
    const cliSkillsDir = join(workspaceDir, "apps", "cli", "skills");
    const agentDir = join(tmp, "pi-agent");
    const preferencesPath = join(workspaceDir, ".kata", "preferences.md");

    try {
      mkdirSync(workspaceDir, { recursive: true });
      writeFileSync(join(workspaceDir, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
      execFileSync("git", ["init"], { cwd: workspaceDir, stdio: "ignore" });
      execFileSync("git", ["remote", "add", "origin", "https://github.com/kata-sh/kata-mono.git"], { cwd: workspaceDir, stdio: "ignore" });
      mkdirSync(join(cliSkillsDir, "kata-health"), { recursive: true });
      writeFileSync(join(cliSkillsDir, "kata-health", "SKILL.md"), "# Kata Health\n", "utf8");
      mkdirSync(join(workspaceDir, ".kata"), { recursive: true });
      writeFileSync(
        preferencesPath,
        `---
workflow:
  mode: github
github:
  repoOwner: kata-sh
  repoName: kata-mono
  stateMode: projects_v2
  githubProjectNumber: 12
---
`,
        "utf8",
      );

      const env = {
        PI_CODING_AGENT_DIR: agentDir,
        GH_TOKEN: "ghp_test",
      };

      const setupResult = await runSetup({
        pi: true,
        env,
        packageVersion: "9.9.9-test",
        cwd: workspaceDir,
      });
      expect(setupResult.ok).toBe(true);
      expect(existsSync(join(agentDir, "skills", "kata-health", "SKILL.md"))).toBe(true);
      expect(existsSync(join(agentDir, PI_SETUP_MARKER_FILENAME))).toBe(true);
      expect(existsSync(join(agentDir, PI_SETTINGS_FILENAME))).toBe(true);

      const githubClient = createGoldenFakeGithubClient();

      const doctor = await runDoctor({
        cwd: workspaceDir,
        env,
        packageVersion: "9.9.9-test",
        githubClients: githubClient as any,
      });
      expect(doctor.status).toBe("ok");
      expect(doctor.harness).toBe("pi");
      expect(doctor.checks.find((check) => check.name === "kata-skills")?.status).toBe("ok");
      expect(doctor.checks.find((check) => check.name === "pi-skills-dir")?.status).toBe("ok");
      expect(doctor.checks.find((check) => check.name === "pi-settings")?.status).toBe("ok");
      expect(doctor.checks.find((check) => check.name === "backend-config")?.status).toBe("ok");
      expect(doctor.checks.find((check) => check.name === "github-auth")).toMatchObject({ status: "ok" });
      expect(doctor.checks.find((check) => check.name === "github-project-fields")).toMatchObject({ status: "ok" });

      const adapter = await resolveBackend({
        workspacePath: workspaceDir,
        githubClients: githubClient as any,
      });

      const createdMilestoneOutput = await runJsonCommand(
        {
          operation: "milestone.create",
          payload: {
            title: "Golden Path",
            goal: "Real GitHub backend validation",
          },
        },
        createKataDomainApi(adapter),
      );
      expect(JSON.parse(createdMilestoneOutput)).toMatchObject({
        ok: true,
        data: {
          id: "M001",
          title: "Golden Path",
          goal: "Real GitHub backend validation",
          status: "active",
          active: true,
        },
      });

      const jsonOutput = await runJsonCommand(
        { operation: "milestone.getActive", payload: {} },
        createKataDomainApi(adapter),
      );
      const parsed = JSON.parse(jsonOutput);
      expect(parsed.ok).toBe(true);
      expect(parsed.data).toEqual({
        id: "M001",
        title: "Golden Path",
        goal: "Real GitHub backend validation",
        status: "active",
        active: true,
      });

      const contextOutput = await runJsonCommand(
        { operation: "project.getContext", payload: {} },
        createKataDomainApi(adapter),
      );
      expect(JSON.parse(contextOutput)).toEqual({
        ok: true,
        data: {
          backend: "github",
          workspacePath: workspaceDir,
          repository: {
            owner: "kata-sh",
            name: "kata-mono",
          },
        },
      });

      await runJsonCommand(
        {
          operation: "project.upsert",
          payload: {
            title: "Golden Project",
            description: "GitHub Projects v2 project tracking issue",
          },
        },
        createKataDomainApi(adapter),
      );

      const artifactWriteOutput = await runJsonCommand(
        {
          operation: "artifact.write",
          payload: {
            scopeType: "project",
            scopeId: "PROJECT",
            artifactType: "roadmap",
            title: "PROJECT-ROADMAP",
            content: "Golden path runtime artifact validation",
            format: "markdown",
          },
        },
        createKataDomainApi(adapter),
      );
      const parsedWrite = JSON.parse(artifactWriteOutput);
      expect(parsedWrite.ok).toBe(true);
      expect(parsedWrite.data.scopeType).toBe("project");
      expect(parsedWrite.data.artifactType).toBe("roadmap");
      expect(parsedWrite.data.content).toContain("Golden path runtime artifact validation");

      const artifactReadOutput = await runJsonCommand(
        {
          operation: "artifact.read",
          payload: {
            scopeType: "project",
            scopeId: "PROJECT",
            artifactType: "roadmap",
          },
        },
        createKataDomainApi(adapter),
      );
      const parsedRead = JSON.parse(artifactReadOutput);
      expect(parsedRead.ok).toBe(true);
      expect(parsedRead.data.content).toContain("Golden path runtime artifact validation");

      const settings = JSON.parse(readFileSync(join(agentDir, PI_SETTINGS_FILENAME), "utf8"));
      expect(settings.skills).toContain("./skills");
      expect(settings.enableSkillCommands).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("reports missing GitHub token as invalid without contacting GitHub", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-golden-path-"));
    const workspaceDir = join(tmp, "repo");

    try {
      mkdirSync(join(workspaceDir, ".kata"), { recursive: true });
      execFileSync("git", ["init"], { cwd: workspaceDir, stdio: "ignore" });
      execFileSync("git", ["remote", "add", "origin", "https://github.com/kata-sh/kata-mono.git"], { cwd: workspaceDir, stdio: "ignore" });
      mkdirSync(join(workspaceDir, "apps", "cli", "skills", "kata-health"), { recursive: true });
      writeFileSync(join(workspaceDir, "apps", "cli", "skills", "kata-health", "SKILL.md"), "# Kata\n");
      writeFileSync(
        join(workspaceDir, ".kata", "preferences.md"),
        `---
workflow:
  mode: github
github:
  repoOwner: kata-sh
  repoName: kata-mono
  stateMode: projects_v2
  githubProjectNumber: 12
---
`,
        "utf8",
      );

      const doctor = await runDoctor({
        cwd: workspaceDir,
        env: { PI_CODING_AGENT_DIR: join(tmp, "pi-agent") },
        packageVersion: "9.9.9-test",
      });

      expect(doctor.status).toBe("invalid");
      expect(doctor.checks.find((check) => check.name === "github-auth")).toMatchObject({
        status: "invalid",
        action: "Run `gh auth login` or set GITHUB_TOKEN/GH_TOKEN with access to the configured GitHub Project v2.",
      });
      expect(doctor.checks.find((check) => check.name === "github-project-fields")).toBeUndefined();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("accepts GH_TOKEN when GITHUB_TOKEN is empty", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-golden-path-"));
    const workspaceDir = join(tmp, "repo");

    try {
      mkdirSync(join(workspaceDir, ".kata"), { recursive: true });
      execFileSync("git", ["init"], { cwd: workspaceDir, stdio: "ignore" });
      execFileSync("git", ["remote", "add", "origin", "https://github.com/kata-sh/kata-mono.git"], { cwd: workspaceDir, stdio: "ignore" });
      mkdirSync(join(workspaceDir, "apps", "cli", "skills", "kata-health"), { recursive: true });
      writeFileSync(join(workspaceDir, "apps", "cli", "skills", "kata-health", "SKILL.md"), "# Kata\n");
      writeFileSync(
        join(workspaceDir, ".kata", "preferences.md"),
        `---
workflow:
  mode: github
github:
  repoOwner: kata-sh
  repoName: kata-mono
  stateMode: projects_v2
  githubProjectNumber: 12
---
`,
        "utf8",
      );

      const doctor = await runDoctor({
        cwd: workspaceDir,
        env: {
          GITHUB_TOKEN: "  ",
          GH_TOKEN: "ghp_test",
        },
        packageVersion: "9.9.9-test",
        githubClients: createGoldenFakeGithubClient() as any,
      });

      expect(doctor.status).toBe("ok");
      expect(doctor.checks.find((check) => check.name === "kata-skills")?.status).toBe("ok");
      expect(doctor.checks.find((check) => check.name === "github-auth")).toMatchObject({ status: "ok" });
      expect(doctor.checks.find((check) => check.name === "github-project-fields")).toMatchObject({ status: "ok" });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

function createGoldenFakeGithubClient() {
  const issues: any[] = [];
  const commentsByIssue = new Map<number, any[]>();
  let nextIssueNumber = 1;
  let nextProjectItemNumber = 1;
  let nextCommentId = 1;

  return {
    graphql: vi.fn(async (request: any) => {
      if (request.query.includes("LoadKataProjectFields")) {
        return {
          organization: {
            projectV2: {
              id: "project-id",
              fields: {
                nodes: [
                  { id: "status-field-id", name: "Status", options: validStatusOptions() },
                  { id: "kata-type-field-id", name: "Kata Type", dataType: "TEXT" },
                  { id: "kata-id-field-id", name: "Kata ID", dataType: "TEXT" },
                  { id: "kata-parent-id-field-id", name: "Kata Parent ID", dataType: "TEXT" },
                  { id: "kata-artifact-scope-field-id", name: "Kata Artifact Scope", dataType: "TEXT" },
                  { id: "kata-verification-state-field-id", name: "Kata Verification State", dataType: "TEXT" },
                ],
              },
            },
          },
        };
      }
      if (request.query.includes("addProjectV2ItemById")) {
        return {
          addProjectV2ItemById: {
            item: { id: `project-item-${nextProjectItemNumber++}` },
          },
        };
      }
      return { updateProjectV2ItemFieldValue: { projectV2Item: { id: request.variables.itemId } } };
    }),
    rest: vi.fn(async (request: any) => {
      if (request.method === "GET" && request.path.startsWith("/repos/kata-sh/kata-mono/issues?")) {
        const page = Number(new URL(`https://example.test${request.path}`).searchParams.get("page") ?? "1");
        return page === 1 ? issues : [];
      }

      const commentsMatch = request.path.match(/^\/repos\/kata-sh\/kata-mono\/issues\/(\d+)\/comments(?:\?.*)?$/);
      if (request.method === "GET" && commentsMatch) {
        return commentsByIssue.get(Number(commentsMatch[1])) ?? [];
      }
      if (request.method === "POST" && commentsMatch) {
        const issueNumber = Number(commentsMatch[1]);
        const comment = { id: nextCommentId++, body: request.body.body };
        commentsByIssue.set(issueNumber, [...(commentsByIssue.get(issueNumber) ?? []), comment]);
        return comment;
      }

      if (request.method === "POST" && request.path === "/repos/kata-sh/kata-mono/issues") {
        const number = nextIssueNumber++;
        const issue = {
          id: number,
          node_id: `issue-node-${number}`,
          number,
          title: request.body.title,
          body: request.body.body,
          state: "open",
          html_url: `https://github.test/kata-sh/kata-mono/issues/${number}`,
        };
        issues.push(issue);
        return issue;
      }

      if (request.method === "POST" && request.path === "/repos/kata-sh/kata-mono/milestones") {
        return { number: 1, title: request.body.title, description: request.body.description, state: "open" };
      }

      if (request.method === "PATCH") {
        return request.body;
      }

      throw new Error(`Unhandled fake GitHub request: ${request.method} ${request.path}`);
    }),
  };
}

function validStatusOptions() {
  return [
    { id: "status-backlog", name: "Backlog" },
    { id: "status-todo", name: "Todo" },
    { id: "status-in-progress", name: "In Progress" },
    { id: "status-agent-review", name: "Agent Review" },
    { id: "status-human-review", name: "Human Review" },
    { id: "status-merging", name: "Merging" },
    { id: "status-done", name: "Done" },
  ];
}
