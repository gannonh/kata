import { describe, test, expect } from "bun:test";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { fileURLToPath } from "url";

import { buildSkillBundle } from "../scripts/build-skill-bundle.js";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("buildSkillBundle", () => {
  test("renders setup + golden-path core skills with workflow and contract metadata", async () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "kata-skill-bundle-"));

    await buildSkillBundle({
      sourceRoot,
      outputDir,
    });

    const setupSkill = path.join(outputDir, "kata-setup", "SKILL.md");
    const coreSkills = [
      "kata-new-project",
      "kata-discuss-phase",
      "kata-plan-phase",
      "kata-execute-phase",
      "kata-verify-work",
      "kata-quick",
      "kata-progress",
      "kata-health",
    ];
    const planSkill = path.join(outputDir, "kata-plan-phase", "SKILL.md");

    expect(existsSync(setupSkill)).toBe(true);
    expect(readFileSync(setupSkill, "utf8")).toContain("name: kata-setup");
    expect(readFileSync(setupSkill, "utf8")).toContain("runtime_required: false");

    for (const skillName of coreSkills) {
      const skillPath = path.join(outputDir, skillName, "SKILL.md");
      expect(existsSync(skillPath)).toBe(true);
      const content = readFileSync(skillPath, "utf8");
      expect(content).toContain(`name: ${skillName}`);
      expect(content).toContain("## Canonical Workflow");
      expect(content).toContain("## Runtime Contract Operations");
      expect(content).toContain("@kata-sh/cli setup");
    }

    expect(readFileSync(planSkill, "utf8")).toContain("Source: `apps/orchestrator/kata/workflows/plan-phase.md`");
    expect(readFileSync(planSkill, "utf8")).toContain("- `artifact.write`");

    rmSync(outputDir, { recursive: true, force: true });
  });
});
