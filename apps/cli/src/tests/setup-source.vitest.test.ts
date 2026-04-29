import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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
        env: { PI_CODING_AGENT_DIR: join(tmp, "pi-agent") },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("SKILLS_SOURCE_MISSING");
      expect(result.error.message).toContain("apps/cli/skills");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
