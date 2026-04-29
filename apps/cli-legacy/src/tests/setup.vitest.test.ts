import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PI_SETTINGS_FILENAME,
  PI_SETUP_MARKER_FILENAME,
  detectHarness,
  resolvePiAgentDir,
  runSetup,
} from "../commands/setup.js";
import { renderDoctorReport, runDoctor } from "../commands/doctor.js";
import { runJsonCommand } from "../transports/json.js";

describe("detectHarness", () => {
  it("prefers explicit environment hints in stable order", () => {
    expect(detectHarness({ CODEX_HOME: "/tmp/codex", PI_HOME: "/tmp/pi" })).toBe("codex");
    expect(detectHarness({ CLAUDE_CONFIG_DIR: "/tmp/claude", PI_HOME: "/tmp/pi" })).toBe("claude");
    expect(detectHarness({ CURSOR_CONFIG_HOME: "/tmp/cursor", PI_HOME: "/tmp/pi" })).toBe("cursor");
    expect(detectHarness({ PI_CODING_AGENT_DIR: "/tmp/pi-agent" })).toBe("pi");
    expect(detectHarness({ PI_CONFIG_DIR: "/tmp/pi-config" })).toBe("pi");
    expect(detectHarness({})).toBe("skills-sh");
  });
});

describe("resolvePiAgentDir", () => {
  it("resolves with explicit precedence and fallback", () => {
    expect(
      resolvePiAgentDir({
        PI_CODING_AGENT_DIR: "/tmp/custom-agent",
        PI_CONFIG_DIR: "/tmp/config",
        PI_HOME: "/tmp/pi-home",
      }),
    ).toEqual({
      path: "/tmp/custom-agent",
      resolution: "PI_CODING_AGENT_DIR",
    });

    expect(resolvePiAgentDir({ PI_CONFIG_DIR: "/tmp/config" })).toEqual({
      path: "/tmp/config/agent",
      resolution: "PI_CONFIG_DIR/agent",
    });

    expect(resolvePiAgentDir({ PI_HOME: "/tmp/pi-home" })).toEqual({
      path: "/tmp/pi-home/agent",
      resolution: "PI_HOME/agent",
    });
  });
});

describe("renderDoctorReport", () => {
  it("marks GitHub label mode as unsupported", () => {
    const report = renderDoctorReport({
      packageVersion: "1.0.0",
      backendConfigStatus: "invalid",
      backendConfigMessage: "GitHub label mode is no longer supported",
      harness: "codex",
    });

    expect(report.summary).toContain("invalid");
    expect(report.checks.find((check) => check.name === "backend-config")?.message).toContain("label mode");
  });
});

