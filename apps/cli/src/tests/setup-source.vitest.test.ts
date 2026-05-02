import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveSkillsSource, runSetup } from "../commands/setup.js";

describe("skills source resolution", () => {
  it("uses CLI skills when running from a monorepo workspace", () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-setup-source-"));
    try {
      writeFileSync(join(tmp, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
      mkdirSync(join(tmp, "apps", "cli", "skills"), { recursive: true });

      const resolved = resolveSkillsSource(tmp);
      expect(resolved.resolution).toBe("cli-workspace");
      expect(resolved.exists).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("fails setup in monorepo when CLI skills are not built", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-setup-source-missing-"));
    try {
      writeFileSync(join(tmp, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
      mkdirSync(join(tmp, "apps", "cli"), { recursive: true });

      const result = await runSetup({
        pi: true,
        cwd: tmp,
        env: { PI_CODING_AGENT_DIR: join(tmp, "pi-agent"), GH_TOKEN: "ghp_test" },
        onboarding: {
          repoOwner: "kata-sh",
          repoName: "kata-mono",
          githubProjectNumber: 12,
        },
        interactive: false,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("SKILLS_SOURCE_MISSING");
      expect(result.error.message).toContain("apps/cli/skills");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("defaults setup to local .agents skills and bootstraps GitHub preferences", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-setup-local-"));
    try {
      writeFileSync(join(tmp, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
      mkdirSync(join(tmp, "apps", "cli", "skills", "kata-health"), { recursive: true });
      writeFileSync(join(tmp, "apps", "cli", "skills", "kata-health", "SKILL.md"), "# Kata Health\n", "utf8");

      const result = await runSetup({
        cwd: tmp,
        env: { GH_TOKEN: "ghp_test" },
        packageVersion: "9.9.9-test",
        interactive: false,
        onboarding: {
          repoOwner: "kata-sh",
          repoName: "kata-mono",
          githubProjectNumber: 12,
        },
      });

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) return;
      expect(result.mode).toBe("setup");
      expect(result.preferences?.status).toBe("created");
      expect(existsSync(join(tmp, ".kata", "preferences.md"))).toBe(true);
      expect(readFileSync(join(tmp, ".kata", "preferences.md"), "utf8")).toContain("githubProjectNumber: 12");
      expect(existsSync(join(tmp, ".agents", "skills", "kata-health", "SKILL.md"))).toBe(true);
      expect(readFileSync(join(tmp, ".gitignore"), "utf8")).toContain(".agents/skills/");
      expect(result.targets?.map((target) => target.kind)).toEqual(["local-agents"]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("can install to multiple selected skill targets", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-setup-targets-"));
    try {
      writeFileSync(join(tmp, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
      mkdirSync(join(tmp, "apps", "cli", "skills", "kata-health"), { recursive: true });
      writeFileSync(join(tmp, "apps", "cli", "skills", "kata-health", "SKILL.md"), "# Kata Health\n", "utf8");

      const result = await runSetup({
        cwd: tmp,
        env: { HOME: tmp, PI_CODING_AGENT_DIR: join(tmp, "pi-agent"), GH_TOKEN: "ghp_test" },
        packageVersion: "9.9.9-test",
        local: true,
        global: true,
        cursor: true,
        claude: true,
        pi: true,
        interactive: false,
        onboarding: {
          repoOwner: "kata-sh",
          repoName: "kata-mono",
          githubProjectNumber: 12,
        },
      });

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) return;
      expect(result.targets?.map((target) => target.kind)).toEqual([
        "local-agents",
        "global-agents",
        "cursor",
        "claude",
        "pi",
      ]);
      expect(existsSync(join(tmp, ".agents", "skills", "kata-health", "SKILL.md"))).toBe(true);
      expect(existsSync(join(tmp, ".cursor", "skills", "kata-health", "SKILL.md"))).toBe(true);
      expect(existsSync(join(tmp, ".claude", "skills", "kata-health", "SKILL.md"))).toBe(true);
      expect(existsSync(join(tmp, "pi-agent", "skills", "kata-health", "SKILL.md"))).toBe(true);
      const gitignore = readFileSync(join(tmp, ".gitignore"), "utf8");
      expect(gitignore).toContain(".agents/skills/");
      expect(gitignore).toContain(".cursor/skills/");
      expect(gitignore).toContain(".claude/skills/");
      expect(result.pi?.settingsPath).toBe(join(tmp, "pi-agent", "settings.json"));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("requires interactive setup details when preferences are missing in non-interactive mode", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-setup-noninteractive-"));
    try {
      writeFileSync(join(tmp, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
      mkdirSync(join(tmp, "apps", "cli", "skills", "kata-health"), { recursive: true });
      writeFileSync(join(tmp, "apps", "cli", "skills", "kata-health", "SKILL.md"), "# Kata Health\n", "utf8");

      const result = await runSetup({
        cwd: tmp,
        env: { GH_TOKEN: "ghp_test" },
        interactive: false,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("NON_INTERACTIVE_SETUP_REQUIRED");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
