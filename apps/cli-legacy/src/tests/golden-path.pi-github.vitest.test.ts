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
    const workspaceDir = join(tmp, "workspace");
    const sourceSkillsDir = join(tmp, "source-skills");
    const agentDir = join(tmp, "pi-agent");
    const preferencesPath = join(workspaceDir, ".kata", "preferences.md");

    try {
      mkdirSync(join(sourceSkillsDir, "kata-health"), { recursive: true });
      writeFileSync(join(sourceSkillsDir, "kata-health", "SKILL.md"), "# Kata Health\n", "utf8");
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
        KATA_CLI_SKILLS_SOURCE_DIR: sourceSkillsDir,
      };

      const setupResult = await runSetup({
        pi: true,
        env,
        packageVersion: "9.9.9-test",
      });
      expect(setupResult.ok).toBe(true);
      expect(existsSync(join(agentDir, "skills", "kata-health", "SKILL.md"))).toBe(true);
      expect(existsSync(join(agentDir, PI_SETUP_MARKER_FILENAME))).toBe(true);
      expect(existsSync(join(agentDir, PI_SETTINGS_FILENAME))).toBe(true);

      const doctor = await runDoctor({
        cwd: workspaceDir,
        env,
        packageVersion: "9.9.9-test",
      });
      expect(doctor.status).toBe("ok");
      expect(doctor.harness).toBe("pi");
      expect(doctor.checks.find((check) => check.name === "skills-source")?.status).toBe("ok");
      expect(doctor.checks.find((check) => check.name === "pi-skills-dir")?.status).toBe("ok");
      expect(doctor.checks.find((check) => check.name === "pi-settings")?.status).toBe("ok");
      expect(doctor.checks.find((check) => check.name === "backend-config")?.status).toBe("ok");

      const runtimeBackend = {
        isLinearMode: false,
        documentsByScope: new Map<string, Map<string, string>>([
          ["project", new Map()],
        ]),
        deriveState: vi.fn(async () => ({
          activeMilestone: { id: "M001", title: "[M001] Golden Path" },
          activeSlice: { id: "S01" },
          phase: "executing",
          blockers: [],
        })),
        listSlices: vi.fn(async () => []),
        listTasks: vi.fn(async () => []),
        listDocuments: vi.fn(async (scope?: { issueId: string }) => {
          const scopeKey = scope?.issueId ?? "project";
          return Array.from(runtimeBackend.documentsByScope.get(scopeKey)?.keys() ?? []);
        }),
        readDocument: vi.fn(async (name: string, scope?: { issueId: string }) => {
          const scopeKey = scope?.issueId ?? "project";
          return runtimeBackend.documentsByScope.get(scopeKey)?.get(name) ?? null;
        }),
        writeDocument: vi.fn(async (name: string, content: string, scope?: { issueId: string }) => {
          const scopeKey = scope?.issueId ?? "project";
          const scopeDocs = runtimeBackend.documentsByScope.get(scopeKey) ?? new Map<string, string>();
          scopeDocs.set(name, content);
          runtimeBackend.documentsByScope.set(scopeKey, scopeDocs);
        }),
      };

      const adapter = await resolveBackend({
        workspacePath: workspaceDir,
        runtimeBackendFactory: async () => runtimeBackend as any,
      });

      const jsonOutput = await runJsonCommand(
        { operation: "milestone.getActive", payload: {} },
        createKataDomainApi(adapter),
      );
      const parsed = JSON.parse(jsonOutput);
      expect(parsed.ok).toBe(true);
      expect(parsed.data).toEqual({
        id: "M001",
        title: "[M001] Golden Path",
        goal: "[M001] Golden Path",
        status: "active",
        active: true,
      });
      expect(runtimeBackend.deriveState).toHaveBeenCalled();

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
});