describe("runSetup --pi", () => {
  it("installs bundled skills into the pi agent dir and writes a manifest marker", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-setup-test-"));
    const sourceSkillsDir = join(tmp, "source-skills");
    const agentDir = join(tmp, "pi-agent");

    try {
      mkdirSync(join(sourceSkillsDir, "demo-skill"), { recursive: true });
      writeFileSync(join(sourceSkillsDir, "demo-skill", "SKILL.md"), "# Demo Skill\n", "utf8");

      const result = await runSetup({
        pi: true,
        packageVersion: "9.9.9-test",
        now: new Date("2026-04-27T01:02:03.000Z"),
        env: {
          PI_CODING_AGENT_DIR: agentDir,
          KATA_CLI_SKILLS_SOURCE_DIR: sourceSkillsDir,
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.mode).toBe("pi-install");
      expect(existsSync(join(agentDir, "skills", "demo-skill", "SKILL.md"))).toBe(true);
      expect(existsSync(join(agentDir, "skills", "skills"))).toBe(false);
      expect(existsSync(join(agentDir, "skills", "demo-skill", ".kata-managed-by-kata-cli"))).toBe(true);

      const markerPath = join(agentDir, PI_SETUP_MARKER_FILENAME);
      expect(existsSync(markerPath)).toBe(true);
      const marker = JSON.parse(readFileSync(markerPath, "utf8"));
      expect(marker.packageVersion).toBe("9.9.9-test");
      expect(marker.firstInstalledAt).toBe("2026-04-27T01:02:03.000Z");
      expect(marker.installedAt).toBe("2026-04-27T01:02:03.000Z");
      expect(marker.managedSkillEntries).toEqual(["demo-skill"]);

      const settingsPath = join(agentDir, PI_SETTINGS_FILENAME);
      expect(existsSync(settingsPath)).toBe(true);
      const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
      expect(settings.skills).toContain("./skills");
      expect(settings.enableSkillCommands).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("is idempotent, preserves first install timestamp, and prunes stale managed skills", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-setup-idempotent-"));
    const sourceSkillsDir = join(tmp, "source-skills");
    const agentDir = join(tmp, "pi-agent");
    const legacySkillDir = join(sourceSkillsDir, "legacy-skill");
    const userSkillDir = join(agentDir, "skills", "user-skill");

    try {
      mkdirSync(join(sourceSkillsDir, "demo-skill"), { recursive: true });
      writeFileSync(join(sourceSkillsDir, "demo-skill", "SKILL.md"), "# Demo Skill\n", "utf8");
      mkdirSync(legacySkillDir, { recursive: true });
      writeFileSync(join(legacySkillDir, "SKILL.md"), "# Legacy Skill\n", "utf8");

      const env = {
        PI_CODING_AGENT_DIR: agentDir,
        KATA_CLI_SKILLS_SOURCE_DIR: sourceSkillsDir,
      };

      const first = await runSetup({
        pi: true,
        packageVersion: "1.0.0",
        now: new Date("2026-04-27T00:00:00.000Z"),
        env,
      });
      expect(first.ok).toBe(true);
      expect(existsSync(join(agentDir, "skills", "legacy-skill", "SKILL.md"))).toBe(true);

      mkdirSync(userSkillDir, { recursive: true });
      writeFileSync(join(userSkillDir, "SKILL.md"), "# User Skill\n", "utf8");
      rmSync(legacySkillDir, { recursive: true, force: true });

      const second = await runSetup({
        pi: true,
        packageVersion: "1.0.1",
        now: new Date("2026-04-27T00:05:00.000Z"),
        env,
      });
      expect(second.ok).toBe(true);

      const markerPath = join(agentDir, PI_SETUP_MARKER_FILENAME);
      const marker = JSON.parse(readFileSync(markerPath, "utf8"));
      expect(marker.firstInstalledAt).toBe("2026-04-27T00:00:00.000Z");
      expect(marker.installedAt).toBe("2026-04-27T00:05:00.000Z");
      expect(existsSync(join(agentDir, "skills", "demo-skill", "SKILL.md"))).toBe(true);
      expect(existsSync(join(agentDir, "skills", "legacy-skill", "SKILL.md"))).toBe(false);
      expect(existsSync(join(agentDir, "skills", "user-skill", "SKILL.md"))).toBe(true);
      expect(existsSync(join(agentDir, "skills", "skills"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("ignores malformed managedSkillEntries values from an existing marker", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-setup-marker-safety-"));
    const sourceSkillsDir = join(tmp, "source-skills");
    const agentDir = join(tmp, "pi-agent");

    try {
      mkdirSync(join(sourceSkillsDir, "demo-skill"), { recursive: true });
      writeFileSync(join(sourceSkillsDir, "demo-skill", "SKILL.md"), "# Demo Skill\n", "utf8");
      mkdirSync(join(agentDir, "skills", "legacy-skill"), { recursive: true });
      writeFileSync(join(agentDir, "skills", "legacy-skill", "SKILL.md"), "# Legacy Skill\n", "utf8");
      writeFileSync(
        join(agentDir, "skills", "legacy-skill", ".kata-managed-by-kata-cli"),
        "@kata-sh/cli\n",
        "utf8",
      );
      mkdirSync(join(agentDir, "skills", "user-skill"), { recursive: true });
      writeFileSync(join(agentDir, "skills", "user-skill", "SKILL.md"), "# User Skill\n", "utf8");
      writeFileSync(
        join(agentDir, PI_SETUP_MARKER_FILENAME),
        JSON.stringify({
          schemaVersion: 1,
          firstInstalledAt: "2026-04-27T00:00:00.000Z",
          managedSkillEntries: ["", "legacy-skill", "user-skill", "../escape", 42],
        }),
        "utf8",
      );

      const result = await runSetup({
        pi: true,
        env: {
          PI_CODING_AGENT_DIR: agentDir,
          KATA_CLI_SKILLS_SOURCE_DIR: sourceSkillsDir,
        },
      });

      expect(result.ok).toBe(true);
      expect(existsSync(join(agentDir, "skills"))).toBe(true);
      expect(existsSync(join(agentDir, "skills", "demo-skill", "SKILL.md"))).toBe(true);
      expect(existsSync(join(agentDir, "skills", "legacy-skill", "SKILL.md"))).toBe(false);
      expect(existsSync(join(agentDir, "skills", "user-skill", "SKILL.md"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns machine-readable setup failure diagnostics when the skills source is missing", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-setup-failure-"));
    const missingSourceDir = join(tmp, "missing-skills");

    try {
      const result = await runSetup({
        pi: true,
        env: {
          PI_CODING_AGENT_DIR: join(tmp, "agent"),
          KATA_CLI_SKILLS_SOURCE_DIR: missingSourceDir,
        },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.mode).toBe("pi-install");
      expect(result.error.code).toBe("SKILLS_SOURCE_MISSING");
      expect(result.error.message).toContain(missingSourceDir);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("runDoctor", () => {
  it("reports actionable pi checks and backend parse status", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-doctor-test-"));
    const sourceSkillsDir = join(tmp, "source-skills");
    const workspaceDir = join(tmp, "workspace");
    const agentDir = join(tmp, "pi-agent");

    try {
      mkdirSync(join(sourceSkillsDir, "demo-skill"), { recursive: true });
      writeFileSync(join(sourceSkillsDir, "demo-skill", "SKILL.md"), "# Demo Skill\n", "utf8");
      mkdirSync(join(workspaceDir, ".kata"), { recursive: true });
      writeFileSync(
        join(workspaceDir, ".kata", "preferences.md"),
        ["---", "workflow:", "  mode: linear", "---", ""].join("\n"),
        "utf8",
      );

      const env = {
        PI_CODING_AGENT_DIR: agentDir,
        KATA_CLI_SKILLS_SOURCE_DIR: sourceSkillsDir,
      };

      const beforeSetup = await runDoctor({
        cwd: workspaceDir,
        env,
        packageVersion: "1.2.3",
      });
      expect(beforeSetup.status).toBe("invalid");
      expect(beforeSetup.harness).toBe("pi");
      expect(beforeSetup.checks.find((check) => check.name === "cli-binary")?.status).toBe("ok");
      expect(beforeSetup.checks.find((check) => check.name === "pi-skills-dir")?.status).toBe("invalid");
      expect(beforeSetup.checks.find((check) => check.name === "pi-install-marker")?.status).toBe("warn");
      expect(beforeSetup.checks.find((check) => check.name === "pi-settings")?.status).toBe("invalid");
      expect(beforeSetup.checks.find((check) => check.name === "backend-config")?.status).toBe("ok");

      await runSetup({
        pi: true,
        env,
      });

      const afterSetup = await runDoctor({
        cwd: workspaceDir,
        env,
        packageVersion: "1.2.3",
      });
      expect(afterSetup.status).toBe("ok");
      expect(afterSetup.checks.find((check) => check.name === "harness")?.status).toBe("ok");
      expect(afterSetup.checks.find((check) => check.name === "skills-source")?.status).toBe("ok");
      expect(afterSetup.checks.find((check) => check.name === "pi-skills-dir")?.status).toBe("ok");
      expect(afterSetup.checks.find((check) => check.name === "pi-install-marker")?.status).toBe("ok");
      expect(afterSetup.checks.find((check) => check.name === "pi-settings")?.status).toBe("ok");
      expect(afterSetup.checks.find((check) => check.name === "backend-config")?.status).toBe("ok");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("reports explicit backend warning when workspace config is missing", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-doctor-missing-config-"));
    const sourceSkillsDir = join(tmp, "source-skills");
    const workspaceDir = join(tmp, "workspace");

    try {
      mkdirSync(join(sourceSkillsDir, "demo-skill"), { recursive: true });
      writeFileSync(join(sourceSkillsDir, "demo-skill", "SKILL.md"), "# Demo Skill\n", "utf8");
      mkdirSync(workspaceDir, { recursive: true });

      const report = await runDoctor({
        cwd: workspaceDir,
        env: {
          CODEX_HOME: join(tmp, "codex-home"),
          KATA_CLI_SKILLS_SOURCE_DIR: sourceSkillsDir,
        },
      });

      const backendCheck = report.checks.find((check) => check.name === "backend-config");
      expect(backendCheck?.status).toBe("warn");
      expect(backendCheck?.message).toContain(".kata/preferences.md");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("runJsonCommand", () => {
  it("returns JSON for project.getContext", async () => {
    const output = await runJsonCommand(
      { operation: "project.getContext", payload: {} },
      {
        project: { getContext: async () => ({ backend: "github", workspacePath: "/tmp/repo" }) },
      } as any,
    );

    expect(output).toBe('{"ok":true,"data":{"backend":"github","workspacePath":"/tmp/repo"}}');
  });
});
