import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { runDoctor } from "../commands/doctor.js";
import type { LinearHealthClient } from "../backends/linear/client.js";

describe("runDoctor linear backend checks", () => {
  it("validates linear auth, workspace, team, project, and metadata support", async () => {
    const workspaceDir = createLinearWorkspace();
    try {
      const report = await runDoctor({
        cwd: workspaceDir,
        env: { LINEAR_API_KEY: "lin_api_test" },
        linearHealthClientFactory: () =>
          createLinearClient({
            metadataSupport: {
              kataId: true,
              parentLinks: true,
              artifactScope: true,
              verificationState: true,
              dependencyBlocking: true,
              blockedByRelations: true,
            },
          }),
      });

      expect(report.status).toBe("ok");
      expect(report.checks.find((check) => check.name === "linear-auth")?.status).toBe("ok");
      expect(report.checks.find((check) => check.name === "linear-workspace")?.status).toBe("ok");
      expect(report.checks.find((check) => check.name === "linear-team-access")?.status).toBe("ok");
      expect(report.checks.find((check) => check.name === "linear-project-access")?.status).toBe("ok");
      expect(report.checks.find((check) => check.name === "linear-metadata-support")?.status).toBe("ok");
    } finally {
      rmSync(dirname(workspaceDir), { recursive: true, force: true });
    }
  });

  it("reports missing linear credentials", async () => {
    const workspaceDir = createLinearWorkspace();
    try {
      const report = await runDoctor({
        cwd: workspaceDir,
        env: {},
      });

      expect(report.status).toBe("invalid");
      expect(report.checks.find((check) => check.name === "linear-auth")).toMatchObject({
        status: "invalid",
        message: "Linear mode requires LINEAR_API_KEY.",
      });
    } finally {
      rmSync(dirname(workspaceDir), { recursive: true, force: true });
    }
  });

  it("reports invalid credentials and missing team/project access failures", async () => {
    const workspaceDir = createLinearWorkspace();
    try {
      const invalidAuthReport = await runDoctor({
        cwd: workspaceDir,
        env: { LINEAR_API_KEY: "bad_key" },
        linearHealthClientFactory: () =>
          createLinearClient({
            onGetViewer: async () => {
              throw new Error("HTTP 401: Invalid API key");
            },
          }),
      });

      expect(invalidAuthReport.status).toBe("invalid");
      expect(invalidAuthReport.checks.find((check) => check.name === "linear-auth")?.status).toBe("invalid");

      const missingTeamReport = await runDoctor({
        cwd: workspaceDir,
        env: { LINEAR_API_KEY: "lin_api_test" },
        linearHealthClientFactory: () =>
          createLinearClient({
            onGetTeam: async () => null,
          }),
      });
      expect(missingTeamReport.status).toBe("invalid");
      expect(missingTeamReport.checks.find((check) => check.name === "linear-team-access")?.status).toBe("invalid");

      const missingProjectReport = await runDoctor({
        cwd: workspaceDir,
        env: { LINEAR_API_KEY: "lin_api_test" },
        linearHealthClientFactory: () =>
          createLinearClient({
            onGetProject: async () => null,
          }),
      });
      expect(missingProjectReport.status).toBe("invalid");
      expect(missingProjectReport.checks.find((check) => check.name === "linear-project-access")?.status).toBe("invalid");
    } finally {
      rmSync(dirname(workspaceDir), { recursive: true, force: true });
    }
  });

  it("reports missing metadata support with clear failures", async () => {
    const workspaceDir = createLinearWorkspace();
    try {
      const report = await runDoctor({
        cwd: workspaceDir,
        env: { LINEAR_API_KEY: "lin_api_test" },
        linearHealthClientFactory: () =>
          createLinearClient({
            metadataSupport: {
              kataId: true,
              parentLinks: true,
              artifactScope: true,
              verificationState: true,
              dependencyBlocking: false,
              blockedByRelations: false,
            },
          }),
      });

      expect(report.status).toBe("invalid");
      expect(report.checks.find((check) => check.name === "linear-metadata-support")).toMatchObject({
        status: "invalid",
        message: expect.stringContaining("dependency blocking support"),
      });
    } finally {
      rmSync(dirname(workspaceDir), { recursive: true, force: true });
    }
  });
});

function createLinearWorkspace(): string {
  const tmp = mkdtempSync(join(tmpdir(), "kata-linear-doctor-"));
  const workspaceDir = join(tmp, "repo");
  mkdirSync(join(workspaceDir, "apps", "cli", "skills", "kata-health"), { recursive: true });
  writeFileSync(join(workspaceDir, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
  writeFileSync(join(workspaceDir, "apps", "cli", "skills", "kata-health", "SKILL.md"), "# Kata\n", "utf8");
  mkdirSync(join(workspaceDir, ".kata"), { recursive: true });
  writeFileSync(
    join(workspaceDir, ".kata", "preferences.md"),
    `---
workflow:
  mode: linear
linear:
  teamKey: KAT
  projectSlug: 459f9835e809
---
`,
    "utf8",
  );
  return workspaceDir;
}

function createLinearClient(input: {
  onGetViewer?: LinearHealthClient["getViewer"];
  onGetTeam?: LinearHealthClient["getTeam"];
  onGetProject?: LinearHealthClient["getProject"];
  metadataSupport?: Awaited<ReturnType<LinearHealthClient["getKataMetadataSupport"]>>;
}): LinearHealthClient {
  return {
    getViewer: input.onGetViewer ?? (async () => ({
      id: "viewer-1",
      name: "Test User",
      email: "test@kata.sh",
      organization: { id: "org-1", name: "Kata" },
    })),
    getTeam: input.onGetTeam ?? (async () => ({ id: "team-1", key: "KAT", name: "Kata" })),
    getProject: input.onGetProject ?? (async () => ({
      id: "project-1",
      name: "CLI",
      slugId: "459f9835e809",
      state: "started",
      url: "https://linear.app/kata/project/cli",
    })),
    getKataMetadataSupport: async () =>
      input.metadataSupport ?? {
        kataId: true,
        parentLinks: true,
        artifactScope: true,
        verificationState: true,
        dependencyBlocking: true,
        blockedByRelations: true,
      },
  };
}
